/**
 * Expand / shrink the selection by syntax node — read code structurally.
 *
 * Expand uses CodeMirror's `selectParentSyntax`; a small stack records each
 * pre-expansion selection so shrink can step back. The stack resets whenever the
 * user changes the selection by other means.
 */
import {
  StateField,
  StateEffect,
  EditorSelection,
  type SelectionRange,
  type Extension,
} from "@codemirror/state";
import { selectParentSyntax } from "@codemirror/commands";
import type { Command } from "@codemirror/view";

const push = StateEffect.define<SelectionRange>();
const pop = StateEffect.define<null>();

const stack = StateField.define<SelectionRange[]>({
  create: () => [],
  update(value, tr) {
    let next = value;
    let touched = false;
    for (const e of tr.effects) {
      if (e.is(push)) {
        next = [...next, e.value];
        touched = true;
      } else if (e.is(pop)) {
        next = next.slice(0, -1);
        touched = true;
      }
    }
    // Any other selection change (manual cursor move) invalidates the stack.
    if (!touched && tr.selection) return [];
    return next;
  },
});

export const expandSelection: Command = (view) => {
  const before = view.state.selection.main;
  if (!selectParentSyntax(view)) return false;
  view.dispatch({ effects: push.of(before) });
  return true;
};

export const shrinkSelection: Command = (view) => {
  const s = view.state.field(stack, false);
  if (!s || s.length === 0) return false;
  view.dispatch({
    selection: EditorSelection.create([s[s.length - 1]]),
    effects: pop.of(null),
  });
  return true;
};

export const syntaxSelection: Extension = [stack];
