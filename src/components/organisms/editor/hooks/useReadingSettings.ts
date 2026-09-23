import {
  clampRange,
  FONT_SIZE_RANGE,
  LETTER_SPACING_RANGE,
  LINE_HEIGHT_RANGE,
  useSettings,
} from "@/lib/store"

/**
 * The reading controls the code view applies. Clamped numerics apply as CSS
 * vars; the rest as compartments. One selector each, so a change to any other
 * setting re-renders nothing.
 */
export function useReadingSettings() {
  return {
    fontSize: useSettings((s) => clampRange(s.fontSize, FONT_SIZE_RANGE)),
    lineHeight: useSettings((s) => clampRange(s.lineHeight, LINE_HEIGHT_RANGE)),
    letterSpacing: useSettings((s) => clampRange(s.letterSpacing, LETTER_SPACING_RANGE)),
    lineNumbersMode: useSettings((s) => s.lineNumbers),
    activeLineMode: useSettings((s) => s.activeLine),
    indentGuidesMode: useSettings((s) => s.indentGuides),
    bracketMatchingOn: useSettings((s) => s.bracketMatching),
    bracketColorsOn: useSettings((s) => s.bracketPairColors),
    rulerColumn: useSettings((s) => s.rulerColumn),
    cursorStyle: useSettings((s) => s.cursorStyle),
    cursorBlink: useSettings((s) => s.cursorBlink),
    scrollbar: useSettings((s) => s.scrollbar),
    suggestOnTyping: useSettings((s) => s.suggestOnTyping),
    inlineDiagnostics: useSettings((s) => s.inlineDiagnostics),
  }
}
