"use client";

import type { ProjectSchedule } from "@/lib/engine";
import { deliverableLabel, longLabel } from "@/lib/date";

/** Renders the projected-date cell, including all the honest edge states. */
export function ScheduleCell({ s, overAllocated }: { s: ProjectSchedule; overAllocated?: boolean }) {
  if (s.kind === "unstaffed") return <Badge tone="amber">Unstaffed — no date</Badge>;
  if (s.kind === "needs-estimate") return <Badge tone="amber">Needs estimate</Badge>;
  if (s.kind === "no-capacity") return <Badge tone="amber">No capacity</Badge>;
  if (s.kind === "on-hold") return <span className="text-sm text-ink-muted">On hold</span>;
  if (s.kind === "done")
    return <span className="text-sm text-ink-muted">{s.completionDate ? `Done · ${deliverableLabel(s.completionDate)}` : "Done"}</span>;

  if (!s.completionDate) return <span className="text-sm text-ink-muted">—</span>;

  return (
    <div className="flex items-center gap-2">
      <div>
        <div className={`text-sm font-medium ${s.overdue ? "text-red-600" : "text-ink"}`}>
          {deliverableLabel(s.completionDate)}
        </div>
        <div className="text-[11px] text-ink-muted">{longLabel(s.completionDate)}</div>
      </div>
      {s.overdue && <Badge tone="red">Overdue</Badge>}
      {overAllocated && <Badge tone="amber">Over-allocated</Badge>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "red" | "amber" | "gray"; children: React.ReactNode }) {
  const cls = {
    red: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    gray: "bg-surface-2 text-ink-muted",
  }[tone];
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}
