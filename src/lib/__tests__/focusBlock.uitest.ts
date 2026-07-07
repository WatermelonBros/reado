// Focus-mode block detection: the caret's enclosing function/tag/scope, from
// indentation. Pure logic over an EditorState — no DOM.
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { focusBlockRange } from "../focusBlock";

/** Build a state and return the focus range for the caret on `line` (1-based). */
function rangeOnLine(src: string, line: number) {
  const state = EditorState.create({ doc: src });
  const pos = state.doc.line(line).from;
  return focusBlockRange(state, pos);
}

const CODE = `function outer() {
  const x = 1;
  if (x) {
    doThing();
  }
}

const y = 2;
`;

describe("focusBlockRange", () => {
  it("spans the whole function from a line in its body", () => {
    // "const x = 1;" (line 2) → the outer function, lines 1..6 (incl. closing }).
    expect(rangeOnLine(CODE, 2)).toEqual({ from: 1, to: 6 });
  });

  it("spans the enclosing block, not the whole function, deeper in", () => {
    // "doThing();" (line 4) → the if-block, lines 3..5.
    expect(rangeOnLine(CODE, 4)).toEqual({ from: 3, to: 5 });
  });

  it("on the header line, spans the block it opens", () => {
    // "function outer() {" (line 1) → lines 1..6.
    expect(rangeOnLine(CODE, 1)).toEqual({ from: 1, to: 6 });
  });

  it("keeps an open/close tag pair together", () => {
    const html = `<div>\n  <span>hi</span>\n  <p>text</p>\n</div>\n`;
    // caret on "<p>text</p>" (line 3) → the <div> block, lines 1..4.
    expect(rangeOnLine(html, 3)).toEqual({ from: 1, to: 4 });
  });
});
