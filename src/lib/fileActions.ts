import { t } from "@/i18n"
import { createDir, createFile, readFile, writeFile } from "@/lib/api"
import { toRelative } from "@/lib/comments"
import { notify } from "@/lib/notice"
import { prompt } from "@/lib/prompt"
import { noteSelfWrite } from "@/lib/readProgress"
import { useEditorActions, useProject } from "@/lib/store"
import { isUntitled, nextUntitledId, useUntitled } from "@/lib/untitled"
import { applyEol, type Eol, useDocInfo } from "./docInfo"
import { encodingFor, eolFor, liveViews } from "./liveViews"
import { applyHygiene } from "./save"

/** Prompt for a name and create a new empty file in the project, then open it. */
export async function newFile(): Promise<void> {
  const root = useProject.getState().root
  if (!root) return
  const name = await prompt({
    title: t("file.newFile"),
    placeholder: "path/name.ext",
    confirmLabel: t("file.create"),
  })
  if (!name) return
  try {
    const abs = await createFile(root, name)
    useProject.getState().open(abs)
    useProject.getState().bumpTree()
  } catch {
    /* already exists / invalid path */
  }
}

/**
 * Open an empty buffer with no path — the "open Reado and start typing" case.
 *
 * Deliberately asks for nothing: not a name, not a folder, not even a project.
 * Editing goes on so the caret is live the moment it opens; a read-first default
 * is right for someone else's code, not for a page you are writing yourself.
 */
export function newUntitled(): void {
  const id = nextUntitledId(useProject.getState().tabs)
  useUntitled.getState().setText(id, "")
  useEditorActions.getState().setEditing(true)
  useProject.getState().open(id)
}

/** Create a folder at a prompted, project-relative path. */
export async function newFolder(): Promise<void> {
  const root = useProject.getState().root
  if (!root) return
  const name = await prompt({
    title: t("tree.newFolder"),
    placeholder: "path/name",
    confirmLabel: t("file.create"),
  })
  if (!name) return
  try {
    await createDir(root, name)
    useProject.getState().bumpTree()
  } catch {
    /* already exists / invalid path */
  }
}

/** Prompt for a destination and write the active buffer there, then open it. */
export async function saveAs(): Promise<void> {
  const { view } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view) return
  // The buffer being saved, which is the focused pane's — not `active`, which is
  // the *primary* pane's file and would name the wrong document in a split.
  const from = liveViews.get(view)?.rel ?? active ?? ""
  const scratch = isUntitled(from)
  if (!root) {
    // Every write is confined to an open folder, so there is nowhere to put it.
    notify("info", t("file.untitledNeedFolder"))
    return
  }
  const dest = await prompt({
    title: t("file.saveAs"),
    // A scratch buffer has no path to offer back as the default.
    value: scratch ? "" : active ? toRelative(root, active) : "",
    confirmLabel: t("editor.save"),
  })
  if (!dest) return
  await createFile(root, dest).catch(() => {}) // ensure it exists (no-op if so)
  noteSelfWrite(dest)
  // A copy of this buffer, not a re-encoding of it: the new file keeps the
  // endings and the charset the old one had.
  const rel = liveViews.get(view)?.rel
  const out = applyEol(applyHygiene(view.state.doc.toString(), rel), eolFor(view))
  await writeFile(root, dest, out, encodingFor(view)).catch(() => {})
  if (scratch) {
    // The buffer *becomes* the file: swap the tab where it stands, rather than
    // opening a second one beside the scratch tab it came from.
    useProject.getState().renamePath(from, `${root}/${dest}`)
    useEditorActions.getState().setDirty(from, false)
    useUntitled.getState().drop(from)
  } else {
    useProject.getState().open(`${root}/${dest}`)
  }
  useProject.getState().bumpTree()
}

/** Reload the active file from disk, discarding unsaved edits. */
export function revertFile(): void {
  const { view } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view || !active) return
  readFile(root, active)
    .then((c) => {
      if (c.kind !== "text") return
      noteSelfWrite(toRelative(root, active))
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: c.text },
      })
      useEditorActions.getState().setDirty(toRelative(root, active), false)
    })
    .catch(() => {})
}

/** Rewrite the active file with the chosen line endings (applies + saves). */
export function convertEol(eol: Eol): void {
  const { view, set } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view || !active) return
  const out = applyEol(view.state.doc.toString().replace(/\r\n/g, "\n"), eol)
  noteSelfWrite(toRelative(root, active))
  // Converting the endings must not also convert the charset.
  writeFile(root, toRelative(root, active), out, encodingFor(view))
    .then(() => {
      set({ eol })
      useEditorActions.getState().setDirty(toRelative(root, active), false)
    })
    .catch(() => {})
}
