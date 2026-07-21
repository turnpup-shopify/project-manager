// ---------------------------------------------------------------------------
// Scheduling engine — the single source of truth for capacity math.
//
// Design goals (from the spec):
//  - Pure function, no I/O, no dependence on the store. Easy to unit-test and
//    to wrap later for confidence ranges (optimistic/likely/pessimistic).
//  - Deterministic business-day simulation (weekends skipped).
//  - Priority-first allocation: a teammate's daily capacity flows to their
//    highest-priority assigned project first; lower-priority work queues behind.
//  - Allocation % caps how much of a teammate's day a project may take, which
//    is what lets two projects run in parallel (e.g. 50/50) when desired.
//
// The plan.projects array order *is* the priority ranking (index 0 = top).
// ---------------------------------------------------------------------------

import type { PlanState, ISODate, Project } from "./types";
import { STATUS } from "./semantics";
import {
  addDays,
  compareISO,
  isWithinRange,
  maxISO,
  nextBusinessDay,
  todayISO,
} from "./date";

const EPS = 1e-9;
const MAX_BUSINESS_DAYS = 8000; // ~30 years — hard stop against runaway loops
const STALL_LIMIT = 40; // consecutive zero-progress business days ⇒ deadlock

export type ScheduleKind =
  | "scheduled" // has a projected completion date
  | "done" // marked Done — out of forecast
  | "on-hold" // capacity released, keeps its slot
  | "unstaffed" // no assignees
  | "needs-estimate" // effort missing / zero
  | "no-capacity"; // staffed but assignees have no working capacity

export interface ProjectSchedule {
  projectId: string;
  kind: ScheduleKind;
  startDate?: ISODate; // first business day work is applied
  completionDate?: ISODate; // forward projection
  overdue: boolean; // committed target passed without completion
  daysRemaining: number;
}

export interface TeammateLoad {
  teammateId: string;
  /** Sum of allocation % across the teammate's *active/schedulable* projects. */
  totalAllocationPct: number;
  overAllocated: boolean;
}

export interface ScheduleResult {
  projects: Record<string, ProjectSchedule>;
  teammates: Record<string, TeammateLoad>;
  /** projectIds that are over-allocated by virtue of a shared over-loaded teammate. */
  overAllocatedProjectIds: Set<string>;
  computedAt: ISODate;
}

function isSchedulable(p: Project): boolean {
  return (
    !p.archived &&
    p.statusOptionId !== STATUS.DONE &&
    p.statusOptionId !== STATUS.ONHOLD &&
    p.effortDays > 0
  );
}

function dailyCapacity(workingDaysPerWeek: number): number {
  // Fraction of a full business day a teammate contributes on an average
  // business day. 5 days/wk ⇒ 1.0; 3 days/wk ⇒ 0.6.
  return Math.max(0, Math.min(7, workingDaysPerWeek)) / 5;
}

export function computeSchedule(plan: PlanState, todayOverride?: ISODate): ScheduleResult {
  const today = todayOverride ?? todayISO();
  const start = nextBusinessDay(today);

  const result: ScheduleResult = {
    projects: {},
    teammates: {},
    overAllocatedProjectIds: new Set(),
    computedAt: today,
  };

  // --- Classify projects & seed the simulation ------------------------------
  const priorityIndex = new Map<string, number>();
  plan.projects.forEach((p, i) => priorityIndex.set(p.id, i));

  const assignmentsByProject = new Map<string, typeof plan.assignments>();
  const assignmentsByTeammate = new Map<string, typeof plan.assignments>();
  for (const a of plan.assignments) {
    (assignmentsByProject.get(a.projectId) ?? assignmentsByProject.set(a.projectId, []).get(a.projectId)!).push(a);
    (assignmentsByTeammate.get(a.teammateId) ?? assignmentsByTeammate.set(a.teammateId, []).get(a.teammateId)!).push(a);
  }

  const remaining = new Map<string, number>();
  const startedOn = new Map<string, ISODate>();
  const completedOn = new Map<string, ISODate>();

  for (const p of plan.projects) {
    const assignees = assignmentsByProject.get(p.id) ?? [];
    if (p.archived) {
      result.projects[p.id] = base(p, "done"); // archived render handled by UI; treat as out
      continue;
    }
    if (p.statusOptionId === STATUS.DONE) {
      result.projects[p.id] = { ...base(p, "done"), completionDate: p.completedAt };
      continue;
    }
    if (p.statusOptionId === STATUS.ONHOLD) {
      result.projects[p.id] = base(p, "on-hold");
      continue;
    }
    if (p.effortDays <= 0) {
      result.projects[p.id] = base(p, "needs-estimate");
      continue;
    }
    if (assignees.length === 0) {
      result.projects[p.id] = base(p, "unstaffed");
      continue;
    }
    if (p.daysRemaining <= EPS) {
      // work is complete but not yet marked Done — lands today
      result.projects[p.id] = { ...base(p, "scheduled"), startDate: today, completionDate: today };
      continue;
    }
    remaining.set(p.id, p.daysRemaining);
  }

  // Walk order for capacity within a single teammate-day: priority order,
  // but "spare capacity only" projects are served after all preempting ones.
  const walkOrder = plan.projects
    .filter((p) => remaining.has(p.id))
    .slice()
    .sort((a, b) => {
      const sa = a.insertion === "spare" ? 1 : 0;
      const sb = b.insertion === "spare" ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return priorityIndex.get(a.id)! - priorityIndex.get(b.id)!;
    });

  // --- Business-day simulation ----------------------------------------------
  let cursor = start;
  let stall = 0;
  let iterations = 0;

  while (remaining.size > 0 && iterations < MAX_BUSINESS_DAYS) {
    iterations += 1;
    let progressed = false;

    for (const teammate of plan.teammates) {
      const mine = assignmentsByTeammate.get(teammate.id);
      if (!mine || mine.length === 0) continue;

      // capacity for this day, zeroed during time off
      const onTimeOff = teammate.timeOff.some((r) => isWithinRange(cursor, r.start, r.end));
      const capacity = onTimeOff ? 0 : dailyCapacity(teammate.workingDaysPerWeek);
      if (capacity <= EPS) continue;

      let budget = capacity;
      const allocByProject = new Map<string, number>();
      for (const a of mine) allocByProject.set(a.projectId, a.allocationPct);

      for (const proj of walkOrder) {
        if (budget <= EPS) break;
        const rem = remaining.get(proj.id);
        if (rem === undefined || rem <= EPS) continue;
        const allocPct = allocByProject.get(proj.id);
        if (allocPct === undefined) continue; // teammate not on this project
        if (proj.earliestStart && compareISO(cursor, proj.earliestStart) < 0) continue;

        const cap = (allocPct / 100) * capacity; // max share of the day for this project
        const give = Math.min(cap, budget, rem);
        if (give <= EPS) continue;

        const newRem = rem - give;
        budget -= give;
        progressed = true;
        if (!startedOn.has(proj.id)) startedOn.set(proj.id, cursor);

        if (newRem <= EPS) {
          completedOn.set(proj.id, cursor); // finishes same business day (spec rounding)
          remaining.delete(proj.id);
        } else {
          remaining.set(proj.id, newRem);
        }
      }
    }

    if (progressed) stall = 0;
    else stall += 1;
    if (stall >= STALL_LIMIT) break; // deadlock: no capacity can advance the work

    cursor = nextBusinessDay(addDays(cursor, 1));
  }

  // Anything still remaining had no capacity to complete it.
  for (const p of plan.projects) {
    if (result.projects[p.id]) continue; // already classified above
    if (remaining.has(p.id)) {
      result.projects[p.id] = base(p, "no-capacity");
    } else {
      const s = base(p, "scheduled");
      s.startDate = startedOn.get(p.id);
      s.completionDate = completedOn.get(p.id);
      s.overdue = isOverdue(p, today);
      result.projects[p.id] = s;
    }
  }

  // --- Teammate load / over-allocation --------------------------------------
  for (const t of plan.teammates) {
    const mine = assignmentsByTeammate.get(t.id) ?? [];
    let total = 0;
    const activeProjectIds: string[] = [];
    for (const a of mine) {
      const proj = plan.projects.find((p) => p.id === a.projectId);
      if (proj && isSchedulable(proj)) {
        total += a.allocationPct;
        activeProjectIds.push(proj.id);
      }
    }
    const over = total > 100 + EPS;
    result.teammates[t.id] = {
      teammateId: t.id,
      totalAllocationPct: total,
      overAllocated: over,
    };
    if (over) activeProjectIds.forEach((id) => result.overAllocatedProjectIds.add(id));
  }

  return result;
}

function base(p: Project, kind: ScheduleKind): ProjectSchedule {
  return { projectId: p.id, kind, overdue: false, daysRemaining: p.daysRemaining };
}

function isOverdue(p: Project, today: ISODate): boolean {
  if (!p.targetDate) return false;
  if (p.statusOptionId === STATUS.DONE || p.archived) return false;
  return compareISO(today, p.targetDate) > 0;
}

// Re-export for convenience
export { maxISO };
