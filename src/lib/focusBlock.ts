/**
 * Focus-mode block detection.
 *
 * Focus mode keeps the *block* enclosing the caret lit (a function, tag, or
 * braced scope) and dims the rest — reading one dimmed line at a time is useless.
 * The range is computed from indentation so it works across languages without a
 * grammar: climb to the enclosing opener, then descend to its matching dedent
 * (including a trailing closer line), falling back to the caret's own statement
 * at the top level.
 */
import type { EditorState } from "@codemirror/state";

const indentOf = (s: string) => s.match(/^[\t ]*/)?.[0].length ?? 0;

/** A line that opens a block: trailing `{ ( [ :`, or an unclosed HTML/JSX open tag. */
export const opensBlock = (s: string): boolean => {
  const t = s.trim();
  return /[{([:]$/.test(t) || (/^<[a-zA-Z][^>]*>$/.test(t) && !/\/>$/.test(t) && !/^<\//.test(t));
};

/** A line that closes a block: leading `} ) ]` or a closing tag `</…>`. */
export const closesBlock = (s: string): boolean =>
  /^[}\])]/.test(s.trim()) || /^<\//.test(s.trim());

/** The 1-based line range of the block enclosing `pos`. */
export function focusBlockRange(state: EditorState, pos: number): { from: number; to: number } {
  const doc = state.doc;
  // Reference line: the caret line, or the nearest non-blank line if it's blank.
  let ref = doc.lineAt(pos);
  if (!ref.text.trim()) {
    for (let n = ref.number - 1; n >= 1; n--) {
      const l = doc.line(n);
      if (l.text.trim()) {
        ref = l;
        break;
      }
    }
  }
  const refIndent = indentOf(ref.text);

  // Header line: the caret's own opener, else the nearest shallower line above.
  let headerNo = ref.number;
  let headerIndent = refIndent;
  if (opensBlock(ref.text)) {
    headerIndent = indentOf(ref.text);
  } else {
    for (let n = ref.number - 1; n >= 1; n--) {
      const text = doc.line(n).text;
      if (!text.trim()) continue;
      const ind = indentOf(text);
      if (ind < refIndent) {
        headerNo = n;
        headerIndent = ind;
        break;
      }
    }
  }

  // End line: descend until a non-blank line returns to the header's indent or
  // less; include it when it's the block's closer (`}` / `</tag>`).
  let endNo = doc.lines;
  for (let n = headerNo + 1; n <= doc.lines; n++) {
    const text = doc.line(n).text;
    if (!text.trim()) continue;
    const ind = indentOf(text);
    if (ind <= headerIndent) {
      endNo = closesBlock(text) ? n : n - 1;
      break;
    }
  }
  return { from: headerNo, to: Math.max(headerNo, endNo) };
}
