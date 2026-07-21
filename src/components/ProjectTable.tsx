"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

import { useStore } from "@/lib/store";
import { useActivePlan, useSchedule, optionMap } from "@/lib/selectors";
import type { Project } from "@/lib/types";
import { ScheduleCell } from "./ScheduleCell";
import { ProjectDialog } from "./ProjectDialog";
import { Pill, Menu, MenuItem, IconButton, ConfirmDialog, Button } from "./ui";
import {
  IconGrip, IconDots, IconTop, IconBottom, IconPencil, IconTrash, IconArchive, IconPlus,
} from "./icons";

export function ProjectTable() {
  const plan = useActivePlan();
  const schedule = useSchedule();
  const reorderProjects = useStore((s) => s.reorderProjects);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const deleteProject = useStore((s) => s.deleteProject);

  const active = plan.projects.filter((p) => !p.archived);
  const statuses = optionMap(plan.fields.status.options);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const ids = active.map((p) => p.id);
    const from = ids.indexOf(a.id as string);
    const to = ids.indexOf(over.id as string);
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    reorderProjects(next);
  }

  if (active.length === 0) {
    return (
      <>
        <EmptyState onAdd={() => { setEditing(null); setDialogOpen(true); }} label={plan.fields.projectLabel} />
        <ProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} />
      </>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Priority list</h2>
        <Button variant="primary" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <IconPlus /> New {plan.fields.projectLabel.toLowerCase()}
        </Button>
      </div>

      <div className="grid grid-cols-[28px_28px_1fr_120px_110px_130px_180px_36px] items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        <span />
        <span>#</span>
        <span>{plan.fields.projectLabel}</span>
        <span>{plan.fields.status.label}</span>
        <span>Team</span>
        <span>Remaining</span>
        <span>Projected</span>
        <span />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
        <SortableContext items={active.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {active.map((p, i) => (
            <Row
              key={p.id}
              project={p}
              rank={i + 1}
              statusColor={statuses[p.statusOptionId]?.color}
              statusLabel={statuses[p.statusOptionId]?.label ?? "—"}
              schedule={schedule}
              onEdit={() => { setEditing(p); setDialogOpen(true); }}
              onDelete={() => setConfirmDelete(p)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <ProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} />
      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.name}?`}
        body="This removes the project and its assignments. You can undo this."
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmDelete && deleteProject(confirmDelete.id)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function Row({
  project, rank, statusColor, statusLabel, schedule, onEdit, onDelete,
}: {
  project: Project;
  rank: number;
  statusColor?: string;
  statusLabel: string;
  schedule: ReturnType<typeof useSchedule>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const plan = useActivePlan();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  const store = useStore();
  const s = schedule.projects[project.id];
  const onHold = statusLabel && project.statusOptionId === "status_onhold";
  const isDone = project.statusOptionId === "status_done";

  const assignees = plan.assignments.filter((a) => a.projectId === project.id);
  const overAlloc = schedule.overAllocatedProjectIds.has(project.id);

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[28px_28px_1fr_120px_110px_130px_180px_36px] items-center gap-2 border-b border-border px-3 py-2.5 transition ${isDragging ? "bg-accent-soft" : "hover:bg-surface-2"} ${onHold || isDone ? "opacity-55" : ""}`}
    >
      <button className="flex h-6 w-6 cursor-grab items-center justify-center text-ink-muted active:cursor-grabbing" {...attributes} {...listeners} aria-label="Drag to reorder">
        <IconGrip />
      </button>
      <span className="text-sm font-semibold text-ink-muted">{rank}</span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{project.name}</div>
        <div className="text-[11px] text-ink-muted">{project.effortDays > 0 ? `${project.effortDays}d total` : "no estimate"}</div>
      </div>
      <div>
        <StatusMenu projectId={project.id} color={statusColor} label={statusLabel} />
      </div>
      <div className="flex -space-x-1.5">
        {assignees.slice(0, 4).map((a) => {
          const t = plan.teammates.find((x) => x.id === a.teammateId);
          const over = schedule.teammates[a.teammateId]?.overAllocated;
          return (
            <span
              key={a.id}
              title={`${t?.name} · ${a.allocationPct}%${over ? " (over-allocated)" : ""}`}
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface text-[10px] font-semibold text-white ${over ? "ring-2 ring-amber-400" : ""}`}
              style={{ background: colorFor(t?.name ?? "?") }}
            >
              {(t?.name ?? "?").slice(0, 2)}
            </span>
          );
        })}
        {assignees.length === 0 && <span className="text-[11px] text-ink-muted">—</span>}
      </div>
      <InlineDaysRemaining
        value={project.daysRemaining}
        disabled={isDone}
        onSave={(v) => store.setDaysRemaining(project.id, v)}
      />
      <div><ScheduleCell s={s} overAllocated={overAlloc} /></div>
      <div className="flex justify-end">
        <Menu trigger={<IconButton label="Row actions"><IconDots /></IconButton>}>
          {(close) => (
            <>
              <MenuItem onClick={() => { store.sendToTop(project.id); close(); }}><IconTop /> Send to top</MenuItem>
              <MenuItem onClick={() => { store.sendToBottom(project.id); close(); }}><IconBottom /> Send to bottom</MenuItem>
              <MenuItem onClick={() => { onEdit(); close(); }}><IconPencil /> Edit</MenuItem>
              <MenuItem onClick={() => { store.archiveProject(project.id); close(); }}><IconArchive /> Archive</MenuItem>
              <MenuItem danger onClick={() => { onDelete(); close(); }}><IconTrash /> Delete</MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  );
}

function StatusMenu({ projectId, color, label }: { projectId: string; color?: string; label: string }) {
  const plan = useActivePlan();
  const setStatus = useStore((s) => s.setProjectStatus);
  return (
    <Menu align="left" trigger={<button className="cursor-pointer"><Pill color={color}>{label}</Pill></button>}>
      {(close) => (
        <>
          {plan.fields.status.options.map((o) => (
            <MenuItem key={o.id} onClick={() => { setStatus(projectId, o.id); close(); }}>
              <span className="h-2 w-2 rounded-full" style={{ background: o.color }} /> {o.label}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}

function InlineDaysRemaining({ value, onSave, disabled }: { value: number; onSave: (v: number) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  if (disabled) return <span className="text-sm text-ink-muted">{value}d</span>;
  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onSave(Number(draft) || 0); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") { onSave(Number(draft) || 0); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
        className="w-20 rounded-md border border-accent bg-canvas px-2 py-1 text-sm outline-none"
      />
    );
  }
  return (
    <button onClick={() => { setDraft(String(value)); setEditing(true); }} className="rounded px-2 py-1 text-left text-sm hover:bg-surface-2" title="Click to edit days remaining">
      <span className="font-medium">{value}</span>
      <span className="text-ink-muted">d left</span>
    </button>
  );
}

function EmptyState({ onAdd, label }: { onAdd: () => void; label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
      <p className="text-sm font-medium">No {label.toLowerCase()}s yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">Add a teammate from the team panel, then create your first {label.toLowerCase()} to see a forecast.</p>
      <div className="mt-4 flex justify-center">
        <Button variant="primary" onClick={onAdd}><IconPlus /> New {label.toLowerCase()}</Button>
      </div>
    </div>
  );
}

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#4f46e5"];
export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
