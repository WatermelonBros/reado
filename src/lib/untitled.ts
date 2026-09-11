/**
 * Untitled buffers — a document that is not a file yet.
 *
 * Reado's tabs are path strings, and every path it opens is absolute. That is
 * what makes a scratch buffer cheap: give it an id no real path can be
 * (`untitled:1`) and it travels through the tab strip, the split pane, the
 * session and the navigation stack as itself, with no second document model to
 * keep in step. What changes is only the *sink*: the text lives here instead of
 * on disk, so nothing reads or writes a file for one.
 *
 * Keyed by project root as well as id: one window per project, but the same
 * localStorage behind all of them — two projects each get their own
 * `Untitled-1`, and neither sees the other's text.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { useProject } from "./store"

/** The tab id prefix. `untitled:` can never collide with a path Reado opens. */
const PREFIX = "untitled:"

/** Is this tab a scratch buffer rather than a file? */
export const isUntitled = (path: string): boolean => path.startsWith(PREFIX)

/** The tab id for the nth untitled buffer. */
export const untitledId = (n: number): string => `${PREFIX}${n}`

/** What the tab shows: `Untitled-1`, not the id it is keyed by. */
export const untitledName = (path: string): string => `Untitled-${path.slice(PREFIX.length)}`

/** The project these buffers belong to ("" when no folder is open — the case
 *  where a scratch buffer is wanted most). */
const currentRoot = () => useProject.getState().root

interface UntitledState {
  /** Buffer text, by project root then tab id. */
  texts: Record<string, Record<string, string>>
  textOf: (path: string) => string
  setText: (path: string, text: string) => void
  drop: (path: string) => void
}

export const useUntitled = create<UntitledState>()(
  persist(
    (set, get) => ({
      texts: {},
      textOf: (path) => get().texts[currentRoot()]?.[path] ?? "",
      setText: (path, text) =>
        set((s) => {
          const root = currentRoot()
          return { texts: { ...s.texts, [root]: { ...s.texts[root], [path]: text } } }
        }),
      drop: (path) =>
        set((s) => {
          const root = currentRoot()
          const { [path]: _gone, ...rest } = s.texts[root] ?? {}
          return { texts: { ...s.texts, [root]: rest } }
        }),
    }),
    { name: "reado.untitled" },
  ),
)

/**
 * The lowest number not currently open.
 *
 * Not "one more than the highest": closing `Untitled-1` and asking for another
 * should give `Untitled-1` back, rather than climbing forever across a session
 * of scratch buffers.
 */
export function nextUntitledId(openTabs: string[]): string {
  const taken = new Set(openTabs.filter(isUntitled))
  for (let n = 1; ; n++) {
    const id = untitledId(n)
    if (!taken.has(id)) return id
  }
}
