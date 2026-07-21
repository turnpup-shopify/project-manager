// ---------------------------------------------------------------------------
// Semantic status keys.
//
// Status options are user-editable (rename, recolor, reorder, add, delete), but
// a few carry *behavior* the scheduling engine depends on: "on hold" releases
// capacity, "done" leaves the forecast. Rather than match on labels (which the
// user can change), those built-in options keep stable ids and the engine keys
// off them. The remap-on-delete flow guarantees no project ever points at a
// missing id, so these ids are always valid when referenced.
// ---------------------------------------------------------------------------

export const STATUS = {
  PLANNED: "status_planned",
  ACTIVE: "status_active",
  ONHOLD: "status_onhold",
  DONE: "status_done",
} as const;

export const ROLE = {
  ENG: "role_eng",
  DESIGN: "role_design",
  PM: "role_pm",
} as const;
