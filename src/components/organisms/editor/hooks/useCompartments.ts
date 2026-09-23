import { Compartment } from "@codemirror/state"
import { useMemo } from "react"

const NAMES = [
  "wrapComp",
  "colorComp",
  "bracketColorComp",
  "whitespaceComp",
  "langComp",
  "focusComp",
  "gutterComp",
  "blameComp",
  "bookmarkComp",
  "testComp",
  "tabSizeComp",
  "indentUnitComp",
  "lspComp",
  "completionComp",
  "changedComp",
  "diffComp",
  "lineNumbersComp",
  "activeLineComp",
  "indentGuidesComp",
  "bracketComp",
  "rulerComp",
] as const

export type Compartments = Record<(typeof NAMES)[number], Compartment>

/** One Compartment per live-reconfigurable piece of the editor, made once per view. */
export function useCompartments(): Compartments {
  return useMemo(
    () => Object.fromEntries(NAMES.map((n) => [n, new Compartment()])) as Compartments,
    [],
  )
}
