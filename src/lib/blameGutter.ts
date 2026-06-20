/**
 * A CodeMirror gutter that shows per-line git blame: the author and a relative
 * date, with the full commit in the tooltip. Toggled from the breadcrumb; built
 * from `git_blame` output. Quiet by design — it reads, it doesn't shout.
 */
import { gutter, GutterMarker } from "@codemirror/view";
import type { BlameLine } from "./api";

class BlameMarker extends GutterMarker {
  constructor(
    private readonly text: string,
    private readonly title: string,
    private readonly muted: boolean,
  ) {
    super();
  }
  override toDOM() {
    const el = document.createElement("span");
    el.className = `reado-blame${this.muted ? " reado-blame-muted" : ""}`;
    el.textContent = this.text;
    el.title = this.title;
    return el;
  }
}

/** Compact relative age of a Unix-seconds timestamp (e.g. "3d", "2mo", "1y"). */
function relativeAge(seconds: number): string {
  const days = (Date.now() / 1000 - seconds) / 86400;
  if (days < 1) return "today";
  if (days < 30) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

const isUncommitted = (hash: string) => /^0+$/.test(hash);

/** Build the blame gutter extension for a file's blame lines. */
export function blameGutter(lines: BlameLine[]) {
  const byLine = new Map<number, BlameLine>();
  for (const b of lines) byLine.set(b.line, b);

  return gutter({
    class: "reado-blame-gutter",
    lineMarker(view, block) {
      const lineNo = view.state.doc.lineAt(block.from).number;
      const b = byLine.get(lineNo);
      if (!b) return null;
      const uncommitted = isUncommitted(b.hash);
      const author = uncommitted ? "You" : b.author.split(" ")[0] || b.author;
      const when = uncommitted ? "uncommitted" : relativeAge(b.time);
      const title = uncommitted
        ? "Not committed yet"
        : `${b.hash}  ${b.author}\n${b.summary}`;
      return new BlameMarker(`${author} · ${when}`, title, uncommitted);
    },
    // The marker set only changes when we rebuild the gutter (new blame data).
    lineMarkerChange: () => false,
  });
}
