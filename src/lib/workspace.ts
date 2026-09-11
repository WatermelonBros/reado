/**
 * Workspaces: more than one folder open in one window.
 *
 * Every backend command already takes the root it should act on, so multi-root
 * is a frontend question — which root owns *this* file. `rootFor` answers it,
 * and the rule is the longest folder that is a prefix of the path, so a checkout
 * nested inside another still resolves to the nearer one.
 *
 * The list lives in the primary folder's `.reado/workspace.json`, next to that
 * folder's annotations. That is the deliberate boundary: annotations, the
 * comment index and the per-project config belong to a folder, and each folder
 * keeps its own. Only the *list* is workspace-wide.
 */
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { t } from "@/i18n"
import { readReadoFile, writeProjectConfig } from "./api"
import { baseName } from "./comments"
import { createLogger, safeError } from "./logger"
import { notify } from "./notice"
import { useProject } from "./store"

const log = createLogger("workspace")

/** The file the folder list lives in, under the primary folder's `.reado/`. */
export const WORKSPACE_FILE = "workspace.json"

/** Normalise a path for prefix comparison: forward slashes, no trailing one. */
const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "")

/**
 * Which workspace folder owns `path`.
 *
 * The longest match wins, so a repository checked out inside another one
 * resolves to the inner folder — the one whose `.reado/` and `.gitignore` the
 * file is actually governed by. A path under none of them falls back to the
 * primary root, which is what every single-folder call already assumed.
 */
export function rootFor(path: string, roots?: string[]): string {
  const state = useProject.getState()
  // `roots` is absent in a settings blob written before workspaces existed, and
  // in any store standing in for the real one.
  const known = roots ?? state.roots ?? []
  const list = known.length > 0 ? known : [state.root]
  const target = norm(path)
  let best = ""
  for (const candidate of list) {
    const root = norm(candidate)
    if (!root) continue
    if (target === root || target.startsWith(`${root}/`)) {
      if (root.length > best.length) best = candidate
    }
  }
  return best || state.root
}

/**
 * Run a root-scoped call across every workspace folder and concatenate.
 *
 * With one folder — the usual case — this is the same single call it always
 * was. A folder that fails (unmounted, permissions) contributes nothing rather
 * than failing the whole answer: half a file list beats none.
 */
export async function acrossRoots<T>(
  roots: string[],
  call: (root: string) => Promise<T[]>,
): Promise<T[]> {
  const results = await Promise.all(roots.map((r) => call(r).catch(() => [] as T[])))
  return results.flat()
}

/** The workspace's folders — the roots list, or the single root before one has
 *  been loaded. Every "across the whole project" call fans out over this. */
export function workspaceRoots(): string[] {
  const { roots, root } = useProject.getState()
  if (roots?.length) return roots
  return root ? [root] : []
}

/** The folder list as it should be written: the primary one is implied by where
 *  the file lives, so only the others are stored. */
export function serializeWorkspace(roots: string[]): string {
  return `${JSON.stringify({ folders: roots.slice(1) }, null, 2)}\n`
}

/** Parse a workspace file into the extra folder paths it names. */
export function parseWorkspace(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as { folders?: unknown }
    if (!Array.isArray(parsed?.folders)) return []
    return parsed.folders.filter((f): f is string => typeof f === "string" && f.length > 0)
  } catch (e) {
    log.warn("malformed workspace.json, ignoring", { error: safeError(e) })
    return []
  }
}

/** The extra folders the primary root's workspace file names. */
export async function loadWorkspace(root: string): Promise<string[]> {
  const json = await readReadoFile(root, WORKSPACE_FILE).catch(() => null)
  return json ? parseWorkspace(json) : []
}

/**
 * Persist the current folder list.
 *
 * Written through the project-config command, which is confined to `.reado/` —
 * the workspace list is project data, not a path the frontend gets to choose.
 */
export async function saveWorkspace(): Promise<void> {
  const { root, roots } = useProject.getState()
  if (!root) return
  // A window opened from a portable workspace file writes back to *that* file:
  // the list the user opened is the list they expect to be editing.
  const { updateWorkspaceFile } = await import("./workspaceFile")
  if (await updateWorkspaceFile()) return
  await writeWorkspaceFile(root, roots)
}

async function writeWorkspaceFile(root: string, roots: string[]): Promise<void> {
  try {
    await writeProjectConfig(root, serializeWorkspace(roots), WORKSPACE_FILE)
  } catch (e) {
    log.warn("couldn't write workspace.json", { error: safeError(e) })
  }
}

/** Pick a folder and add it to the workspace. */
export async function addWorkspaceFolder(): Promise<void> {
  const picked = await openDialog({ directory: true, multiple: false })
  if (typeof picked !== "string") return
  const { roots, root } = useProject.getState()
  if (roots.includes(picked) || picked === root) return
  useProject.getState().addRoot(picked)
  await saveWorkspace()
  useProject.getState().bumpTree()
  notify("info", t("workspace.added", { name: baseName(picked) }))
}

/** Take a folder back out. The primary one stays — that is "close project". */
export async function removeWorkspaceFolder(path: string): Promise<void> {
  if (path === useProject.getState().root) return
  useProject.getState().removeRoot(path)
  await saveWorkspace()
  useProject.getState().bumpTree()
  notify("info", t("workspace.removed", { name: baseName(path) }))
}
