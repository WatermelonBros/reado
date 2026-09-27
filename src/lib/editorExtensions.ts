/**
 * What a build embedding Reado adds to its editors: CodeMirror extensions for the
 * editors it opens, and guards that keep a buffer from being written to disk —
 * the official build's co-editing uses both (a guest's shared files are saved by
 * the session's host, never by the guest). The community build registers none,
 * so every editor, and every save, is exactly the core's.
 *
 * Like the slots, a plain module-level registry: contributions are fixed per build
 * and registered before `boot()`.
 */
import type { Extension } from "@codemirror/state"

/** The editor being opened: its project, file (project-relative) and whether it
 *  is the primary pane's. */
export interface EditorContext {
  root: string
  relPath: string
  primary: boolean
}

export type EditorExtensionFactory = (ctx: EditorContext) => Extension

const factories: EditorExtensionFactory[] = []

export function registerEditorExtension(factory: EditorExtensionFactory): void {
  factories.push(factory)
}

export function editorExtensionsFor(ctx: EditorContext): Extension[] {
  return factories.map((f) => f(ctx))
}

/** Says a file (project-relative, under `root`) must not be written right now. */
export type WriteGuard = (root: string, path: string) => boolean

const guards: WriteGuard[] = []

export function registerWriteGuard(guard: WriteGuard): void {
  guards.push(guard)
}

/** Whether any guard holds `path` back. Every write of a file goes through here. */
export const writeBlocked = (root: string, path: string): boolean =>
  guards.some((g) => g(root, path))

/** Test-only: forget every registration. */
export function resetEditorExtensionsForTest(): void {
  factories.length = 0
  guards.length = 0
}
