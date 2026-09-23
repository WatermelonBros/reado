import {
  addCursorAbove,
  addCursorBelow,
  addCursorsToLineEnds,
  addNextOccurrence,
  askAboutSelection,
  copyLineDownCmd,
  copyLineUpCmd,
  duplicateSelection,
  expandSelectionCmd,
  moveLineDownCmd,
  moveLineUpCmd,
  selectAllOccurrences,
  shrinkSelectionCmd,
} from "@/lib/activeEditor"
import { useEditorActions } from "@/lib/store"
import type { CommandTable } from "./types"

/** The Selection menu: growing, multiplying and moving what is selected. */
export const selectionCommands: CommandTable = {
  "sel:expand": { run: () => expandSelectionCmd(), when: "file" },
  "sel:shrink": { run: () => shrinkSelectionCmd(), when: "file" },
  "sel:addNext": { run: () => addNextOccurrence(), when: "file" },
  "sel:allOccurrences": { run: () => selectAllOccurrences(), when: "file" },
  "sel:cursorAbove": { run: () => addCursorAbove(), when: "file" },
  "sel:cursorBelow": { run: () => addCursorBelow(), when: "file" },
  "sel:lineEnds": { run: () => addCursorsToLineEnds(), when: "file" },
  "sel:duplicate": { run: () => duplicateSelection(), when: "file" },
  "sel:explain": { run: () => useEditorActions.getState().requestExplain(), when: "selection" },
  "sel:ask": { run: () => void askAboutSelection(), when: "selection" },
  "sel:copyUp": { run: () => copyLineUpCmd(), when: "file" },
  "sel:copyDown": { run: () => copyLineDownCmd(), when: "file" },
  "sel:moveUp": { run: () => moveLineUpCmd(), when: "file" },
  "sel:moveDown": { run: () => moveLineDownCmd(), when: "file" },
}
