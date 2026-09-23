import {
  convertIndentationTo,
  cursorRedo,
  cursorUndo,
  deleteDuplicateLinesCmd,
  joinLinesCmd,
  lowerCaseCmd,
  openFind,
  openGotoLine,
  openReplace,
  redoEdit,
  reindentLines,
  selectionText,
  sortLinesAsc,
  sortLinesDesc,
  titleCaseCmd,
  toggleBlockCommentCmd,
  toggleLineComment,
  trimWhitespaceCmd,
  undoEdit,
  upperCaseCmd,
} from "@/lib/activeEditor"
import { organizeImports } from "@/lib/codeActions"
import { useFileUndo } from "@/lib/fileUndo"
import { useEditorActions, useWorkspace } from "@/lib/store"
import type { Command, CommandTable } from "./types"

// One place to search *and* replace across the project: the Search panel,
// which has both. Find, Replace and ⌘⇧F all land in it, seeded with whatever
// is selected in the editor.
const searchProject: Command = {
  run: () => useWorkspace.getState().searchFor(selectionText()),
}

/** The Edit menu: history, find, comments and the text transforms. */
export const editCommands: CommandTable = {
  find: { run: () => openFind(), when: "file" },
  "edit:undo": { run: () => undoEdit(), when: "file" },
  "edit:redo": { run: () => redoEdit(), when: "file" },
  "edit:replace": { run: () => openReplace(), when: "file" },
  "edit:findInFiles": searchProject,
  "edit:replaceInFiles": searchProject,
  "palette:search": searchProject,
  "edit:toggleComment": { run: () => toggleLineComment(), when: "file" },
  "edit:quickFix": { run: () => useEditorActions.getState().requestQuickFix(), when: "file" },
  "edit:organizeImports": { run: () => void organizeImports(), when: "file" },
  "edit:toggleBlockComment": { run: () => toggleBlockCommentCmd(), when: "file" },
  gotoLine: { run: () => openGotoLine(), when: "file" },
  "edit:cursorUndo": { run: () => cursorUndo(), when: "file" },
  "edit:cursorRedo": { run: () => cursorRedo(), when: "file" },
  "edit:upperCase": { run: () => upperCaseCmd(), when: "file" },
  "edit:lowerCase": { run: () => lowerCaseCmd(), when: "file" },
  "edit:titleCase": { run: () => titleCaseCmd(), when: "file" },
  "edit:sortAsc": { run: () => sortLinesAsc(), when: "file" },
  "edit:sortDesc": { run: () => sortLinesDesc(), when: "file" },
  "edit:dedupe": { run: () => deleteDuplicateLinesCmd(), when: "file" },
  "edit:joinLines": { run: () => joinLinesCmd(), when: "file" },
  "edit:trimWhitespace": { run: () => trimWhitespaceCmd(), when: "file" },
  "edit:reindent": { run: () => reindentLines(), when: "file" },
  "edit:convertSpaces": { run: () => convertIndentationTo("spaces"), when: "file" },
  "edit:convertTabs": { run: () => convertIndentationTo("tabs"), when: "file" },
  "edit:undoFile": { run: () => void useFileUndo.getState().undo() },
}
