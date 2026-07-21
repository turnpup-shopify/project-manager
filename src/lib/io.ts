import type { PlanState, PersistedFile } from "./types";

export function exportPlan(plan: PlanState) {
  const file: PersistedFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    plan,
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timeline-planner-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse + lightly validate an imported file. Throws on malformed input. */
export function parsePlanFile(text: string): PlanState {
  const data = JSON.parse(text) as PersistedFile;
  const plan = data?.plan;
  if (
    !plan ||
    !Array.isArray(plan.projects) ||
    !Array.isArray(plan.teammates) ||
    !Array.isArray(plan.assignments) ||
    !plan.fields?.status ||
    !plan.fields?.role
  ) {
    throw new Error("This doesn't look like a Timeline Planner export.");
  }
  return plan;
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
