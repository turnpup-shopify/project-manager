"use client";

import { useMemo, useState } from "react";
import { useActivePlan, useSchedule, optionMap } from "@/lib/selectors";
import type { Project } from "@/lib/types";
import {
  monthsBetween, monthKey, monthSnapFraction, monthLabel, deliverableLabel,
  longLabel, todayISO, addDays,
} from "@/lib/date";
import { Pill } from "./ui";
import { Badge } from "./ScheduleCell";
import { colorFor } from "./ProjectTable";

const MONTH_W = 150; // px per month column
const ROW_H = 46;

export function Roadmap() {
  const plan = useActivePlan();
  const schedule = useSchedule();
  const today = todayISO();
  const statuses = optionMap(plan.fields.status.options);
  const [popover, setPopover] = useState<string | null>(null);

  // Projects shown on the roadmap: active, not archived, not done.
  const rows = plan.projects.filter(
    (p) => !p.archived && p.statusOptionId !== "status_done"
  );

  const { months, monthIndex, rangeStart } = useMemo(() => {
    let start = today;
    let end = addDays(today, 60);
    for (const p of rows) {
      const s = schedule.projects[p.id];
      if (s.startDate && s.startDate < start) start = s.startDate;
      if (s.completionDate && s.completionDate > end) end = s.completionDate;
      if (p.earliestStart && p.earliestStart < start) start = p.earliestStart;
    }
    // snap start to month begin
    const ms = monthsBetween(start, end);
    const idx = new Map(ms.map((m, i) => [m.key, i]));
    return { months: ms, monthIndex: idx, rangeStart: start };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, schedule, today]);

  function xOf(date: string): number {
    const idx = monthIndex.get(monthKey(date));
    if (idx === undefined) {
      // date outside range — clamp to an edge
      return date < rangeStart ? 0 : months.length * MONTH_W;
    }
    return (idx + monthSnapFraction(date)) * MONTH_W;
  }

  const width = months.length * MONTH_W;
  const todayX = xOf(today);

  if (rows.length === 0) {
    return <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center text-sm text-ink-muted">No active projects to plot. Add one, or check the archive.</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="scroll-slim overflow-x-auto">
        <div className="relative" style={{ width: width + 200 }}>
          {/* Month header */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-surface-2">
            <div className="sticky left-0 z-30 w-[200px] shrink-0 border-r border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {plan.fields.projectLabel}
            </div>
            <div className="relative" style={{ width }}>
              {months.map((m, i) => (
                <div key={m.key} className="absolute top-0 border-r border-border py-2 text-center text-xs font-semibold text-ink-muted" style={{ left: i * MONTH_W, width: MONTH_W }}>
                  {monthLabel(m.year, m.month0)}
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="relative">
            {/* month gridlines */}
            <div className="pointer-events-none absolute inset-0" style={{ left: 200 }}>
              {months.map((m, i) => (
                <div key={m.key} className="absolute top-0 bottom-0 border-r border-border/60" style={{ left: i * MONTH_W }} />
              ))}
              {/* today line */}
              {todayX >= 0 && todayX <= width && (
                <div className="absolute top-0 bottom-0 z-10 border-l-2 border-red-500" style={{ left: todayX }}>
                  <span className="absolute -top-0 left-1 rounded-b bg-red-500 px-1 py-0.5 text-[9px] font-semibold text-white">Today</span>
                </div>
              )}
            </div>

            {rows.map((p) => (
              <RoadmapRow
                key={p.id}
                project={p}
                schedule={schedule}
                statusColor={statuses[p.statusOptionId]?.color}
                statusLabel={statuses[p.statusOptionId]?.label ?? ""}
                xOf={xOf}
                width={width}
                popoverOpen={popover === p.id}
                onToggle={() => setPopover(popover === p.id ? null : p.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoadmapRow({
  project, schedule, statusColor, statusLabel, xOf, width, popoverOpen, onToggle,
}: {
  project: Project;
  schedule: ReturnType<typeof useSchedule>;
  statusColor?: string;
  statusLabel: string;
  xOf: (d: string) => number;
  width: number;
  popoverOpen: boolean;
  onToggle: () => void;
}) {
  const plan = useActivePlan();
  const s = schedule.projects[project.id];
  const onHold = project.statusOptionId === "status_onhold";
  const assignees = plan.assignments.filter((a) => a.projectId === project.id);
  const noDate = !s.completionDate;

  const startX = s.startDate ? Math.max(0, xOf(s.startDate)) : 0;
  const endX = s.completionDate ? xOf(s.completionDate) : 0;
  const barW = Math.max(10, endX - startX);

  return (
    <div className="relative flex border-b border-border" style={{ height: ROW_H }}>
      <div className={`sticky left-0 z-20 flex w-[200px] shrink-0 items-center gap-2 border-r border-border bg-surface px-3 ${onHold ? "opacity-60" : ""}`}>
        <span className="truncate text-sm font-medium">{project.name}</span>
      </div>
      <div className="relative" style={{ width }}>
        {noDate ? (
          <div className="absolute top-1/2 -translate-y-1/2 pl-2">
            <Badge tone="amber">{s.kind === "unstaffed" ? "Unstaffed — no date" : s.kind === "needs-estimate" ? "Needs estimate" : "No date"}</Badge>
          </div>
        ) : (
          <>
            <button
              onClick={onToggle}
              className={`absolute top-1/2 h-5 -translate-y-1/2 rounded-full transition hover:brightness-110 ${onHold ? "opacity-50" : ""}`}
              style={{ left: startX, width: barW, background: statusColor ?? "var(--accent)" }}
              title={`${project.name} — ${s.completionDate ? deliverableLabel(s.completionDate) : ""}`}
            />
            {/* deliverable diamond */}
            {s.completionDate && (
              <button onClick={onToggle} className="absolute top-1/2 z-10 -translate-y-1/2" style={{ left: endX - 7 }} title="Deliverable">
                <span className={`block h-3.5 w-3.5 rotate-45 border-2 border-surface ${s.overdue ? "bg-red-500" : "bg-ink"}`} />
              </button>
            )}
            {s.completionDate && (
              <span className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-medium text-ink-muted" style={{ left: endX + 10 }}>
                {deliverableLabel(s.completionDate)}
              </span>
            )}
            {popoverOpen && s.completionDate && (
              <Popover
                project={project}
                s={s}
                statusColor={statusColor}
                statusLabel={statusLabel}
                assignees={assignees.map((a) => {
                  const t = plan.teammates.find((x) => x.id === a.teammateId);
                  return { name: t?.name ?? "?", pct: a.allocationPct };
                })}
                left={startX}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Popover({
  project, s, statusColor, statusLabel, assignees, left,
}: {
  project: Project;
  s: ReturnType<typeof useSchedule>["projects"][string];
  statusColor?: string;
  statusLabel: string;
  assignees: { name: string; pct: number }[];
  left: number;
}) {
  return (
    <div className="animate-fadein absolute top-full z-40 mt-1 w-64 rounded-lg border border-border bg-surface p-3 shadow-xl" style={{ left: Math.max(0, left) }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold">{project.name}</span>
        <Pill color={statusColor}>{statusLabel}</Pill>
      </div>
      <dl className="space-y-1 text-xs">
        <Line label="Projected" value={s.completionDate ? longLabel(s.completionDate) : "—"} strong={s.overdue} />
        <Line label="Deliverable" value={s.completionDate ? deliverableLabel(s.completionDate) : "—"} />
        <Line label="Days remaining" value={`${s.daysRemaining}d`} />
        <div className="pt-1">
          <span className="text-ink-muted">Team</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {assignees.length === 0 && <span className="text-ink-muted">Unstaffed</span>}
            {assignees.map((a, i) => (
              <span key={i} className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white" style={{ background: colorFor(a.name) }}>{a.name.slice(0, 2)}</span>
                {a.name} · {a.pct}%
              </span>
            ))}
          </div>
        </div>
      </dl>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-muted">{label}</span>
      <span className={`font-medium ${strong ? "text-red-600" : "text-ink"}`}>{value}</span>
    </div>
  );
}
