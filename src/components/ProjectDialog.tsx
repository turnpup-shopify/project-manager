"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useActivePlan } from "@/lib/selectors";
import type { Project } from "@/lib/types";
import { Modal, Field, TextInput, Select, Button, IconButton } from "./ui";
import { IconPlus, IconX } from "./icons";

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Project | null;
}

export function ProjectDialog({ open, onClose, editing }: Props) {
  const plan = useActivePlan();
  const addProject = useStore((s) => s.addProject);
  const updateProject = useStore((s) => s.updateProject);
  const setProjectAssignments = useStore((s) => s.setProjectAssignments);

  const existingAssignments = editing
    ? plan.assignments.filter((a) => a.projectId === editing.id).map((a) => ({ teammateId: a.teammateId, allocationPct: a.allocationPct }))
    : [];

  const [name, setName] = useState(editing?.name ?? "");
  const [effort, setEffort] = useState(String(editing?.effortDays ?? ""));
  const [remaining, setRemaining] = useState(editing ? String(editing.daysRemaining) : "");
  const [status, setStatus] = useState(editing?.statusOptionId ?? plan.fields.status.options[0]?.id);
  const [earliest, setEarliest] = useState(editing?.earliestStart ?? "");
  const [insertion, setInsertion] = useState<Project["insertion"]>(editing?.insertion ?? "preempt");
  const [rows, setRows] = useState(existingAssignments.length ? existingAssignments : []);

  const teammateLabel = plan.fields.teammateLabel.toLowerCase();

  function addRow() {
    const used = new Set(rows.map((r) => r.teammateId));
    const next = plan.teammates.find((t) => !used.has(t.id));
    if (next) setRows([...rows, { teammateId: next.id, allocationPct: 100 }]);
  }

  function save() {
    if (!name.trim()) return;
    const effortNum = Number(effort) || 0;
    const remNum = remaining === "" ? effortNum : Number(remaining) || 0;
    if (editing) {
      updateProject(editing.id, {
        name: name.trim(),
        effortDays: effortNum,
        daysRemaining: remNum,
        statusOptionId: status,
        earliestStart: earliest || undefined,
        insertion,
      });
      setProjectAssignments(editing.id, rows);
    } else {
      const id = addProject({
        name: name.trim(),
        effortDays: effortNum,
        daysRemaining: remNum,
        statusOptionId: status,
        earliestStart: earliest || undefined,
        insertion,
      });
      setProjectAssignments(id, rows);
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} wide title={editing ? `Edit ${plan.fields.projectLabel.toLowerCase()}` : `New ${plan.fields.projectLabel.toLowerCase()}`}>
      <div className="grid grid-cols-2 gap-x-4">
        <div className="col-span-2">
          <Field label="Name">
            <TextInput value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Checkout revamp" />
          </Field>
        </div>
        <Field label="Total effort (days)">
          <TextInput type="number" min={0} value={effort} onChange={(e) => setEffort(e.target.value)} placeholder="10" />
        </Field>
        <Field label="Days remaining" hint={editing ? undefined : "Defaults to total effort"}>
          <TextInput type="number" min={0} value={remaining} onChange={(e) => setRemaining(e.target.value)} placeholder={effort || "10"} />
        </Field>
        <Field label={plan.fields.status.label}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {plan.fields.status.options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Earliest start" hint="Optional">
          <TextInput type="date" value={earliest} onChange={(e) => setEarliest(e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="When added mid-stream">
            <div className="flex gap-2">
              <InsertionButton active={insertion === "preempt"} onClick={() => setInsertion("preempt")} title="Preempt lower-priority work" sub="Takes its priority slot" />
              <InsertionButton active={insertion === "spare"} onClick={() => setInsertion("spare")} title="Use spare capacity only" sub="Runs behind everything else" />
            </div>
          </Field>
        </div>
      </div>

      <div className="mt-2 border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-muted">Assigned {teammateLabel}s</span>
          <Button variant="subtle" onClick={addRow} disabled={rows.length >= plan.teammates.length}>
            <IconPlus /> Add
          </Button>
        </div>
        {plan.teammates.length === 0 && (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-muted">
            No {teammateLabel}s yet — add one from the team panel first.
          </p>
        )}
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={row.teammateId}
                onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, teammateId: e.target.value } : r)))}
                className="flex-1"
              >
                {plan.teammates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
              <div className="flex items-center gap-1">
                <TextInput
                  type="number"
                  min={0}
                  max={100}
                  value={row.allocationPct}
                  onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, allocationPct: Number(e.target.value) } : r)))}
                  className="!w-20"
                />
                <span className="text-xs text-ink-muted">%</span>
              </div>
              <IconButton label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><IconX /></IconButton>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!name.trim()}>{editing ? "Save" : "Add"}</Button>
      </div>
    </Modal>
  );
}

function InsertionButton({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2 text-left transition ${active ? "border-accent bg-accent-soft" : "border-border bg-canvas hover:bg-surface-2"}`}
    >
      <div className="text-xs font-semibold text-ink">{title}</div>
      <div className="text-[11px] text-ink-muted">{sub}</div>
    </button>
  );
}
