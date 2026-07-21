"use client";

import { create } from "zustand";
import type {
  PlanState,
  Project,
  Teammate,
  Assignment,
  DateRange,
  InsertionBehavior,
  SchemaOption,
  PersistedFile,
} from "./types";
import { emptyPlan, samplePlan } from "./defaults";
import { computeSchedule } from "./engine";
import { todayISO } from "./date";
import { uid } from "./id";

const STORAGE_KEY = "timeline-planner:v1";
const UNDO_LIMIT = 30;

// ---------------------------------------------------------------------------
// Persistence (manual, so sandbox/undo transient state never leaks to disk).
// localStorage is a write-through cache for instant loads + offline fallback.
// Vercel KV (via /api/plan) is the source of truth for cross-device sync.
// ---------------------------------------------------------------------------
function loadFromDisk(): PlanState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedFile;
    if (parsed?.plan) return parsed.plan;
  } catch {
    /* corrupt storage — fall through to fresh */
  }
  return null;
}

function saveToDisk(plan: PlanState) {
  if (typeof window === "undefined") return;
  const file: PersistedFile = { version: 1, exportedAt: new Date().toISOString(), plan };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    /* storage full / unavailable — non-fatal for the session */
  }
}

async function loadFromRemote(): Promise<PlanState | null> {
  try {
    const res = await fetch("/api/plan");
    if (!res.ok) return null;
    const data = await res.json() as PersistedFile | null;
    return data?.plan ?? null;
  } catch {
    return null;
  }
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveToRemote(plan: PlanState) {
  if (typeof window === "undefined") return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const file: PersistedFile = { version: 1, exportedAt: new Date().toISOString(), plan };
    fetch("/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(file),
    }).catch(() => {/* non-fatal */});
  }, 1000);
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

/** Recompute the schedule and stamp each project's committed target date. */
function rebaseline(plan: PlanState): PlanState {
  const sched = computeSchedule(plan);
  return {
    ...plan,
    projects: plan.projects.map((p) => {
      const c = sched.projects[p.id]?.completionDate;
      // Only refresh the target when we actually have a fresh projection.
      return c ? { ...p, targetDate: c } : p;
    }),
  };
}

export type ViewMode = "table" | "roadmap";

interface StoreState {
  committed: PlanState;
  sandbox: PlanState | null;
  undoStack: PlanState[];
  view: ViewMode;
  hydrated: boolean;

  // lifecycle
  hydrate: () => void;

  // derived helpers
  active: () => PlanState;
  inSandbox: () => boolean;

  // sandbox
  enterSandbox: () => void;
  applySandbox: () => void;
  discardSandbox: () => void;

  // undo
  canUndo: () => boolean;
  undo: () => void;

  // view
  setView: (v: ViewMode) => void;

  // data import/export
  replaceAll: (plan: PlanState) => void;
  resetToSample: () => void;
  resetToEmpty: () => void;

  // projects
  addProject: (input: Partial<Project> & { name: string }) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  reorderProjects: (orderedIds: string[]) => void;
  sendToTop: (id: string) => void;
  sendToBottom: (id: string) => void;
  setProjectStatus: (id: string, statusOptionId: string) => void;
  setDaysRemaining: (id: string, days: number) => void;
  archiveProject: (id: string) => void;
  restoreProject: (id: string) => void;

  // teammates
  addTeammate: (input: Partial<Teammate> & { name: string }) => string;
  updateTeammate: (id: string, patch: Partial<Teammate>) => void;
  deleteTeammate: (id: string) => void;
  addTimeOff: (teammateId: string, range: Omit<DateRange, "id">) => void;
  removeTimeOff: (teammateId: string, rangeId: string) => void;

  // assignments — set the full roster for one project at once
  setProjectAssignments: (
    projectId: string,
    rows: { teammateId: string; allocationPct: number }[]
  ) => void;

  // schema
  setFieldLabel: (field: "status" | "role", label: string) => void;
  setNounLabel: (which: "projectLabel" | "teammateLabel", label: string) => void;
  addOption: (field: "status" | "role", label: string, color: string) => void;
  updateOption: (field: "status" | "role", optionId: string, patch: Partial<SchemaOption>) => void;
  reorderOptions: (field: "status" | "role", orderedIds: string[]) => void;
  deleteOption: (field: "status" | "role", optionId: string, remapToId: string) => void;
}

export const useStore = create<StoreState>((set, get) => {
  /** Route a mutation to sandbox (transient) or committed (persist + undo). */
  function mutate(producer: (plan: PlanState) => void) {
    const state = get();
    if (state.sandbox) {
      const next = clone(state.sandbox);
      producer(next);
      set({ sandbox: next });
    } else {
      const next = clone(state.committed);
      producer(next);
      const rebased = rebaseline(next);
      set({
        committed: rebased,
        undoStack: [...state.undoStack, state.committed].slice(-UNDO_LIMIT),
      });
      saveToDisk(rebased);
      saveToRemote(rebased);
    }
  }

  return {
    committed: emptyPlan(),
    sandbox: null,
    undoStack: [],
    view: "table",
    hydrated: false,

    hydrate: () => {
      if (get().hydrated) return;
      // Show cached data immediately so the UI isn't blank while we fetch.
      const local = loadFromDisk();
      if (local) set({ committed: local });
      // Fetch remote (source of truth) and reconcile.
      loadFromRemote().then((remote) => {
        if (remote) {
          set({ committed: remote, hydrated: true });
          saveToDisk(remote);
        } else if (local) {
          set({ hydrated: true });
          saveToRemote(local); // push local up to KV on first cross-device visit
        } else {
          const seed = rebaseline(samplePlan());
          set({ committed: seed, hydrated: true });
          saveToDisk(seed);
          saveToRemote(seed);
        }
      }).catch(() => {
        // API unreachable — fall back to local or seed
        if (!get().hydrated) {
          if (local) {
            set({ hydrated: true });
          } else {
            const seed = rebaseline(samplePlan());
            set({ committed: seed, hydrated: true });
            saveToDisk(seed);
          }
        }
      });
    },

    active: () => get().sandbox ?? get().committed,
    inSandbox: () => get().sandbox !== null,

    enterSandbox: () => set({ sandbox: clone(get().committed) }),
    applySandbox: () => {
      const sb = get().sandbox;
      if (!sb) return;
      const rebased = rebaseline(sb);
      set((s) => ({
        committed: rebased,
        sandbox: null,
        undoStack: [...s.undoStack, s.committed].slice(-UNDO_LIMIT),
      }));
      saveToDisk(rebased);
      saveToRemote(rebased);
    },
    discardSandbox: () => set({ sandbox: null }),

    canUndo: () => get().undoStack.length > 0,
    undo: () => {
      const stack = get().undoStack;
      if (stack.length === 0) return;
      const prev = stack[stack.length - 1];
      set({ committed: prev, undoStack: stack.slice(0, -1), sandbox: null });
      saveToDisk(prev);
      saveToRemote(prev);
    },

    setView: (v) => set({ view: v }),

    replaceAll: (plan) => {
      const rebased = rebaseline(plan);
      set((s) => ({
        committed: rebased,
        sandbox: null,
        undoStack: [...s.undoStack, s.committed].slice(-UNDO_LIMIT),
      }));
      saveToDisk(rebased);
      saveToRemote(rebased);
    },
    resetToSample: () => get().replaceAll(samplePlan()),
    resetToEmpty: () => get().replaceAll(emptyPlan()),

    // --- projects -----------------------------------------------------------
    addProject: (input) => {
      const id = uid("pr");
      const today = todayISO();
      const effort = input.effortDays ?? 0;
      mutate((plan) => {
        const project: Project = {
          id,
          name: input.name,
          effortDays: effort,
          daysRemaining: input.daysRemaining ?? effort,
          statusOptionId: input.statusOptionId ?? plan.fields.status.options[0].id,
          earliestStart: input.earliestStart,
          insertion: (input.insertion as InsertionBehavior) ?? "preempt",
          archived: false,
          createdAt: today,
        };
        // "spare capacity only" inserts at the bottom; "preempt" at the top.
        if (project.insertion === "spare") plan.projects.push(project);
        else plan.projects.unshift(project);
      });
      return id;
    },
    updateProject: (id, patch) =>
      mutate((plan) => {
        const p = plan.projects.find((x) => x.id === id);
        if (p) Object.assign(p, patch);
      }),
    deleteProject: (id) =>
      mutate((plan) => {
        plan.projects = plan.projects.filter((p) => p.id !== id);
        plan.assignments = plan.assignments.filter((a) => a.projectId !== id);
      }),
    reorderProjects: (orderedIds) =>
      mutate((plan) => {
        const map = new Map(plan.projects.map((p) => [p.id, p]));
        const reordered = orderedIds.map((id) => map.get(id)!).filter(Boolean);
        // keep any archived / not-listed projects appended in original order
        const seen = new Set(orderedIds);
        const rest = plan.projects.filter((p) => !seen.has(p.id));
        plan.projects = [...reordered, ...rest];
      }),
    sendToTop: (id) =>
      mutate((plan) => {
        const idx = plan.projects.findIndex((p) => p.id === id);
        if (idx > 0) {
          const [p] = plan.projects.splice(idx, 1);
          plan.projects.unshift(p);
        }
      }),
    sendToBottom: (id) =>
      mutate((plan) => {
        const idx = plan.projects.findIndex((p) => p.id === id);
        const activeCount = plan.projects.filter((p) => !p.archived).length;
        if (idx >= 0 && idx < activeCount - 1) {
          const [p] = plan.projects.splice(idx, 1);
          plan.projects.push(p);
        }
      }),
    setProjectStatus: (id, statusOptionId) =>
      mutate((plan) => {
        const p = plan.projects.find((x) => x.id === id);
        if (!p) return;
        p.statusOptionId = statusOptionId;
        // completion log for future estimate calibration
        if (statusOptionId === "status_done" && !p.completedAt) {
          p.completedAt = todayISO();
        }
        if (statusOptionId !== "status_done") p.completedAt = undefined;
      }),
    setDaysRemaining: (id, days) =>
      mutate((plan) => {
        const p = plan.projects.find((x) => x.id === id);
        if (p) p.daysRemaining = Math.max(0, days);
      }),
    archiveProject: (id) =>
      mutate((plan) => {
        const p = plan.projects.find((x) => x.id === id);
        if (p) p.archived = true;
      }),
    restoreProject: (id) =>
      mutate((plan) => {
        const p = plan.projects.find((x) => x.id === id);
        if (p) p.archived = false;
      }),

    // --- teammates ----------------------------------------------------------
    addTeammate: (input) => {
      const id = uid("tm");
      mutate((plan) => {
        const teammate: Teammate = {
          id,
          name: input.name,
          workingDaysPerWeek: input.workingDaysPerWeek ?? 5,
          roleOptionId: input.roleOptionId ?? plan.fields.role.options[0].id,
          timeOff: input.timeOff ?? [],
          createdAt: todayISO(),
        };
        plan.teammates.push(teammate);
      });
      return id;
    },
    updateTeammate: (id, patch) =>
      mutate((plan) => {
        const t = plan.teammates.find((x) => x.id === id);
        if (t) Object.assign(t, patch);
      }),
    deleteTeammate: (id) =>
      mutate((plan) => {
        plan.teammates = plan.teammates.filter((t) => t.id !== id);
        plan.assignments = plan.assignments.filter((a) => a.teammateId !== id);
      }),
    addTimeOff: (teammateId, range) =>
      mutate((plan) => {
        const t = plan.teammates.find((x) => x.id === teammateId);
        if (t) t.timeOff.push({ id: uid("to"), ...range });
      }),
    removeTimeOff: (teammateId, rangeId) =>
      mutate((plan) => {
        const t = plan.teammates.find((x) => x.id === teammateId);
        if (t) t.timeOff = t.timeOff.filter((r) => r.id !== rangeId);
      }),

    // --- assignments --------------------------------------------------------
    setProjectAssignments: (projectId, rows) =>
      mutate((plan) => {
        plan.assignments = plan.assignments.filter((a) => a.projectId !== projectId);
        for (const row of rows) {
          const assignment: Assignment = {
            id: uid("as"),
            teammateId: row.teammateId,
            projectId,
            allocationPct: row.allocationPct,
          };
          plan.assignments.push(assignment);
        }
      }),

    // --- schema -------------------------------------------------------------
    setFieldLabel: (field, label) =>
      mutate((plan) => {
        plan.fields[field].label = label;
      }),
    setNounLabel: (which, label) =>
      mutate((plan) => {
        plan.fields[which] = label;
      }),
    addOption: (field, label, color) =>
      mutate((plan) => {
        plan.fields[field].options.push({ id: uid("opt"), label, color });
      }),
    updateOption: (field, optionId, patch) =>
      mutate((plan) => {
        const o = plan.fields[field].options.find((x) => x.id === optionId);
        if (o) Object.assign(o, patch);
      }),
    reorderOptions: (field, orderedIds) =>
      mutate((plan) => {
        const map = new Map(plan.fields[field].options.map((o) => [o.id, o]));
        plan.fields[field].options = orderedIds.map((id) => map.get(id)!).filter(Boolean);
      }),
    deleteOption: (field, optionId, remapToId) =>
      mutate((plan) => {
        // remap affected records first — no orphaned values allowed
        if (field === "status") {
          plan.projects.forEach((p) => {
            if (p.statusOptionId === optionId) p.statusOptionId = remapToId;
          });
        } else {
          plan.teammates.forEach((t) => {
            if (t.roleOptionId === optionId) t.roleOptionId = remapToId;
          });
        }
        plan.fields[field].options = plan.fields[field].options.filter((o) => o.id !== optionId);
      }),
  };
});
