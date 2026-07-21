"use client";

import { useStore } from "@/lib/store";
import { useActivePlan, optionMap } from "@/lib/selectors";
import { Modal, Button, Pill } from "./ui";
import { IconArchive } from "./icons";
import { longLabel } from "@/lib/date";

export function ArchivePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plan = useActivePlan();
  const restore = useStore((s) => s.restoreProject);
  const del = useStore((s) => s.deleteProject);
  const statuses = optionMap(plan.fields.status.options);
  const archived = plan.projects.filter((p) => p.archived);

  return (
    <Modal open={open} onClose={onClose} wide title="Archive">
      {archived.length === 0 ? (
        <p className="rounded-lg bg-surface-2 px-4 py-8 text-center text-sm text-ink-muted">
          <IconArchive className="mx-auto mb-2 h-6 w-6" />
          Nothing archived. Done projects you archive land here and stay out of active views.
        </p>
      ) : (
        <div className="space-y-2">
          {archived.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="flex-1">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-muted">
                  <Pill color={statuses[p.statusOptionId]?.color}>{statuses[p.statusOptionId]?.label ?? "—"}</Pill>
                  {p.completedAt && <span>Completed {longLabel(p.completedAt)}</span>}
                  <span>{p.effortDays}d effort</span>
                </div>
              </div>
              <Button variant="subtle" onClick={() => restore(p.id)}>Restore</Button>
              <Button variant="danger" onClick={() => del(p.id)}>Delete</Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
