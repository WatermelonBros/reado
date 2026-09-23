/**
 * Application state.
 *
 * Three persisted slices:
 *   - `useSettings` — global UI preferences (theme, fonts, reading aids).
 *   - `useRecents`  — recently opened projects, most-recent first.
 *   - `useSessions` — per-project session (open tabs + active file) for restore.
 *
 * Live, non-persisted project state (the loaded git info, the in-memory tab
 * list of the *current* window) lives in `useProject`.
 *
 * Each store lives in its own module under `store/`; this file re-exports them
 * so `@/lib/store` stays the one import site.
 */

export * from "./store/cursor"
export * from "./store/editorActions"
export * from "./store/palette"
export * from "./store/project"
export * from "./store/sessions"
export * from "./store/settings"
export * from "./store/workspace"
