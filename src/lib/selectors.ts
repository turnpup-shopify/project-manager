"use client";

import { useMemo } from "react";
import { useStore } from "./store";
import { computeSchedule, type ScheduleResult } from "./engine";
import type { PlanState, SchemaOption } from "./types";

export function useActivePlan(): PlanState {
  const committed = useStore((s) => s.committed);
  const sandbox = useStore((s) => s.sandbox);
  return sandbox ?? committed;
}

export function useSchedule(): ScheduleResult {
  const plan = useActivePlan();
  return useMemo(() => computeSchedule(plan), [plan]);
}

export interface SandboxDelta {
  projectId: string;
  name: string;
  before?: string; // committed completion
  after?: string; // sandbox completion
  deltaDays: number | null; // business-day-ish diff (calendar days here)
}

/** Per-project completion deltas comparing the sandbox against the committed plan. */
export function useSandboxDeltas(): SandboxDelta[] | null {
  const committed = useStore((s) => s.committed);
  const sandbox = useStore((s) => s.sandbox);
  return useMemo(() => {
    if (!sandbox) return null;
    const before = computeSchedule(committed);
    const after = computeSchedule(sandbox);
    const ids = new Set<string>([
      ...sandbox.projects.map((p) => p.id),
      ...committed.projects.map((p) => p.id),
    ]);
    const out: SandboxDelta[] = [];
    for (const id of ids) {
      const proj = sandbox.projects.find((p) => p.id === id) ?? committed.projects.find((p) => p.id === id);
      if (!proj || proj.archived) continue;
      const b = before.projects[id]?.completionDate;
      const a = after.projects[id]?.completionDate;
      let delta: number | null = null;
      if (a && b) delta = calDays(b, a);
      out.push({ projectId: id, name: proj.name, before: b, after: a, deltaDays: delta });
    }
    // surface the biggest movers first
    out.sort((x, y) => Math.abs(y.deltaDays ?? 0) - Math.abs(x.deltaDays ?? 0));
    return out;
  }, [committed, sandbox]);
}

function calDays(a: string, b: string): number {
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  return Math.round((db - da) / 86400000);
}

export function optionMap(options: SchemaOption[]): Record<string, SchemaOption> {
  return Object.fromEntries(options.map((o) => [o.id, o]));
}
