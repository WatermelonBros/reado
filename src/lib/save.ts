import type { EditorView } from "@codemirror/view"
import { t } from "@/i18n"
import { formatFile, formatterStatus, writeFile } from "@/lib/api"
import { toRelative } from "@/lib/comments"
import { FORMATTERS, useExtensions } from "@/lib/extensions"
import { choiceFor, extOf } from "@/lib/formatters"
import { fileSaved, lspFormat, lspFormatRange } from "@/lib/lsp"
import { notify, notifyError } from "@/lib/notice"
import { noteSelfWrite } from "@/lib/readProgress"
import { useEditorActions, useProject, useSettings } from "@/lib/store"
import { isUntitled } from "@/lib/untitled"
import { applyEol, useDocInfo } from "./docInfo"
import { saveAs } from "./fileActions"
import { encodingFor, eolFor, fileConfigs, liveViews } from "./liveViews"

/** What a format attempt did. `none` — the project declares no formatter for
 *  this file, which is a normal outcome and not an error. `stale` — the buffer
 *  moved on while the formatter was working, so the result was dropped. */
export type FormatOutcome =
  // `ok` covers formatted and stale alike: both mean "say nothing". The
  // formatter's name is only carried where it gets spoken.
  | { kind: "ok" }
  | { kind: "unchanged"; formatter: string }
  | { kind: "none" }
  | { kind: "disabled" }
  | { kind: "error"; message: string }

/**
 * The one change that turns `a` into `b`, with their common prefix and suffix
 * trimmed off.
 *
 * Replacing the whole document instead — which is what this used to do — drops
 * the cursor and the scroll position on every format. Tolerable for a command
 * the user invokes; not tolerable once formatting runs on every save.
 */
function minimalChange(a: string, b: string) {
  const max = Math.min(a.length, b.length)
  let start = 0
  while (start < max && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  return { from: start, to: endA, insert: b.slice(start, endB) }
}

/**
 * Format the active document in place, quietly.
 *
 * The language server goes first when it offers formatting: it uses the
 * project's own rustfmt / gofmt / rubocop configuration, which a command-line
 * candidate can only approximate. Otherwise Reado runs a formatter this project
 * declares — never one that merely happens to be installed.
 */
export async function formatBuffer(): Promise<FormatOutcome> {
  const { view } = useDocInfo.getState()
  const { root, active } = useProject.getState()
  if (!view || !active) return { kind: "none" }

  const rel = toRelative(root, active)
  const choice = choiceFor(root, rel)
  if (choice.kind === "off") return { kind: "disabled" }

  // A pinned formatter outranks the server: the point of pinning is to say
  // "this one, here", and a server quietly winning would defeat it.
  if (choice.kind === "detect") {
    const viaServer = await lspFormat(view)
    if (viaServer)
      return viaServer === "formatted"
        ? { kind: "ok" }
        : { kind: "unchanged", formatter: t("editor.formatViaServer") }
  }

  const pinned = choice.kind === "pinned" ? choice.id : await firstEnabled(root, rel)
  if (pinned === "none") return { kind: "none" }

  const before = view.state.doc
  const content = before.toString()
  try {
    const res = await formatFile(root, rel, content, pinned)
    if (!res.formatter) return { kind: "none" }
    // The user kept typing while the formatter ran. Its text describes a
    // document that no longer exists, so it is dropped rather than applied.
    if (view.state.doc !== before) return { kind: "ok" }
    if (!res.changed) return { kind: "unchanged", formatter: res.formatter }
    view.dispatch({ changes: minimalChange(content, res.text) })
    return { kind: "ok" }
  } catch (e) {
    return { kind: "error", message: String(e) }
  }
}

/**
 * The formatter detection should land on, honouring the marketplace's
 * enable/disable state.
 *
 * `null` means "let the backend detect" — the common case, and free. Only when
 * the user has actually disabled a formatter does Reado ask which ones this
 * project declares, so it can skip past the disabled one. `"none"` means every
 * formatter this project declares for the file type is disabled.
 */
async function firstEnabled(root: string, rel: string): Promise<string | null | "none"> {
  const isEnabled = useExtensions.getState().isEnabled
  if (FORMATTERS.every((f) => isEnabled(f.id))) return null
  const ext = extOf(rel)
  try {
    const status = await formatterStatus(root)
    const usable = status.filter((s) => s.exts.includes(ext) && s.declared)
    if (usable.length === 0) return null // nothing declared; let the backend say so
    return usable.find((s) => isEnabled(s.id))?.id ?? "none"
  } catch {
    return null
  }
}

/** Format Document (palette, menu, Shift+Alt+F): formats the active buffer and
 *  reports what happened, so an unformattable file never looks like a no-op. */
export async function formatDocument(): Promise<FormatOutcome> {
  const outcome = await formatBuffer()
  if (outcome.kind === "error") notify("error", outcome.message)
  else if (outcome.kind === "none") notify("info", t("editor.formatNone"))
  else if (outcome.kind === "disabled") notify("info", t("editor.formatDisabled"))
  else if (outcome.kind === "unchanged")
    notify("info", t("editor.formatUnchanged", { name: outcome.formatter }))
  return outcome
}

/**
 * The text to write for the active buffer: format on save when enabled, then
 * the hygiene toggles over the result so the two never fight.
 *
 * Shared by both save paths (⌘S in the editor, File ▸ Save in the native menu),
 * which otherwise drift — the menu used to skip the hygiene toggles entirely.
 */
export async function textToSave(view: EditorView): Promise<string> {
  const s = useSettings.getState()
  if (s.formatOnSave) {
    // A failing formatter must never cost the user their save: report it and
    // write what they have.
    const outcome = await formatBuffer()
    if (outcome.kind === "error") notify("error", outcome.message)
  }
  return applyEol(applyHygiene(view.state.doc.toString(), liveViews.get(view)?.rel), eolFor(view))
}

/**
 * The on-write hygiene toggles (trim trailing whitespace, final newline),
 * without the formatter. Shared with the close-flush, which cannot format: by
 * then the formatter's idea of "the active document" is the next file.
 *
 * `.editorconfig` outranks the reader's own settings when it speaks: the file is
 * the project's answer about its own files, and the whole point of committing it
 * is that everyone's editor obeys it.
 */
export function applyHygiene(text: string, rel?: string): string {
  const s = useSettings.getState()
  const ec = rel ? fileConfigs.get(rel) : undefined
  const trim = ec?.trimTrailingWhitespace ?? s.trimTrailingWhitespace
  const finalNewline = ec?.insertFinalNewline ?? s.insertFinalNewline
  if (trim) text = text.replace(/[ \t]+$/gm, "")
  if (finalNewline && text.length > 0 && !text.endsWith("\n")) text += "\n"
  return text
}

/**
 * Save the focused pane to disk — ⌘S, File ▸ Save, and the native menu.
 *
 * The path comes from the registry, not from `useProject.active`: with the
 * editor split, the focused view is often the *other* file, and pairing its
 * text with the primary tab's path wrote one buffer over another file.
 */
export async function saveDocument(): Promise<void> {
  const { view } = useDocInfo.getState()
  const entry = view && liveViews.get(view)
  if (!view || !entry) return
  const { rel, root } = entry
  // A buffer with no path cannot be written back to one: Save *is* Save As.
  if (isUntitled(rel)) return saveAs()
  const text = await textToSave(view)
  noteSelfWrite(rel)
  writeFile(root, rel, text, encodingFor(view))
    .then(() => {
      useEditorActions.getState().setDirty(rel, false)
      fileSaved(view) // the formatter may have rewritten it; re-ask the server
    })
    .catch((e) => notifyError("docInfo", t("editor.saveError"), e))
}

/**
 * Save every pane with unsaved edits (⌥⌘S / File ▸ Save All).
 *
 * Only the focused pane goes through `textToSave`: format-on-save formats "the
 * active document", so running it for the other pane would format the wrong
 * buffer. The others get the hygiene toggles, exactly like the close-flush.
 */
export async function saveAll(): Promise<void> {
  const actions = useEditorActions.getState()
  const focused = useDocInfo.getState().view
  let count = 0
  for (const [view, { rel, root }] of liveViews) {
    if (!actions.isDirty(rel)) continue
    const text =
      view === focused
        ? await textToSave(view)
        : applyEol(applyHygiene(view.state.doc.toString(), rel), eolFor(view))
    noteSelfWrite(rel)
    try {
      await writeFile(root, rel, text, encodingFor(view))
      actions.setDirty(rel, false)
      count++
    } catch (e) {
      notifyError("docInfo", t("editor.saveError"), e)
    }
  }
  notify("info", t("editor.saveAllDone", { count }))
}

/** Format Selection: the language server's range formatter. The project's own
 *  formatters run over whole files, so when no server can do it we say that
 *  rather than silently formatting the whole document. */
export async function formatSelection(): Promise<void> {
  const { view } = useDocInfo.getState()
  if (!view) return
  if (view.state.selection.main.empty) {
    notify("info", t("menu.needSelection"))
    return
  }
  const res = await lspFormatRange(view)
  if (res === null) notify("info", t("editor.formatNoRange"))
  else if (res === "unchanged")
    notify("info", t("editor.formatUnchanged", { name: t("editor.formatViaServer") }))
}
