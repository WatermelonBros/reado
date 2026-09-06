/**
 * Contributed snippets, wired into the editor.
 *
 * Completion is switched on per file, and only when an installed extension
 * actually has snippets for that language. Reado is a read-first editor: a
 * completion popup appearing where none used to would be a behaviour change
 * nobody asked for, so a project with no snippet extensions gets exactly the
 * editor it had before.
 */
import { autocompletion, type CompletionSource } from "@codemirror/autocomplete"
import { LanguageDescription } from "@codemirror/language"
import type { Extension } from "@codemirror/state"
import { contributedLanguageData, resolvedLanguageId } from "./extLanguages"
import { hasSnippets, snippetsFor } from "./extSnippets"
import { languages } from "./languages"
import { enabledExtensions, useMarketplace } from "./marketplace"

/** Snippets for `path`'s language, if any extension contributes some. */
const source =
  (path: string): CompletionSource =>
  async (context) => {
    const word = context.matchBefore(/\w+/)
    if (!word || (word.from === word.to && !context.explicit)) return null

    const installed = enabledExtensions(useMarketplace.getState().installed)
    const language = resolvedLanguageId(installed, path)
    if (!hasSnippets(installed, language)) return null

    const fileName = path.split("/").pop() ?? path
    const options = await snippetsFor(installed, language, {
      fileName,
      directory: path.slice(0, path.length - fileName.length).replace(/\/$/, ""),
    })
    // `validFor` keeps CodeMirror filtering locally as the word grows, instead
    // of rebuilding every snippet's template on each keystroke.
    return options.length ? { from: word.from, options, validFor: /^\w*$/ } : null
  }

/** The completion extension for a file, or nothing when no extension
 *  contributes snippets for its language. */
export function contributedSnippets(path: string): Extension {
  const installed = enabledExtensions(useMarketplace.getState().installed)
  if (!hasSnippets(installed, resolvedLanguageId(installed, path))) return []
  return autocompletion({ override: [source(path)] })
}

/**
 * Comment tokens and auto-closing pairs for a file whose language only an
 * extension describes.
 *
 * Gated on Reado having no language pack of its own for the file: a built-in
 * pack's language data rides on a real syntax tree, and a JSON description is
 * not an improvement on that.
 */
export function contributedLanguage(path: string): Extension {
  if (LanguageDescription.matchFilename(languages, path)) return []
  const installed = enabledExtensions(useMarketplace.getState().installed)
  return contributedLanguageData(installed, resolvedLanguageId(installed, path))
}
