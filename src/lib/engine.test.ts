import { describe, it, expect } from "vitest";
import { computeSchedule } from "./engine";
import { emptyPlan } from "./defaults";
import { STATUS } from "./semantics";
import type { PlanState } from "./types";

// 2026-01-05 is a Monday.
const MONDAY = "2026-01-05";

function planWith(mut: (p: PlanState) => void): PlanState {
  const p = emptyPlan();
  mut(p);
  return p;
}

function tm(id: string, days = 5) {
  return { id, name: id, workingDaysPerWeek: days, roleOptionId: "role_eng", timeOff: [], createdAt: MONDAY };
}
function pr(id: string, effort: number, status = STATUS.ACTIVE) {
  return {
    id, name: id, effortDays: effort, daysRemaining: effort,
    statusOptionId: status, insertion: "preempt" as const, archived: false, createdAt: MONDAY,
  };
}

describe("scheduling engine — acceptance criteria", () => {
  it("1 teammate @5d/wk on a 10-day project starting Monday lands Friday of week 2", () => {
    const plan = planWith((p) => {
      p.teammates = [tm("ada")];
      p.projects = [pr("big", 10)];
      p.assignments = [{ id: "a1", teammateId: "ada", projectId: "big", allocationPct: 100 }];
    });
    const r = computeSchedule(plan, MONDAY);
    expect(r.projects["big"].kind).toBe("scheduled");
    expect(r.projects["big"].completionDate).toBe("2026-01-16"); // Friday, week 2
  });

  it("adding a higher-priority 5-day project pushes the 10-day project out one full week", () => {
    const plan = planWith((p) => {
      p.teammates = [tm("ada")];
      // priority order: index 0 = top. The 5-day project is higher priority.
      p.projects = [pr("small", 5), pr("big", 10)];
      p.assignments = [
        { id: "a1", teammateId: "ada", projectId: "small", allocationPct: 100 },
        { id: "a2", teammateId: "ada", projectId: "big", allocationPct: 100 },
      ];
    });
    const r = computeSchedule(plan, MONDAY);
    expect(r.projects["small"].completionDate).toBe("2026-01-09"); // Friday, week 1
    expect(r.projects["big"].completionDate).toBe("2026-01-23"); // one week later than 01-16
  });
});

describe("scheduling engine — capacity behavior", () => {
  it("allocation % lets two projects run in parallel", () => {
    const plan = planWith((p) => {
      p.teammates = [tm("ada")];
      p.projects = [pr("x", 5), pr("y", 5)];
      p.assignments = [
        { id: "a1", teammateId: "ada", projectId: "x", allocationPct: 50 },
        { id: "a2", teammateId: "ada", projectId: "y", allocationPct: 50 },
      ];
    });
    const r = computeSchedule(plan, MONDAY);
    // each gets 0.5/day ⇒ 10 business days ⇒ 2026-01-16
    expect(r.projects["x"].completionDate).toBe("2026-01-16");
    expect(r.projects["y"].completionDate).toBe("2026-01-16");
  });

  it("part-time availability slows a project proportionally", () => {
    const plan = planWith((p) => {
      p.teammates = [tm("grace", 5)];
      p.projects = [pr("proj", 10)];
      p.assignments = [{ id: "a1", teammateId: "grace", projectId: "proj", allocationPct: 100 }];
    });
    const full = computeSchedule(plan, MONDAY).projects["proj"].completionDate;
    plan.teammates[0].workingDaysPerWeek = 3; // 0.6/day ⇒ slower
    const part = computeSchedule(plan, MONDAY).projects["proj"].completionDate;
    expect(part! > full!).toBe(true);
  });

  it("time off subtracts capacity and delays completion", () => {
    const base = planWith((p) => {
      p.teammates = [tm("ada")];
      p.projects = [pr("proj", 10)];
      p.assignments = [{ id: "a1", teammateId: "ada", projectId: "proj", allocationPct: 100 }];
    });
    const before = computeSchedule(base, MONDAY).projects["proj"].completionDate;
    base.teammates[0].timeOff = [{ id: "t1", start: "2026-01-07", end: "2026-01-09" }]; // 3 business days out
    const after = computeSchedule(base, MONDAY).projects["proj"].completionDate;
    expect(after! > before!).toBe(true);
  });

  it("on-hold projects release capacity to lower-priority work", () => {
    const plan = planWith((p) => {
      p.teammates = [tm("ada")];
      p.projects = [pr("held", 5, STATUS.ONHOLD), pr("active", 10)];
      p.assignments = [
        { id: "a1", teammateId: "ada", projectId: "held", allocationPct: 100 },
        { id: "a2", teammateId: "ada", projectId: "active", allocationPct: 100 },
      ];
    });
    const r = computeSchedule(plan, MONDAY);
    expect(r.projects["held"].kind).toBe("on-hold");
    // 'active' behaves as if it were alone ⇒ Friday of week 2
    expect(r.projects["active"].completionDate).toBe("2026-01-16");
  });

  it("spare-capacity projects wait behind preempting work regardless of list order", () => {
    const plan = planWith((p) => {
      p.teammates = [tm("ada")];
      const spare = pr("spare", 5);
      spare.insertion = "spare";
      // spare is listed FIRST but should still run after the preempting project
      p.projects = [spare, pr("main", 5)];
      p.assignments = [
        { id: "a1", teammateId: "ada", projectId: "spare", allocationPct: 100 },
        { id: "a2", teammateId: "ada", projectId: "main", allocationPct: 100 },
      ];
    });
    const r = computeSchedule(plan, MONDAY);
    expect(r.projects["main"].completionDate).toBe("2026-01-09"); // week 1
    expect(r.projects["spare"].completionDate).toBe("2026-01-16"); // waited a week
  });
});

describe("scheduling engine — edge states", () => {
  it("flags unstaffed projects with no date", () => {
    const plan = planWith((p) => {
      p.projects = [pr("lonely", 5)];
    });
    const r = computeSchedule(plan, MONDAY);
    expect(r.projects["lonely"].kind).toBe("unstaffed");
    expect(r.projects["lonely"].completionDate).toBeUndefined();
  });

  it("flags projects with no estimate", () => {
    const plan = planWith((p) => {
      p.teammates = [tm("ada")];
      p.projects = [pr("vague", 0)];
      p.assignments = [{ id: "a1", teammateId: "ada", projectId: "vague", allocationPct: 100 }];
    });
    const r = computeSchedule(plan, MONDAY);
    expect(r.projects["vague"].kind).toBe("needs-estimate");
  });

  it("detects teammate over-allocation across active projects", () => {
    const plan = planWith((p) => {
      p.teammates = [tm("ada")];
      p.projects = [pr("x", 5), pr("y", 5)];
      p.assignments = [
        { id: "a1", teammateId: "ada", projectId: "x", allocationPct: 80 },
        { id: "a2", teammateId: "ada", projectId: "y", allocationPct: 80 },
      ];
    });
    const r = computeSchedule(plan, MONDAY);
    expect(r.teammates["ada"].overAllocated).toBe(true);
    expect(r.overAllocatedProjectIds.has("x")).toBe(true);
    expect(r.overAllocatedProjectIds.has("y")).toBe(true);
  });

  it("marks a project overdue when its committed target has passed", () => {
    const plan = planWith((p) => {
      p.teammates = [tm("ada")];
      const proj = pr("late", 5);
      proj.targetDate = "2026-01-01"; // before 'today'
      p.projects = [proj];
      p.assignments = [{ id: "a1", teammateId: "ada", projectId: "late", allocationPct: 100 }];
    });
    const r = computeSchedule(plan, MONDAY);
    expect(r.projects["late"].overdue).toBe(true);
  });
});
