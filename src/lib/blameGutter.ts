/**
 * Git blame in the editor, in two strengths.
 *
 * `blameGutter` is the full column: every line annotated, toggled from the
 * breadcrumb when you want to read a file's history all at once.
 *
 * `inlineBlame` is the quiet one, for leaving on: only the line the cursor is
 * on gets an annotation, at the end of the line, in the dimmest colour that
 * still reads. A whole column of names beside code you are trying to read is a
 * lot of noise for a question you only ask about one line at a time.
 */
import { RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  GutterMarker,
  gutter,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import type { BlameLine } from "./api"

class BlameMarker extends GutterMarker {
  constructor(
    private readonly text: string,
    private readonly title: string,
    private readonly muted: boolean,
  ) {
    super()
  }
  override toDOM() {
    const el = document.createElement("span")
    el.className = `reado-blame${this.muted ? " reado-blame-muted" : ""}`
    el.textContent = this.text
    el.title = this.title
    return el
  }
}

/** Compact relative age of a Unix-seconds timestamp (e.g. "3d", "2mo", "1y"). */
function relativeAge(seconds: number): string {
  const days = (Date.now() / 1000 - seconds) / 86400
  if (days < 1) return "today"
  if (days < 30) return `${Math.floor(days)}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

const isUncommitted = (hash: string) => /^0+$/.test(hash)

/** Full, human date for the hover (e.g. "12 Mar 2026"). */
function fullDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/** Build the blame gutter extension for a file's blame lines. */
export function blameGutter(lines: BlameLine[]) {
  const byLine = new Map<number, BlameLine>()
  for (const b of lines) byLine.set(b.line, b)

  return gutter({
    class: "reado-blame-gutter",
    lineMarker(view, block) {
      const lineNo = view.state.doc.lineAt(block.from).number
      const b = byLine.get(lineNo)
      if (!b) return null
      const uncommitted = isUncommitted(b.hash)
      const author = uncommitted ? "You" : b.author.split(" ")[0] || b.author
      const when = uncommitted ? "uncommitted" : relativeAge(b.time)
      // Richer hover: subject, then abbreviated hash · full author · full date.
      const title = uncommitted
        ? "Not committed yet"
        : `${b.summary}\n${b.hash} · ${b.author} · ${fullDate(b.time)}`
      return new BlameMarker(`${author} · ${when}`, title, uncommitted)
    },
    // The marker set only changes when we rebuild the gutter (new blame data).
    lineMarkerChange: () => false,
  })
}

/** The end-of-line annotation itself: not editable, not selectable, and out of
 *  the accessibility tree — it is scenery beside the code, not content. */
class InlineBlameWidget extends WidgetType {
  constructor(private readonly text: string) {
    super()
  }

  eq(other: InlineBlameWidget) {
    return other.text === this.text
  }

  toDOM() {
    const el = document.createElement("span")
    el.className = "reado-inline-blame"
    el.textContent = this.text
    el.setAttribute("aria-hidden", "true")
    return el
  }

  ignoreEvent() {
    return true
  }
}

/** The annotation for one blame line, or null when there is nothing to say. */
export function inlineBlameText(b: BlameLine | undefined): string | null {
  if (!b) return null
  if (isUncommitted(b.hash)) return "You · uncommitted"
  const author = b.author.split(" ")[0] || b.author
  return `${author} · ${relativeAge(b.time)} · ${b.summary}`
}

/**
 * Annotate only the cursor's line. Rebuilt on selection change, which is the
 * whole point: it follows you rather than covering the file.
 */
export function inlineBlame(lines: BlameLine[]) {
  const byLine = new Map<number, BlameLine>()
  for (const b of lines) byLine.set(b.line, b)

  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>()
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)
    // An empty line has nowhere to put it without looking like content.
    if (line.length === 0) return builder.finish()
    const text = inlineBlameText(byLine.get(line.number))
    if (!text) return builder.finish()
    builder.add(
      line.to,
      line.to,
      Decoration.widget({ widget: new InlineBlameWidget(text), side: 1 }),
    )
    return builder.finish()
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = build(u.view)
      }
    },
    { decorations: (v) => v.decorations },
  )
}
