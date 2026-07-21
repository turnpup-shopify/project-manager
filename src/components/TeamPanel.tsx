"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useActivePlan, useSchedule, optionMap } from "@/lib/selectors";
import type { Teammate } from "@/lib/types";
import { longLabel } from "@/lib/date";
import { Modal, Field, TextInput, Select, Button, IconButton, Pill, ConfirmDialog } from "./ui";
import { IconPlus, IconTrash, IconPencil, IconX } from "./icons";
import { colorFor } from "./ProjectTable";
import { Badge } from "./ScheduleCell";

export function TeamPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plan = useActivePlan();
  const schedule = useSchedule();
  const [editing, setEditing] = useState<Teammate | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Teammate | null>(null);
  const deleteTeammate = useStore((s) => s.deleteTeammate);
  const roles = optionMap(plan.fields.role.options);

  return (
    <Modal open={open} onClose={onClose} wide title={`${plan.fields.teammateLabel}s`}>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          <IconPlus /> Add {plan.fields.teammateLabel.toLowerCase()}
        </Button>
      </div>

      {plan.teammates.length === 0 ? (
        <p className="rounded-lg bg-surface-2 px-4 py-6 text-center text-sm text-ink-muted">
          No {plan.fields.teammateLabel.toLowerCase()}s yet. Add one to start forecasting.
        </p>
      ) : (
        <div className="space-y-2">
          {plan.teammates.map((t) => {
            const load = schedule.teammates[t.id];
            return (
              <div key={t.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: colorFor(t.name) }}>
                    {t.name.slice(0, 2)}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t.name}</span>
                      <Pill color={roles[t.roleOptionId]?.color}>{roles[t.roleOptionId]?.label ?? "—"}</Pill>
                      {load?.overAllocated && <Badge tone="amber">{Math.round(load.totalAllocationPct)}% allocated</Badge>}
                    </div>
                    <div className="text-[11px] text-ink-muted">
                      {t.workingDaysPerWeek} days/week
                      {t.timeOff.length > 0 && ` · ${t.timeOff.length} time-off block${t.timeOff.length > 1 ? "s" : ""}`}
                    </div>
                  </div>
                  <IconButton label="Edit" onClick={() => { setEditing(t); setShowForm(true); }}><IconPencil /></IconButton>
                  <IconButton label="Delete" onClick={() => setConfirmDelete(t)}><IconTrash /></IconButton>
                </div>
                {t.timeOff.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
                    {t.timeOff.map((r) => (
                      <span key={r.id} className="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted">
                        {longLabel(r.start)} → {longLabel(r.end)}{r.note ? ` · ${r.note}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && <TeammateForm teammate={editing} onClose={() => setShowForm(false)} />}
      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.name}?`}
        body="Their assignments will be removed and affected projects reforecast. You can undo this."
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmDelete && deleteTeammate(confirmDelete.id)}
        onClose={() => setConfirmDelete(null)}
      />
    </Modal>
  );
}

function TeammateForm({ teammate, onClose }: { teammate: Teammate | null; onClose: () => void }) {
  const plan = useActivePlan();
  const store = useStore();
  const [name, setName] = useState(teammate?.name ?? "");
  const [days, setDays] = useState(String(teammate?.workingDaysPerWeek ?? 5));
  const [role, setRole] = useState(teammate?.roleOptionId ?? plan.fields.role.options[0]?.id);
  const [toStart, setToStart] = useState("");
  const [toEnd, setToEnd] = useState("");
  const [toNote, setToNote] = useState("");

  const current = teammate ? plan.teammates.find((t) => t.id === teammate.id) : null;

  function save() {
    if (!name.trim()) return;
    if (teammate) {
      store.updateTeammate(teammate.id, { name: name.trim(), workingDaysPerWeek: Number(days) || 0, roleOptionId: role });
    } else {
      store.addTeammate({ name: name.trim(), workingDaysPerWeek: Number(days) || 0, roleOptionId: role });
    }
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={teammate ? `Edit ${teammate.name}` : `New ${plan.fields.teammateLabel.toLowerCase()}`}>
      <Field label="Name">
        <TextInput value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Ada" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Working days / week">
          <TextInput type="number" min={0} max={7} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label={plan.fields.role.label}>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {plan.fields.role.options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      {teammate && (
        <div className="mt-1 border-t border-border pt-3">
          <span className="mb-2 block text-xs font-medium text-ink-muted">Time off</span>
          <div className="mb-2 space-y-1.5">
            {current?.timeOff.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs">
                <span className="flex-1">{longLabel(r.start)} → {longLabel(r.end)}{r.note ? ` · ${r.note}` : ""}</span>
                <IconButton label="Remove" onClick={() => store.removeTimeOff(teammate.id, r.id)}><IconX /></IconButton>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <label className="flex-1"><span className="mb-1 block text-[11px] text-ink-muted">From</span><TextInput type="date" value={toStart} onChange={(e) => setToStart(e.target.value)} /></label>
            <label className="flex-1"><span className="mb-1 block text-[11px] text-ink-muted">To</span><TextInput type="date" value={toEnd} onChange={(e) => setToEnd(e.target.value)} /></label>
            <label className="flex-1"><span className="mb-1 block text-[11px] text-ink-muted">Note</span><TextInput value={toNote} onChange={(e) => setToNote(e.target.value)} placeholder="Vacation" /></label>
            <Button
              variant="subtle"
              disabled={!toStart || !toEnd || toEnd < toStart}
              onClick={() => { store.addTimeOff(teammate.id, { start: toStart, end: toEnd, note: toNote || undefined }); setToStart(""); setToEnd(""); setToNote(""); }}
            >
              <IconPlus /> Add
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>{teammate ? "Done" : "Cancel"}</Button>
        <Button variant="primary" onClick={save} disabled={!name.trim()}>{teammate ? "Save" : "Add"}</Button>
      </div>
    </Modal>
  );
}
