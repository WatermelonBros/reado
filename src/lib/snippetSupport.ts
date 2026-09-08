/**
 * Completion sources wired into the editor: the project's own snippets,
 * snippets contributed by extensions, and the words already in the document.
 *
 * Reado is a read-first editor, so completion is *available* everywhere but
 * quiet by default: nothing pops up while you type unless `suggestOnTyping` is
 * on, and ⌃Space always asks for it.
 */
import { autocompletion, type CompletionSource, completeAnyWord } from "@codemirror/autocomplete"
import { LanguageDescription } from "@codemirror/language"
import { EditorState, type Extension } from "@codemirror/state"
import { contributedLanguageData, resolvedLanguageId } from "./extLanguages"
import { hasSnippets, snippetsFor } from "./extSnippets"
import { languages } from "./languages"
import { enabledExtensions, useMarketplace } from "./marketplace"
import { useProject, useSettings } from "./store"
import { invalidateSnippets, projectSnippets } from "./userSnippets"

// Anything that changes files on disk bumps `treeNonce` — including a save of
// `.reado/snippets.json` itself. Dropping the cache there is what keeps an
// edited snippets file from needing a restart to take effect; the next
// completion re-reads it.
useProject.subscribe((s, prev) => {
  if (s.treeNonce !== prev.treeNonce || s.root !== prev.root) invalidateSnippets()
})

/** The variables a snippet body can interpolate for `path`. */
const contextFor = (path: string) => {
  const fileName = path.split("/").pop() ?? path
  return {
    fileName,
    directory: path.slice(0, path.length - fileName.length).replace(/\/$/, ""),
  }
}

/** Snippets for `path`'s language, if any extension contributes some. */
const source =
  (path: string): CompletionSource =>
  async (context) => {
    const word = context.matchBefore(/\w+/)
    if (!word || (word.from === word.to && !context.explicit)) return null

    const installed = enabledExtensions(useMarketplace.getState().installed)
    const language = resolvedLanguageId(installed, path)
    if (!hasSnippets(installed, language)) return null

    const options = await snippetsFor(installed, language, contextFor(path))
    // `validFor` keeps CodeMirror filtering locally as the word grows, instead
    // of rebuilding every snippet's template on each keystroke.
    return options.length ? { from: word.from, options, validFor: /^\w*$/ } : null
  }

/**
 * Snippets the project ships in `.reado/snippets.json`.
 *
 * Listed before the extension and word sources: a snippet the repository chose
 * to write down is a better suggestion than either.
 */
const projectSource =
  (path: string): CompletionSource =>
  async (context) => {
    const word = context.matchBefore(/\w+/)
    if (!word || (word.from === word.to && !context.explicit)) return null
    const installed = enabledExtensions(useMarketplace.getState().installed)
    const options = await projectSnippets(
      useProject.getState().root,
      resolvedLanguageId(installed, path),
      contextFor(path),
    )
    return options.length ? { from: word.from, options, validFor: /^\w*$/ } : null
  }

/**
 * The completion extension for a file.
 *
 * Sources are registered through `languageData`, not through `override`:
 * `override` replaces *every* source, which is how the language server's own
 * completions (registered the same way by `serverCompletion()`) would be
 * silently dropped in any file that also had snippets.
 */
export function contributedSnippets(path: string): Extension {
  const installed = enabledExtensions(useMarketplace.getState().installed)
  const sources: CompletionSource[] = [completeAnyWord]
  if (hasSnippets(installed, resolvedLanguageId(installed, path))) sources.unshift(source(path))
  sources.unshift(projectSource(path))
  const data = sources.map((autocomplete) => ({ autocomplete }))
  return [
    autocompletion({ activateOnTyping: useSettings.getState().suggestOnTyping }),
    EditorState.languageData.of(() => data),
  ]
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
