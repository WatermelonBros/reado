/**
 * A slim overview ruler down the right edge (along the scrollbar) that marks
 * where the things worth scrolling to are — diagnostics in the reader, changed
 * chunks in the diff view. Clicking the ruler scrolls to that fraction of the
 * document, so a long file's problems and edits are one glance (and one click)
 * away instead of a blind scroll.
 */
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { forEachDiagnostic } from "@codemirror/lint";
import { getChunks } from "@codemirror/merge";

export interface OverviewMark {
  /** A document position on the marked line. */
  pos: number;
  /** CSS colour for the tick. */
  color: string;
}

/** Build the ruler plugin from a function that reads marks out of the state. */
export function overviewRuler(getMarks: (view: EditorView) => OverviewMark[]) {
  return ViewPlugin.fromClass(
    class {
      dom: HTMLDivElement;
      constructor(view: EditorView) {
        this.dom = document.createElement("div");
        this.dom.className = "cm-overviewRuler";
        view.dom.appendChild(this.dom);
        // Geometry isn't settled on construct; render after the first measure.
        view.requestMeasure({ read: () => this.render(view) });
      }
      update(u: ViewUpdate) {
        // Diagnostics and merge chunks arrive as state effects, not doc/geometry
        // changes — so refresh on any effect-bearing transaction too.
        if (
          u.docChanged ||
          u.viewportChanged ||
          u.geometryChanged ||
          u.transactions.some((tr) => tr.effects.length)
        )
          this.render(u.view);
      }
      render(view: EditorView) {
        const total = view.contentHeight;
        if (total <= 0) return;
        const marks = getMarks(view);
        const ticks = marks
          .map((m) => {
            const top = view.lineBlockAt(m.pos).top / total;
            return `<div class="cm-overviewRuler-tick" style="top:${(top * 100).toFixed(3)}%;background:${m.color}"></div>`;
          })
          .join("");
        this.dom.innerHTML = ticks;
        this.dom.style.display = marks.length ? "" : "none";
      }
      destroy() {
        this.dom.remove();
      }
    },
  );
}

/** Severity → token colour for diagnostic ticks. */
function diagColor(severity: string): string {
  return severity === "error"
    ? "var(--diag-error)"
    : severity === "warning"
      ? "var(--diag-warn)"
      : "var(--diag-info)";
}

/** Ruler marking every language-server diagnostic (errors, warnings, hints). */
export const diagnosticsRuler = overviewRuler((view) => {
  const marks: OverviewMark[] = [];
  forEachDiagnostic(view.state, (d, from) => {
    marks.push({ pos: from, color: diagColor(d.severity) });
  });
  return marks;
});

/** Ruler marking every changed chunk in a unified merge (diff) view. */
export const diffRuler = overviewRuler((view) => {
  const chunks = getChunks(view.state)?.chunks ?? [];
  // Clamp to the doc end: a deletion's chunk can point just past the last line.
  const end = view.state.doc.length;
  return chunks.map((c) => ({ pos: Math.min(c.fromB, end), color: "var(--accent)" }));
});
