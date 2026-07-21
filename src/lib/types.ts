// ---------------------------------------------------------------------------
// Core data model for the Timeline Planner.
//
// Everything here is plain, JSON-serializable data. That is a hard requirement:
// export/import, localStorage persistence, undo snapshots, and the future
// multi-plan / multi-user sync features all depend on the entire plan being a
// pure serializable object with no class instances, Dates, or functions.
//
// Dates are stored as ISO date strings ("2026-07-21"), never Date objects.
// ---------------------------------------------------------------------------

export type ISODate = string; // "YYYY-MM-DD"

/** How a project consumes capacity relative to others in the ranked list. */
export type InsertionBehavior = "preempt" | "spare";

export interface DateRange {
  id: string;
  start: ISODate;
  end: ISODate; // inclusive
  note?: string;
}

export interface Assignment {
  id: string;
  teammateId: string;
  projectId: string;
  /** Max share of the teammate's daily capacity this project may consume (0-100). */
  allocationPct: number;
}

export interface Project {
  id: string;
  name: string;
  effortDays: number; // total estimated effort
  daysRemaining: number; // remaining effort; defaults to effortDays
  statusOptionId: string; // references SchemaField "status" option
  earliestStart?: ISODate;
  insertion: InsertionBehavior;
  archived: boolean;
  /**
   * Last committed projected completion date. Written by the store whenever a
   * deliberate edit recomputes the plan; NOT rewritten by the mere passage of
   * time. This is what makes staleness honest: reopening the app days later and
   * finding today past the target flags the project red instead of silently
   * sliding the date forward.
   */
  targetDate?: ISODate;
  /** Completion log entry timestamp — populated when marked Done (for future calibration). */
  completedAt?: ISODate;
  createdAt: ISODate;
}

export interface Teammate {
  id: string;
  name: string;
  workingDaysPerWeek: number; // 0-7, default 5
  roleOptionId: string; // references SchemaField "role" option
  timeOff: DateRange[];
  createdAt: ISODate;
}

export interface SchemaOption {
  id: string;
  label: string;
  color: string; // hex
}

/** A user-editable dropdown field: its display label + its ordered options. */
export interface SchemaField {
  id: string; // stable key: "status" | "role" (extensible)
  label: string; // user-facing display label, editable
  options: SchemaOption[];
}

/**
 * The complete state of a single plan. This is the unit that gets exported,
 * persisted, snapshotted for undo, and sandboxed. A future multi-plan build
 * wraps a Record<planId, PlanState> around this without touching the shape.
 */
export interface PlanState {
  projects: Project[];
  teammates: Teammate[];
  assignments: Assignment[];
  fields: {
    status: SchemaField;
    role: SchemaField;
    // renaming the "Project" / "Teammate" nouns themselves:
    projectLabel: string;
    teammateLabel: string;
  };
}

/** Wrapper written to disk / localStorage so we can version the format. */
export interface PersistedFile {
  version: 1;
  exportedAt: string;
  plan: PlanState;
}
