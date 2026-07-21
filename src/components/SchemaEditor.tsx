"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useActivePlan } from "@/lib/selectors";
import type { SchemaOption } from "@/lib/types";
import { Modal, Field, TextInput, Select, Button, IconButton } from "./ui";
import { IconPlus, IconTrash } from "./icons";

type FieldKey = "status" | "role";
const PALETTE = ["#64748b", "#2563eb", "#7c3aed", "#db2777", "#0891b2", "#16a34a", "#d97706", "#dc2626"];

export function SchemaEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plan = useActivePlan();
  const [tab, setTab] = useState<FieldKey | "labels">("status");

  return (
    <Modal open={open} onClose={onClose} wide title="Fields & options">
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1">
        <TabBtn active={tab === "status"} onClick={() => setTab("status")}>{plan.fields.status.label}</TabBtn>
        <TabBtn active={tab === "role"} onClick={() => setTab("role")}>{plan.fields.role.label}</TabBtn>
        <TabBtn active={tab === "labels"} onClick={() => setTab("labels")}>Names</TabBtn>
      </div>
      {tab === "labels" ? <LabelsTab /> : <FieldTab field={tab} />}
    </Modal>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}>
      {children}
    </button>
  );
}

function LabelsTab() {
  const plan = useActivePlan();
  const setNoun = useStore((s) => s.setNounLabel);
  return (
    <div>
      <p className="mb-3 text-xs text-ink-muted">Rename the core nouns to match your team&apos;s vocabulary. Changes propagate everywhere.</p>
      <Field label="&quot;Project&quot; is called">
        <TextInput value={plan.fields.projectLabel} onChange={(e) => setNoun("projectLabel", e.target.value || "Project")} />
      </Field>
      <Field label="&quot;Teammate&quot; is called">
        <TextInput value={plan.fields.teammateLabel} onChange={(e) => setNoun("teammateLabel", e.target.value || "Teammate")} />
      </Field>
    </div>
  );
}

function FieldTab({ field }: { field: FieldKey }) {
  const plan = useActivePlan();
  const store = useStore();
  const f = plan.fields[field];
  const [newLabel, setNewLabel] = useState("");
  const [remapFor, setRemapFor] = useState<SchemaOption | null>(null);

  function move(id: string, dir: -1 | 1) {
    const ids = f.options.map((o) => o.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    store.reorderOptions(field, ids);
  }

  function countUsing(optionId: string): number {
    if (field === "status") return plan.projects.filter((p) => p.statusOptionId === optionId).length;
    return plan.teammates.filter((t) => t.roleOptionId === optionId).length;
  }

  return (
    <div>
      <Field label="Field display label">
        <TextInput value={f.label} onChange={(e) => store.setFieldLabel(field, e.target.value || f.label)} />
      </Field>

      <span className="mb-2 block text-xs font-medium text-ink-muted">Options</span>
      <div className="space-y-2">
        {f.options.map((o, i) => (
          <div key={o.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <div className="flex flex-col">
              <button className="text-ink-muted hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(o.id, -1)}>▲</button>
              <button className="text-ink-muted hover:text-ink disabled:opacity-30" disabled={i === f.options.length - 1} onClick={() => move(o.id, 1)}>▼</button>
            </div>
            <input
              type="color"
              value={o.color}
              onChange={(e) => store.updateOption(field, o.id, { color: e.target.value })}
              className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent"
              title="Color"
            />
            <TextInput value={o.label} onChange={(e) => store.updateOption(field, o.id, { label: e.target.value })} className="flex-1" />
            <span className="w-16 text-right text-[11px] text-ink-muted">{countUsing(o.id)} in use</span>
            <IconButton
              label="Delete option"
              disabled={f.options.length <= 1}
              onClick={() => {
                if (countUsing(o.id) > 0) setRemapFor(o);
                else store.deleteOption(field, o.id, f.options.find((x) => x.id !== o.id)!.id);
              }}
            >
              <IconTrash />
            </IconButton>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <TextInput value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New option label" className="flex-1" />
        <Button
          variant="subtle"
          disabled={!newLabel.trim()}
          onClick={() => { store.addOption(field, newLabel.trim(), PALETTE[f.options.length % PALETTE.length]); setNewLabel(""); }}
        >
          <IconPlus /> Add option
        </Button>
      </div>

      {remapFor && (
        <RemapDialog
          field={field}
          option={remapFor}
          count={countUsing(remapFor.id)}
          onClose={() => setRemapFor(null)}
        />
      )}
    </div>
  );
}

function RemapDialog({ field, option, count, onClose }: { field: FieldKey; option: SchemaOption; count: number; onClose: () => void }) {
  const plan = useActivePlan();
  const deleteOption = useStore((s) => s.deleteOption);
  const others = plan.fields[field].options.filter((o) => o.id !== option.id);
  const [target, setTarget] = useState(others[0]?.id);
  const noun = field === "status" ? plan.fields.projectLabel.toLowerCase() : plan.fields.teammateLabel.toLowerCase();

  return (
    <Modal open onClose={onClose} title={`Delete "${option.label}"`}>
      <p className="text-sm text-ink-muted">
        {count} {noun}{count > 1 ? "s" : ""} still use this option. Pick a replacement so no records are left orphaned.
      </p>
      <div className="mt-3">
        <Field label="Reassign to">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {others.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="!bg-red-600" onClick={() => { deleteOption(field, option.id, target); onClose(); }}>
          Reassign &amp; delete
        </Button>
      </div>
    </Modal>
  );
}
