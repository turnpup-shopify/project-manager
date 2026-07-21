# Working in this repo

Timeline Planner — a single-user, client-side project completion forecaster.
Next.js App Router + TypeScript + Tailwind + Zustand. No backend; data is in
localStorage. Deploys to Vercel with zero config.

## Ground rules

- **All capacity/date math goes in `src/lib/engine.ts`.** It is a pure function
  with no I/O and no store access. If you touch scheduling behavior, add/adjust a
  case in `src/lib/engine.test.ts` and run `npm test`. The two acceptance-criteria
  tests encode the spec's contract — don't break them without a spec reason.
- **The data model is JSON-serializable, always.** No class instances, Dates, or
  functions in `PlanState`. Dates are ISO `"YYYY-MM-DD"` strings. This is what
  export/import, persistence, undo, and sandbox all rely on.
- **State flows through the store.** Components never mutate plan data directly;
  they call actions in `src/lib/store.ts`. Every committed mutation snapshots for
  undo, re-stamps `targetDate` (for honest staleness), and saves to localStorage.
  Sandbox edits go to a separate transient plan and touch none of that.
- **Behavior-bearing dropdown options** (On hold releases capacity, Done leaves
  the forecast) are matched by the stable ids in `src/lib/semantics.ts`, never by
  label — labels are user-editable. Deleting an in-use option must remap first.

## Commands

```bash
npm run dev       # local dev
npm test          # engine tests (Vitest, node env)
npm run build     # must pass before committing
```

## Layout

- `src/lib` — model, engine, store, selectors, date helpers, io. Pure/logic layer.
- `src/components` — UI. `ui.tsx` holds shared primitives (Button, Modal, Menu…).
- `src/app` — Next shell; `page.tsx` loads the app client-only (`ssr:false`) to
  avoid hydration mismatch with localStorage.

## Extending

- New dropdown-backed field: add to `PlanState.fields`, seed in `defaults.ts`,
  add store actions mirroring status/role, wire into `SchemaEditor`.
- P1/P2 features (confidence ranges, per-person load, scenario snapshots,
  multi-plan) should reuse `computeSchedule` and the single-plan store shape.
  See README "Designed for multiple plans".
