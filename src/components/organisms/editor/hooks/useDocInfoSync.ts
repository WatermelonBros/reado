import { LanguageDescription } from "@codemirror/language"
import type { Compartment } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import { type RefObject, useEffect, useState } from "react"
import { type EditorConfig, editorConfigFor } from "@/lib/api"
import {
  detectEol,
  detectIndent,
  type Eol,
  setEditorConfig as recordEditorConfig,
  useDocInfo,
} from "@/lib/docInfo"
import { languages } from "@/lib/languages"

/**
 * Keep the status bar's document info and this view in step: the language
 * override picked there, what the text looks like, and what `.editorconfig`
 * says. Returns the `.editorconfig` answer for this file, once it has been read.
 */
export function useDocInfoSync(
  viewRef: RefObject<EditorView | null>,
  {
    text,
    path,
    relPath,
    fileRoot,
    primary,
    encoding,
    langComp,
  }: {
    text: string
    path: string
    relPath: string
    fileRoot: string
    primary: boolean
    encoding?: string
    langComp: Compartment
  },
): EditorConfig | null {
  const languageOverride = useDocInfo((s) => s.languageOverride)
  /** What `.editorconfig` says about this file, once it has been read. */
  const [editorConfig, setEditorConfig] = useState<EditorConfig | null>(null)

  // Apply a manual language-mode override picked from the status bar.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !languageOverride) return
    const desc = languages.find((l) => l.name === languageOverride)
    if (!desc) {
      view.dispatch({ effects: langComp.reconfigure([]) }) // Plain Text
      return
    }
    desc.load().then((support) => {
      viewRef.current?.dispatch({ effects: langComp.reconfigure(support) })
    })
  }, [languageOverride, langComp])

  // Surface document info (line endings, indentation, language) to the status
  // bar. Detected from the raw text, since CodeMirror normalises line endings.
  // Only the primary pane drives the status bar.
  useEffect(() => {
    if (!primary) return
    const desc = LanguageDescription.matchFilename(languages, path)
    const ext = path.split(".").pop() ?? ""
    const language = desc?.name ?? (ext ? ext.toUpperCase() : "Plain Text")
    const indent = detectIndent(text)
    useDocInfo.getState().set({
      eol: detectEol(text),
      encoding: encoding ?? "utf-8",
      indentKind: indent.kind,
      indentSize: indent.size,
      language,
      languageOverride: null,
    })
  }, [text, path, primary, encoding])

  // `.editorconfig` outranks what the file looks like.
  //
  // Detection is a guess made from the bytes; the project's own file is the
  // answer, and honouring it is why committing one is worth anything. Applied
  // after the detection effect above (both run on open, in order), and recorded
  // per file so the save paths can obey the trim / final-newline rules too.
  useEffect(() => {
    let cancelled = false
    editorConfigFor(fileRoot, path)
      .then((cfg) => {
        if (cancelled) return
        setEditorConfig(cfg.applies ? cfg : null)
        recordEditorConfig(relPath, cfg)
        if (!cfg.applies || !primary) return
        const patch: { indentKind?: "spaces" | "tabs"; indentSize?: number; eol?: Eol } = {}
        if (cfg.indentStyle) patch.indentKind = cfg.indentStyle === "tab" ? "tabs" : "spaces"
        if (cfg.indentSize) patch.indentSize = cfg.indentSize
        // `cr`-only endings are a real editorconfig value and not something
        // Reado writes, so it is read as LF rather than silently mangled.
        if (cfg.endOfLine === "lf" || cfg.endOfLine === "crlf") {
          patch.eol = cfg.endOfLine.toUpperCase() as Eol
        }
        if (Object.keys(patch).length > 0) useDocInfo.getState().set(patch)
      })
      .catch(() => {
        if (!cancelled) setEditorConfig(null)
      })
    return () => {
      cancelled = true
    }
  }, [path, relPath, primary])

  return editorConfig
}
