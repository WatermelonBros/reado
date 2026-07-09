import { useEffect, type RefObject } from "react";
import {
  EditorState,
  StateEffect,
  StateField,
  Annotation,
  Facet,
  RangeSetBuilder,
  Compartment,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  Decoration,
  type DecorationSet,
} from "@codemirror/view";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { focusBlockRange } from "../../../lib/focusBlock";
import { findDefinition, resolveImport } from "../../../lib/api";
import { lspLocate } from "../../../lib/lsp";
import { useProject, useWorkspace } from "../../../lib/store";

/** Shared layout for the non-code placeholder states (empty / loading / binary). */
export const PLACEHOLDER = "grid h-full place-items-center p-8 text-center text-muted";

/** Marks a doc change as a reload from disk (an external edit), not a user edit,
 * so it doesn't flip the dirty flag. */
export const ExternalReload = Annotation.define<boolean>();

/** StateEffect/Field driving the transient landing-line highlight. */
export const setLanding = StateEffect.define<number | null>();
export const landingField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setLanding)) {
        if (e.value == null) return Decoration.none;
        const line = tr.state.doc.line(Math.min(e.value, tr.state.doc.lines));
        value = Decoration.set([
          Decoration.line({ class: "cm-landing-line" }).range(line.from),
        ]);
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** StateEffect/Field highlighting the anchored block while its thread is open. */
export const setBlock = StateEffect.define<{ from: number; to: number } | null>();
export const blockField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setBlock)) {
        if (!e.value) return Decoration.none;
        const ranges = [];
        const max = tr.state.doc.lines;
        for (let l = Math.max(1, e.value.from); l <= Math.min(e.value.to, max); l++) {
          ranges.push(
            Decoration.line({ class: "cm-comment-block" }).range(tr.state.doc.line(l).from),
          );
        }
        return Decoration.set(ranges);
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Underline of the symbol under the cursor while a modifier is held, to signal
 *  it is click-to-navigate (VS Code style). */
export const setLink = StateEffect.define<{ from: number; to: number } | null>();
export const linkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setLink)) {
        value = e.value
          ? Decoration.set([
              Decoration.mark({ class: "cm-goto-link" }).range(e.value.from, e.value.to),
            ])
          : Decoration.none;
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** The open file's absolute path for a view, so module-level handlers resolve
 *  imports against the right file even in a split pane. */
export const filePathFacet = Facet.define<string, string>({ combine: (v) => v[0] ?? "" });

/** The contents of a quoted string literal containing `pos` on its line, if
 *  any (handles ', " and ` with escapes). Used to detect import paths. */
export function stringLiteralAt(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos);
  const col = pos - line.from;
  const re = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) {
    const start = m.index + 1;
    const end = start + m[2].length;
    if (col >= start && col <= end) return m[2];
  }
  return null;
}

/** Resolve the thing at `pos` to its definition and jump there. A relative
 *  import path opens the file it points at; otherwise the identifier is resolved
 *  via the symbol index. */
export function goToDefinitionAt(view: EditorView, pos: number) {
  const str = stringLiteralAt(view, pos);
  if (str && (str.startsWith("./") || str.startsWith("../"))) {
    const fromFile = view.state.facet(filePathFacet) || useProject.getState().active;
    if (fromFile) {
      resolveImport(useProject.getState().root, fromFile, str)
        .then((p) => p && useProject.getState().open(p))
        .catch(() => {});
      return;
    }
  }
  // Prefer the language server when one is attached; it returns true so we only
  // fall back to the symbol index for files with no server.
  if (lspLocate(view, pos, "definition", (p, l) => useProject.getState().open(p, l))) return;
  const word = view.state.wordAt(pos);
  if (!word) return;
  const name = view.state.doc.sliceString(word.from, word.to);
  findDefinition(useProject.getState().root, name)
    .then((defs) => {
      if (defs.length) useProject.getState().open(defs[0].path, defs[0].line);
    })
    .catch(() => {});
}

/** Go to the type definition / implementation of the symbol at `pos` via the
 *  language server (no index equivalent; a no-op when no server is attached). */
export function goToTypeDefinitionAt(view: EditorView, pos: number) {
  lspLocate(view, pos, "typeDefinition", (p, l) => useProject.getState().open(p, l));
}
export function goToImplementationAt(view: EditorView, pos: number) {
  lspLocate(view, pos, "implementation", (p, l) => useProject.getState().open(p, l));
}

/** Find references: project-wide search for the identifier at the cursor. */
export function findReferencesAt(view: EditorView): boolean {
  const word = view.state.wordAt(view.state.selection.main.head);
  if (!word) return false;
  const name = view.state.doc.sliceString(word.from, word.to);
  if (name) useWorkspace.getState().searchFor(name);
  return true;
}

/** Editor DOM handlers for go-to-definition: modifier+click navigates, and
 *  modifier+hover underlines the symbol it would resolve. */
export const gotoDefinitionHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey)) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return false;
    goToDefinitionAt(view, pos);
    event.preventDefault();
    return true;
  },
  mousemove(event, view) {
    const held = event.metaKey || event.ctrlKey;
    const current = view.state.field(linkField, false);
    if (!held) {
      if (current && current.size) view.dispatch({ effects: setLink.of(null) });
      return false;
    }
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const word = pos != null ? view.state.wordAt(pos) : null;
    view.dispatch({ effects: setLink.of(word ? { from: word.from, to: word.to } : null) });
    return false;
  },
});

export const human = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

export const isMarkdown = (path: string) => /\.(md|markdown|mdx)$/i.test(path);

export const focusLineDeco = Decoration.line({ class: "cm-focus-block" });

/** Decorate the lines of the block enclosing the main caret as "focused". */
export function buildFocusDeco(state: EditorState): DecorationSet {
  const { from, to } = focusBlockRange(state, state.selection.main.head);
  const b = new RangeSetBuilder<Decoration>();
  for (let n = from; n <= to; n++) {
    const line = state.doc.line(n);
    b.add(line.from, line.from, focusLineDeco);
  }
  return b.finish();
}

/** Keeps the enclosing block lit; recomputes as the caret moves or the doc edits. */
export const focusBlockField = StateField.define<DecorationSet>({
  create: buildFocusDeco,
  update: (deco, tr) =>
    tr.docChanged || tr.selection ? buildFocusDeco(tr.state) : deco.map(tr.changes),
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Focus mode dims every line except the block under the cursor (a function, tag,
 * or braced scope — enough to actually read), implemented as a content-attribute
 * class plus a decoration field so it toggles without recreating the view.
 */
export const focusExtension = (on: boolean) =>
  on ? [EditorView.contentAttributes.of({ class: "cm-focus-mode" }), focusBlockField] : [];

/** Read-only vs editable, toggled by manual-editing mode (read-first default). */
export const editableExtension = (on: boolean) => [
  EditorState.readOnly.of(!on),
  EditorView.editable.of(on),
];

/** Gutter line numbers per the `lineNumbers` setting: hidden, absolute, or
 *  relative to the caret line (the current line shows its absolute number). */
export function lineNumbersExt(mode: "off" | "on" | "relative") {
  if (mode === "off") return [];
  if (mode === "on") return lineNumbers();
  return lineNumbers({
    formatNumber: (n, state) => {
      const cur = state.doc.lineAt(state.selection.main.head).number;
      return n === cur ? String(n) : String(Math.abs(n - cur));
    },
  });
}

/** Active-line emphasis per the `activeLine` setting. */
export function activeLineExt(mode: "off" | "gutter" | "line" | "both") {
  switch (mode) {
    case "off":
      return [];
    case "gutter":
      return highlightActiveLineGutter();
    case "line":
      return highlightActiveLine();
    case "both":
      return [highlightActiveLine(), highlightActiveLineGutter()];
  }
}

/** Indentation guides per the `indentGuides` setting: off, uniform on all
 *  indentation, or drawn everywhere with only the active scope emphasised. */
export function indentGuidesExt(mode: "off" | "all" | "active") {
  if (mode === "off") return [];
  return indentationMarkers({ hideFirstIndent: true, highlightActiveBlock: mode === "active" });
}

/** A vertical line-length guide at column `col` (0 = off): tags `.cm-content`
 *  with the ruler class and its column, drawn by CSS at `col` characters in. */
export function rulerExt(col: number) {
  return col > 0
    ? EditorView.contentAttributes.of({ class: "cm-ruler", style: `--ruler-col:${col}` })
    : [];
}

/** Live-reconfigure a compartment: dispatch a single `comp.reconfigure(value)`
 *  whenever `deps` change. Collapses the many near-identical one-line
 *  reconfigure effects in CodeView (wrap, line numbers, active line, …). */
export function useReconfigure(
  viewRef: RefObject<EditorView | null>,
  comp: Compartment,
  value: Extension,
  deps: unknown[],
): void {
  useEffect(() => {
    viewRef.current?.dispatch({ effects: comp.reconfigure(value) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
