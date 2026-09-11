/**
 * The portable workspace file (`.reado-workspace`).
 *
 * Reado can open several folders at once, and has always remembered which ones
 * in `.reado/workspace.json` — inside whichever folder happened to be primary.
 * That makes the workspace a property of one folder: it cannot be opened
 * directly, committed as "how this project is worked on", or handed to someone
 * else. Open the second folder first and the workspace does not exist.
 *
 * This is the same list as a file you open. The format is VS Code's, because
 * there is no reason to invent a second one and a reader may already know that
 * one; paths are written relative to the file wherever they can be, so the file
 * survives being committed and cloned somewhere else.
 */
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog"
import { t } from "@/i18n"
import { listDir, readSettingsFile, writeSettingsFile } from "./api"
import { baseName } from "./comments"
import { createLogger, safeError } from "./logger"
import { notify, notifyError } from "./notice"
import { useProject } from "./store"
import { openWorkspaceWindow } from "./window"

const log = createLogger("workspace")

/** The extension the OS associates with Reado for workspaces. */
export const WORKSPACE_EXT = "reado-workspace"

/** Forward slashes, no trailing one — the shape every comparison here assumes. */
const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "")

/** The directory a path sits in. */
export const dirOf = (path: string) => norm(path).split("/").slice(0, -1).join("/") || "/"

/** Resolve `rel` against `base`, collapsing `.` and `..`. Absolute stays as it is. */
export function resolvePath(base: string, rel: string): string {
  const path = norm(rel)
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return path
  const parts = norm(base).split("/")
  for (const segment of path.split("/")) {
    if (segment === "." || segment === "") continue
    if (segment === "..") parts.pop()
    else parts.push(segment)
  }
  return parts.join("/") || "/"
}

/** `to` expressed relative to `from`, or the absolute path when they share no
 *  root (a workspace spanning two volumes is still a valid workspace). */
export function relativePath(from: string, to: string): string {
  const a = norm(from).split("/")
  const b = norm(to).split("/")
  if (a[0] !== b[0]) return norm(to)
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const up = a.length - i
  const down = b.slice(i)
  if (up === 0 && down.length === 0) return "."
  return [...Array(up).fill(".."), ...down].join("/") || "."
}

/** The file's content for a workspace of `folders`, as saved at `filePath`. */
export function serializeWorkspaceFile(filePath: string, folders: string[]): string {
  const dir = dirOf(filePath)
  const entries = folders.map((folder) => ({ path: relativePath(dir, folder) }))
  return `${JSON.stringify({ folders: entries }, null, 2)}\n`
}

/** The absolute folders a workspace file names, resolved against its own
 *  location. Entries that aren't strings are dropped rather than failing the
 *  whole file — half a workspace beats none. */
export function parseWorkspaceFile(filePath: string, json: string): string[] {
  try {
    const parsed = JSON.parse(json) as { folders?: unknown }
    if (!Array.isArray(parsed?.folders)) return []
    const dir = dirOf(filePath)
    return parsed.folders
      .map((entry) =>
        typeof entry === "string"
          ? entry
          : typeof (entry as { path?: unknown })?.path === "string"
            ? (entry as { path: string }).path
            : null,
      )
      .filter((p): p is string => !!p)
      .map((p) => resolvePath(dir, p))
  } catch (e) {
    log.warn("malformed workspace file, ignoring", { error: safeError(e) })
    return []
  }
}

/**
 * The folders a workspace file names, minus the ones that are no longer there.
 *
 * A folder that has moved is reported and skipped: the rest of the workspace
 * opens, which beats a window that half-opens and says nothing.
 */
export async function foldersOfWorkspaceFile(path: string): Promise<string[]> {
  try {
    const folders = parseWorkspaceFile(path, await readSettingsFile(path))
    const checked = await Promise.all(
      folders.map(async (folder) => ((await pathExists(folder)) ? folder : null)),
    )
    for (const [i, folder] of folders.entries()) {
      if (!checked[i]) notify("error", t("workspace.fileMissing", { name: baseName(folder) }))
    }
    return checked.filter((f): f is string => f !== null)
  } catch (e) {
    log.warn("couldn't read the workspace file", { error: safeError(e) })
    return []
  }
}

/** Whether a folder is still there. `list_dir` is the cheapest existing probe —
 *  it answers for a directory and fails for anything that is not one. */
async function pathExists(folder: string): Promise<boolean> {
  try {
    await listDir(folder, "", false)
    return true
  } catch {
    return false
  }
}

/** Open a workspace file: every folder it names, in one window. */
export async function openWorkspaceFile(path: string): Promise<void> {
  try {
    const folders = parseWorkspaceFile(path, await readSettingsFile(path))
    if (!folders.length) {
      notify("error", t("workspace.fileEmpty"))
      return
    }
    await openWorkspaceWindow(folders[0], path)
  } catch (e) {
    notifyError("workspace", t("workspace.fileOpenFailed"), e)
  }
}

/** Pick a workspace file and open it. */
export async function pickWorkspaceFile(): Promise<void> {
  const picked = await openDialog({
    multiple: false,
    filters: [{ name: "Reado workspace", extensions: [WORKSPACE_EXT] }],
  })
  if (typeof picked === "string") await openWorkspaceFile(picked)
}

/** Save the open folders as a workspace file, and adopt it: from here on, adding
 *  or removing a folder updates that file. */
export async function saveWorkspaceAs(): Promise<void> {
  const { root, roots } = useProject.getState()
  if (!root) return
  const picked = await saveDialog({
    defaultPath: `${baseName(root)}.${WORKSPACE_EXT}`,
    filters: [{ name: "Reado workspace", extensions: [WORKSPACE_EXT] }],
  })
  if (typeof picked !== "string") return
  const folders = roots.length ? roots : [root]
  try {
    await writeSettingsFile(picked, serializeWorkspaceFile(picked, folders))
    useProject.getState().setWorkspaceFile(picked)
    notify("success", t("workspace.fileSaved", { name: baseName(picked) }))
  } catch (e) {
    notifyError("workspace", t("workspace.fileSaveFailed"), e)
  }
}

/** Write the current folder list back to the workspace file this window was
 *  opened from. No file, nothing to write — the caller falls back to `.reado/`. */
export async function updateWorkspaceFile(): Promise<boolean> {
  const { workspaceFile, root, roots } = useProject.getState()
  if (!workspaceFile) return false
  try {
    await writeSettingsFile(
      workspaceFile,
      serializeWorkspaceFile(workspaceFile, roots.length ? roots : [root]),
    )
  } catch (e) {
    log.warn("couldn't write the workspace file", { error: safeError(e) })
  }
  return true
}
