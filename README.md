# Timeline Planner

A capacity-aware project completion forecaster for a single planner. Enter
projects with effort estimates and staffing, drag to reprioritize, and every
completion date reforecasts instantly — no manual date math.

Built with **Next.js (App Router) + TypeScript + Tailwind + Zustand**. All data
lives in your browser (localStorage); there is no server, no account, no
tracking. Deploys to Vercel as a static-ish client app.

---

## Features (MVP / P0)

- **Scheduling engine** — completion = days-remaining ÷ effective daily capacity,
  walked forward on a business-day calendar (weekends skipped). Priority-first:
  a teammate's capacity flows to their highest-priority project first; lower work
  queues behind. Allocation % lets people split across projects. Time off
  subtracts capacity. Recalculates in well under a second.
- **Priority management** — one ranked list, drag to reorder, no typed numbers.
  Send-to-top / send-to-bottom in each row menu.
- **What-if sandbox** — a tinted, banner-marked mode where every edit is safe.
  A side panel shows per-project deltas ("slips 8d" / "12d sooner"). Apply commits;
  Discard reverts; closing the app discards.
- **Month-by-month roadmap** — horizontal timeline, bars snapped to
  early/mid/late-month (never day-precise), deliverable diamonds labeled
  "Wk N · Mon", a Today line, and click-a-bar popovers. Toggle with the table.
- **Progress & staleness** — inline "days remaining" edits recalculate on save.
  A project whose *committed* target date passes without being marked Done goes
  **red** — dates never silently auto-push.
- **Lifecycle & archive** — On hold releases capacity but keeps its slot; Done
  leaves the forecast; archived projects move to a restorable list.
- **Editable dropdown schemas** — rename/add/delete/reorder Status and Role
  options (and rename the "Project"/"Teammate" nouns) from Fields & options.
  Deleting an in-use option forces a remap so nothing is orphaned.
- **Data safety** — persists locally on every change; export/import full JSON;
  single-level+ undo for reorders, deletions, and option deletions.
- **Honest edge states** — unstaffed ("no date"), over-allocated (>100%),
  missing estimate ("Needs estimate"), and a friendly empty-state hint.

See `Project Timeline Planner — MVP Requirements` for the full spec this
implements. P1/P2 items are intentionally not built but the data model is shaped
to make them cheap (see below).

---

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine unit tests (Vitest)
npm run build      # production build
```

Node 20+ recommended.

## Deploy (GitHub + Vercel)

1. Push this repo to GitHub.
2. In Vercel, **New Project → Import** the repo.
3. Framework preset auto-detects **Next.js**. No env vars, no build config needed.
   Build command `next build`, output handled automatically.
4. Deploy. That's it — the app is fully client-side, so there is nothing to
   provision.

> Because data lives in the browser, each device/browser has its own plan. Use
> **Export JSON** to move a plan between machines (and as a backup).

---

## Architecture

```
src/
  lib/
    types.ts        # JSON-serializable data model (the single source of truth)
    engine.ts       # PURE scheduling engine — all capacity math lives here
    engine.test.ts  # acceptance-criteria + behavior tests
    date.ts         # business-day calendar, week-of-month, roadmap snapping
    semantics.ts    # stable ids for behavior-bearing status/role options
    defaults.ts     # empty plan + sample plan
    store.ts        # Zustand store: mutations, undo, sandbox, persistence
    selectors.ts    # derived schedule + sandbox deltas (React hooks)
    io.ts           # export / import
  components/        # all UI (table, roadmap, dialogs, panels, primitives)
  app/               # Next.js App Router shell (client-only page)
```

**Why the engine is isolated:** the spec calls for future confidence ranges
(optimistic/likely/pessimistic) and estimate-vs-actual calibration. Keeping every
bit of capacity math in one pure function (`computeSchedule(plan, today)`) means a
second pass is a wrapper, not a rewrite. It's also why it's the most heavily
tested part of the codebase.

**Scheduling model in one paragraph:** the simulation steps forward one business
day at a time. Each teammate has a daily capacity (`workingDaysPerWeek / 5`, zero
during time off). That capacity is poured into their assigned projects in priority
order, each project capped at its `allocation %` of the day. A project completes on
the business day its remaining effort hits zero. "Spare capacity only" projects are
served after all preempting work regardless of list position. On-hold and Done
projects are excluded, releasing their teammates to everyone else.

### Designed for multiple plans (future)

Today the app holds one `PlanState`. That type is deliberately the *whole* unit
that gets persisted, exported, undone, and sandboxed — with no globals leaking in.
Supporting multiple projects/workspaces later is a matter of wrapping a
`Record<planId, PlanState>` and adding a plan switcher; the engine, store
mutations, and components already operate on a single plan passed in. Nothing in
the model assumes there is only one.

---

## Open-question conventions (from the spec)

- **Week of month:** Wk 1 = days 1–7, Wk 2 = 8–14, Wk 3 = 15–21, Wk 4 = 22–end.
- **On hold:** keeps its priority slot, greyed out.
- **Rounding:** a project finishing mid-day lands on that same business day.
