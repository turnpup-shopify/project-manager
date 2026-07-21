"use client";

import { useStore } from "@/lib/store";
import { useSandboxDeltas } from "@/lib/selectors";
import { deliverableLabel } from "@/lib/date";
import { Button } from "./ui";
import { IconBeaker } from "./icons";

export function SandboxPanel() {
  const deltas = useSandboxDeltas();
  const applySandbox = useStore((s) => s.applySandbox);
  const discardSandbox = useStore((s) => s.discardSandbox);
  if (!deltas) return null;

  const moved = deltas.filter((d) => (d.deltaDays ?? 0) !== 0);

  return (
    <aside className="w-80 shrink-0">
      <div className="sticky top-4 rounded-xl border-2 border-amber-400 bg-surface">
        <div className="flex items-center gap-2 border-b border-border bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
          <IconBeaker />
          <div>
            <div className="text-sm font-semibold">What-if sandbox</div>
            <div className="text-[11px] text-ink-muted">Changes aren&apos;t saved until you apply.</div>
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-3">
          {moved.length === 0 ? (
            <p className="px-1 py-4 text-center text-xs text-ink-muted">No date changes yet. Reprioritize, restaff, or edit effort to see the impact here.</p>
          ) : (
            <ul className="space-y-2">
              {moved.map((d) => (
                <li key={d.projectId} className="rounded-lg bg-surface-2 p-2.5">
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                    <DeltaBadge days={d.deltaDays} />
                    {d.before && d.after && (
                      <span className="text-ink-muted">{deliverableLabel(d.before)} → {deliverableLabel(d.after)}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2 border-t border-border p-3">
          <Button className="flex-1" onClick={discardSandbox}>Discard</Button>
          <Button variant="primary" className="flex-1" onClick={applySandbox}>Apply</Button>
        </div>
      </div>
    </aside>
  );
}

function DeltaBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">changed</span>;
  const slips = days > 0;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${slips ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"}`}>
      {slips ? `slips ${days}d` : `${Math.abs(days)}d sooner`}
    </span>
  );
}
