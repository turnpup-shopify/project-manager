"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useActivePlan, useSchedule } from "@/lib/selectors";
import { exportPlan, parsePlanFile, readFileAsText } from "@/lib/io";
import { ProjectTable } from "./ProjectTable";
import { Roadmap } from "./Roadmap";
import { TeamPanel } from "./TeamPanel";
import { SchemaEditor } from "./SchemaEditor";
import { ArchivePanel } from "./ArchivePanel";
import { SandboxPanel } from "./SandboxPanel";
import { Button, IconButton, Menu, MenuItem, ConfirmDialog } from "./ui";
import {
  IconTable, IconRoadmap, IconBeaker, IconUndo, IconUsers, IconArchive,
  IconMenu, IconDownload, IconUpload,
} from "./icons";

export function AppShell() {
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  useEffect(() => { hydrate(); }, [hydrate]);

  if (!hydrated) {
    return <div className="flex h-screen items-center justify-center text-sm text-ink-muted">Loading your plan…</div>;
  }
  return <Shell />;
}

function Shell() {
  const plan = useActivePlan();
  const committed = useStore((s) => s.committed);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const inSandbox = useStore((s) => s.sandbox !== null);
  const enterSandbox = useStore((s) => s.enterSandbox);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const undo = useStore((s) => s.undo);
  const replaceAll = useStore((s) => s.replaceAll);
  const resetToSample = useStore((s) => s.resetToSample);
  const resetToEmpty = useStore((s) => s.resetToEmpty);

  const [teamOpen, setTeamOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [importConfirm, setImportConfirm] = useState<null | (() => void)>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = parsePlanFile(text);
      setImportConfirm(() => () => replaceAll(parsed));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  const teammateLabel = plan.fields.teammateLabel;
  const archivedCount = plan.projects.filter((p) => p.archived).length;

  return (
    <div className="min-h-screen">
      {inSandbox && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-amber-400 py-1.5 text-center text-xs font-semibold text-amber-950">
          <IconBeaker className="h-4 w-4" /> Sandbox mode — experimenting safely. Nothing is saved until you apply.
        </div>
      )}

      <header className={`sticky ${inSandbox ? "top-[30px]" : "top-0"} z-20 border-b border-border bg-surface/95 backdrop-blur`}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-sm font-bold text-white">T</div>
            <span className="text-sm font-semibold">Timeline Planner</span>
          </div>

          <div className="ml-2 flex rounded-lg bg-surface-2 p-0.5">
            <ViewBtn active={view === "table"} onClick={() => setView("table")}><IconTable /> Table</ViewBtn>
            <ViewBtn active={view === "roadmap"} onClick={() => setView("roadmap")}><IconRoadmap /> Roadmap</ViewBtn>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <IconButton label="Undo" disabled={!canUndo} onClick={undo}><IconUndo /></IconButton>
            <Button variant="ghost" onClick={() => setTeamOpen(true)}><IconUsers /> {teammateLabel}s</Button>
            <Button variant="ghost" onClick={() => setArchiveOpen(true)}><IconArchive /> Archive{archivedCount > 0 ? ` (${archivedCount})` : ""}</Button>
            {inSandbox ? (
              <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">In sandbox</span>
            ) : (
              <Button variant="default" onClick={enterSandbox}><IconBeaker /> What-if</Button>
            )}
            <Menu trigger={<IconButton label="Menu"><IconMenu /></IconButton>}>
              {(close) => (
                <>
                  <MenuItem onClick={() => { setSchemaOpen(true); close(); }}>Fields &amp; options…</MenuItem>
                  <MenuItem onClick={() => { exportPlan(committed); close(); }}><IconDownload /> Export JSON</MenuItem>
                  <MenuItem onClick={() => { fileRef.current?.click(); close(); }}><IconUpload /> Import JSON…</MenuItem>
                  <div className="my-1 border-t border-border" />
                  <MenuItem onClick={() => { resetToSample(); close(); }}>Load sample data</MenuItem>
                  <MenuItem danger onClick={() => { resetToEmpty(); close(); }}>Clear all data</MenuItem>
                </>
              )}
            </Menu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex gap-5">
          <div className="min-w-0 flex-1">
            {view === "table" ? <ProjectTable /> : <Roadmap />}
          </div>
          {inSandbox && <SandboxPanel />}
        </div>
      </main>

      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />
      <TeamPanel open={teamOpen} onClose={() => setTeamOpen(false)} />
      <SchemaEditor open={schemaOpen} onClose={() => setSchemaOpen(false)} />
      <ArchivePanel open={archiveOpen} onClose={() => setArchiveOpen(false)} />
      <ConfirmDialog
        open={!!importConfirm}
        title="Replace current data?"
        body="Importing overwrites your current plan. This can be undone."
        confirmLabel="Import & replace"
        onConfirm={() => importConfirm?.()}
        onClose={() => setImportConfirm(null)}
      />
      <ConfirmDialog
        open={!!importError}
        title="Import failed"
        body={importError ?? ""}
        confirmLabel="OK"
        onConfirm={() => {}}
        onClose={() => setImportError(null)}
      />
    </div>
  );
}

function ViewBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition ${active ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}>
      {children}
    </button>
  );
}
