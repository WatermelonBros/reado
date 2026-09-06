/**
 * Which formatter runs, per project.
 *
 * Detection answers this on its own almost always: a project that declares
 * Prettier gets Prettier. The override is for the rest — a repo where the
 * declaration is wrong, or absent, or where you simply want the other one. It is
 * stored per project root, because "use Prettier here" is a fact about one
 * repository and would be wrong applied to the next.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createLogger } from "./logger"

const log = createLogger("formatters")

/** `off` disables formatting for that file type in that project. */
export type Override = string | "off"

interface FormatterState {
  /** root → file extension → formatter id, or `off`. */
  byRoot: Record<string, Record<string, Override>>
  /** The override for a file type in a project, if any. */
  get: (root: string, ext: string) => Override | undefined
  /** Pin a formatter, disable formatting, or clear the override (`null`). */
  set: (root: string, ext: string, value: Override | null) => void
}

export const useFormatterOverrides = create<FormatterState>()(
  persist(
    (set, get) => ({
      byRoot: {},
      get: (root, ext) => get().byRoot[root]?.[ext.toLowerCase()],
      set: (root, ext, value) => {
        const key = ext.toLowerCase()
        log.info("formatter override", { root, ext: key, value })
        set((s) => {
          const forRoot = { ...(s.byRoot[root] ?? {}) }
          if (value === null) delete forRoot[key]
          else forRoot[key] = value
          // Drop the project's entry entirely once it holds nothing, so the
          // store doesn't accumulate a row per repository ever opened.
          const byRoot = { ...s.byRoot }
          if (Object.keys(forRoot).length === 0) delete byRoot[root]
          else byRoot[root] = forRoot
          return { byRoot }
        })
      },
    }),
    { name: "reado.formatters" },
  ),
)

/** The file extension a formatter override is keyed on. */
export const extOf = (path: string) => path.split(".").pop()?.toLowerCase() ?? ""

/** What formatting should do for a file: run a specific formatter, run whatever
 *  the project declares, or nothing at all. */
export type Choice = { kind: "pinned"; id: string } | { kind: "detect" } | { kind: "off" }

export function choiceFor(root: string, path: string): Choice {
  const override = useFormatterOverrides.getState().get(root, extOf(path))
  if (override === "off") return { kind: "off" }
  if (override) return { kind: "pinned", id: override }
  return { kind: "detect" }
}
