import { create } from "zustand"
import { persist } from "zustand/middleware"

interface EditorActionsState {
  /** Bumped to request the active code view to open the comment composer. */
  composeNonce: number
  requestCompose: () => void
  /** Bumped to ask the active view to explain the current selection with AI. */
  explainNonce: number
  requestExplain: () => void
  /** Bumped to ask the active view to peek the definition at the cursor. */
  peekNonce: number
  requestPeek: () => void
  /** Bumped to open the code-action menu at the cursor (⌘.). */
  quickFixNonce: number
  requestQuickFix: () => void
  /** Manual editing enabled for the active file (read-first stays the default). */
  editing: boolean
  setEditing: (editing: boolean) => void
  /** Project-relative paths with unsaved changes. Per file, not global: the
   *  split pane edits a different file than the primary one, and a single flag
   *  made one pane's edits invisible to the other's auto-save. */
  dirtyPaths: string[]
  setDirty: (path: string, dirty: boolean) => void
  isDirty: (path: string) => boolean
  /** Show the active file as a diff against its committed version. */
  diffing: boolean
  setDiffing: (diffing: boolean) => void
  /** Show the conflict resolver for the active file instead of the editor. */
  resolvingConflict: boolean
  setResolvingConflict: (on: boolean) => void
  /**
   * The view the *next* opened file should land in, consumed once by the
   * editor.
   *
   * Opening a file and choosing its view are one intent, but two state writes:
   * the editor resets to the plain view whenever the active file changes, so a
   * caller that opened a file and then asked for the diff had its request wiped
   * by that reset — and only stuck on a second click, when the file was already
   * active and the reset didn't fire. Saying it up front removes the race.
   */
  pendingView: "diff" | "conflict" | null
  requestView: (view: "diff" | "conflict") => void
  /** Take the pending view, if any, leaving nothing behind for the next file. */
  takePendingView: () => "diff" | "conflict" | null
  /** The git ref the diff compares against (HEAD, a branch, or a commit hash),
   *  or one of the sentinels: the last-read snapshot, or what is on disk. */
  diffBase: string
  setDiffBase: (base: string) => void
  /** The unsaved buffer to diff, captured when "Compare with Saved" ran. Null
   *  when the diff is against a git ref, where the file on disk is the doc. */
  compareBuffer: string | null
  setCompareBuffer: (text: string | null) => void
  /** Show a per-line git blame gutter in the editor. */
  blame: boolean
  setBlame: (blame: boolean) => void
}

/** Bridge for triggering editor actions from outside the editor (e.g. global
 *  shortcuts or the command palette), without coupling to the editor's focus.
 *  `blame` and `diffBase` are persisted so a preferred view survives a restart;
 *  the transient nonces / dirty / diffing / editing flags are not. */
export const useEditorActions = create<EditorActionsState>()(
  persist(
    (set, get) => ({
      composeNonce: 0,
      requestCompose: () => set((s) => ({ composeNonce: s.composeNonce + 1 })),
      explainNonce: 0,
      requestExplain: () => set((s) => ({ explainNonce: s.explainNonce + 1 })),
      peekNonce: 0,
      requestPeek: () => set((s) => ({ peekNonce: s.peekNonce + 1 })),
      quickFixNonce: 0,
      requestQuickFix: () => set((s) => ({ quickFixNonce: s.quickFixNonce + 1 })),
      editing: false,
      setEditing: (editing) => set({ editing }),
      dirtyPaths: [],
      setDirty: (path, dirty) =>
        set((s) => {
          const has = s.dirtyPaths.includes(path)
          if (has === dirty) return s
          return {
            dirtyPaths: dirty ? [...s.dirtyPaths, path] : s.dirtyPaths.filter((p) => p !== path),
          }
        }),
      isDirty: (path) => get().dirtyPaths.includes(path),
      diffing: false,
      // Conflict resolution and the diff are two views of the same file; opening
      // one closes the other rather than stacking them.
      setDiffing: (diffing) => set({ diffing, resolvingConflict: false }),
      resolvingConflict: false,
      setResolvingConflict: (resolvingConflict) => set({ resolvingConflict, diffing: false }),
      pendingView: null,
      requestView: (pendingView) => set({ pendingView }),
      takePendingView: () => {
        const view = get().pendingView
        if (view) set({ pendingView: null })
        return view
      },
      diffBase: "HEAD",
      setDiffBase: (base) => set({ diffBase: base }),
      compareBuffer: null,
      setCompareBuffer: (compareBuffer) => set({ compareBuffer }),
      blame: false,
      setBlame: (blame) => set({ blame }),
    }),
    {
      name: "reado.editor",
      partialize: (s) => ({ blame: s.blame, diffBase: s.diffBase }),
    },
  ),
)

/** Diff base sentinel: the file as it is on disk, so unsaved edits can be seen
 *  as a diff ("Compare with Saved"). Not a git ref — no repository needed. */
export const SAVED_BASE = "reado:saved"

/** Diff base prefix for "compare these two files": the rest of the string is
 *  the project-relative path of the *other* file. Same sentinel shape as
 *  `SAVED_BASE`/`LAST_READ_BASE`, so a base is still one string. */
export const FILE_BASE = "reado:file:"

/** Diff base prefix for a local-history entry: the rest of the string is the
 *  copy's stamp. Same sentinel shape as the others — a base is one string. */
export const HISTORY_BASE = "reado:history:"
