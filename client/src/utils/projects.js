// Display labels for project states (server values: active | on_hold | completed | archived).
export const PROJECT_STATE_LABELS = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

// States a manager can pick directly; archive/restore are separate actions.
/** @type {import("@/types/models").ProjectState[]} */
export const SETTABLE_PROJECT_STATES = ["active", "on_hold", "completed"];
