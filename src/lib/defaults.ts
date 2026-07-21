import type { PlanState, SchemaField, Teammate } from "./types";
import { STATUS, ROLE } from "./semantics";
import { todayISO, addDays } from "./date";
import { uid } from "./id";

export function defaultStatusField(): SchemaField {
  return {
    id: "status",
    label: "Status",
    options: [
      { id: STATUS.PLANNED, label: "Planned", color: "#64748b" },
      { id: STATUS.ACTIVE, label: "Active", color: "#2563eb" },
      { id: STATUS.ONHOLD, label: "On hold", color: "#d97706" },
      { id: STATUS.DONE, label: "Done", color: "#16a34a" },
    ],
  };
}

export function defaultRoleField(): SchemaField {
  return {
    id: "role",
    label: "Role",
    options: [
      { id: ROLE.ENG, label: "Eng", color: "#7c3aed" },
      { id: ROLE.DESIGN, label: "Design", color: "#db2777" },
      { id: ROLE.PM, label: "PM", color: "#0891b2" },
    ],
  };
}

export function emptyPlan(): PlanState {
  return {
    projects: [],
    teammates: [],
    assignments: [],
    fields: {
      status: defaultStatusField(),
      role: defaultRoleField(),
      projectLabel: "Project",
      teammateLabel: "Teammate",
    },
  };
}

/** A small illustrative plan so a first-run user sees the tool working. */
export function samplePlan(): PlanState {
  const today = todayISO();
  const plan = emptyPlan();

  const ada: Teammate = { id: uid("tm"), name: "Ada", workingDaysPerWeek: 5, roleOptionId: ROLE.ENG, timeOff: [], createdAt: today };
  const grace: Teammate = {
    id: uid("tm"), name: "Grace", workingDaysPerWeek: 4, roleOptionId: ROLE.ENG, createdAt: today,
    // one upcoming vacation, so the sample shows time-off affecting dates
    timeOff: [{ id: uid("to"), start: addDays(today, 10), end: addDays(today, 14), note: "Vacation" }],
  };
  const jony: Teammate = { id: uid("tm"), name: "Jony", workingDaysPerWeek: 5, roleOptionId: ROLE.DESIGN, timeOff: [], createdAt: today };
  plan.teammates = [ada, grace, jony];

  const checkout = { id: uid("pr"), name: "Checkout revamp", effortDays: 20, daysRemaining: 20, statusOptionId: STATUS.ACTIVE, insertion: "preempt" as const, archived: false, createdAt: today };
  const search = { id: uid("pr"), name: "Search relevance", effortDays: 12, daysRemaining: 12, statusOptionId: STATUS.PLANNED, insertion: "preempt" as const, archived: false, createdAt: today };
  const onboarding = { id: uid("pr"), name: "Onboarding polish", effortDays: 8, daysRemaining: 8, statusOptionId: STATUS.PLANNED, insertion: "spare" as const, archived: false, createdAt: today };
  plan.projects = [checkout, search, onboarding];

  plan.assignments = [
    { id: uid("as"), teammateId: ada.id, projectId: checkout.id, allocationPct: 100 },
    { id: uid("as"), teammateId: jony.id, projectId: checkout.id, allocationPct: 50 },
    { id: uid("as"), teammateId: grace.id, projectId: search.id, allocationPct: 100 },
    { id: uid("as"), teammateId: jony.id, projectId: onboarding.id, allocationPct: 50 },
  ];

  return plan;
}
