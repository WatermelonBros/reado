import {
  findReferencesAtCursor,
  goToBracket,
  goToDefinitionAtCursor,
  goToImplementationAtCursor,
  goToTypeDefinitionAtCursor,
  gotoLastEdit,
  nextProblem,
  prevProblem,
  showCallHierarchy,
  showTypeHierarchy,
  toggleBookmarkAtCursor,
} from "@/lib/activeEditor"
import { useEditorActions, usePalette, useProject } from "@/lib/store"
import type { CommandTable } from "./types"

/** The Go menu: palettes, symbol navigation, problems, tabs and history. */
export const goCommands: CommandTable = {
  "palette:files": { run: () => usePalette.getState().open("files") },
  "palette:commands": { run: () => usePalette.getState().open("commands") },
  "palette:symbols": { run: () => usePalette.getState().open("symbols"), when: "file" },
  "palette:wsymbols": { run: () => usePalette.getState().open("wsymbols") },
  gotodef: { run: () => goToDefinitionAtCursor(), when: "file" },
  "go:peek": { run: () => useEditorActions.getState().requestPeek(), when: "file" },
  "go:typedef": { run: () => goToTypeDefinitionAtCursor(), when: "file" },
  "go:impl": { run: () => goToImplementationAtCursor(), when: "file" },
  "go:references": { run: () => findReferencesAtCursor(), when: "file" },
  "go:callHierarchy": { run: () => showCallHierarchy(), when: "file" },
  "go:typeHierarchy": { run: () => showTypeHierarchy(), when: "file" },
  "go:bracket": { run: () => goToBracket(), when: "file" },
  "go:lastEdit": { run: () => gotoLastEdit(), when: "file" },
  "go:nextProblem": { run: () => nextProblem(), when: "problems" },
  "go:prevProblem": { run: () => prevProblem(), when: "problems" },
  "go:nextTab": { run: () => useProject.getState().cycleTab(1), when: "file" },
  "go:prevTab": { run: () => useProject.getState().cycleTab(-1), when: "file" },
  "go:back": { run: () => useProject.getState().goBack(), when: "back" },
  "go:forward": { run: () => useProject.getState().goForward(), when: "forward" },
  "bookmarks:toggle": { run: () => toggleBookmarkAtCursor() },
  "bookmarks:goto": { run: () => usePalette.getState().open("bookmarks") },
}
