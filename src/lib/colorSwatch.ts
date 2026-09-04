/**
 * A small square beside every colour literal in the document, painted with that
 * colour. Clicking one asks the caller to open a picker over it.
 *
 * Scoped to the rendered viewport: a theme file is mostly colours, and scanning
 * the whole document on every transaction would be work per keystroke that no
 * one can see.
 */

import { RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { type ColorFormat, findColorLiterals } from "./colorLiterals"

/** What the click handler is told about the swatch that was clicked. */
export interface SwatchHit {
  /** Document range of the literal itself — what a picker would rewrite. */
  from: number
  to: number
  text: string
  format: ColorFormat
  /** The swatch's on-screen box, for positioning the picker. */
  rect: DOMRect
}

class SwatchWidget extends WidgetType {
  constructor(
    private readonly color: string,
    private readonly from: number,
    private readonly to: number,
    private readonly format: ColorFormat,
    private readonly onPick: (hit: SwatchHit) => void,
  ) {
    super()
  }

  // Only the colour is visible, so a swatch whose colour is unchanged can be
  // reused across a re-render even if the offsets moved.
  override eq(other: SwatchWidget) {
    return other.color === this.color && other.from === this.from
  }

  override toDOM() {
    const el = document.createElement("button")
    el.type = "button"
    el.className = "reado-color-swatch"
    // A custom property, not `background`: the stylesheet layers the colour
    // over a chequerboard so a translucent value reads as translucent, and an
    // inline shorthand would wipe that out.
    el.style.setProperty("--swatch", this.color)
    // Decorative: the literal it sits beside already says the colour, and a
    // screen reader announcing "#d94f4f, button" twice is noise.
    el.setAttribute("aria-hidden", "true")
    el.tabIndex = -1
    el.addEventListener("mousedown", (e) => {
      // Keep the caret where it was: clicking the swatch is not a text click.
      e.preventDefault()
      e.stopPropagation()
      this.onPick({
        from: this.from,
        to: this.to,
        text: this.color,
        format: this.format,
        rect: el.getBoundingClientRect(),
      })
    })
    return el
  }

  override ignoreEvent() {
    return true
  }
}

/** Every literal inside `ranges`, at document offsets. Separate from the plugin
 *  so the offsetting is testable: happy-dom reports one viewport starting at 0,
 *  where a dropped offset looks identical to a correct one. */
export function swatchesInRanges(
  doc: { sliceString: (from: number, to: number) => string },
  ranges: readonly { from: number; to: number }[],
): Array<{ from: number; to: number; text: string; format: ColorFormat }> {
  const out = []
  for (const { from, to } of ranges) {
    for (const lit of findColorLiterals(doc.sliceString(from, to))) {
      out.push({
        from: from + lit.from,
        to: from + lit.to,
        text: lit.text,
        format: lit.format,
      })
    }
  }
  return out
}

function build(view: EditorView, onPick: (hit: SwatchHit) => void): DecorationSet {
  const b = new RangeSetBuilder<Decoration>()
  for (const s of swatchesInRanges(view.state.doc, view.visibleRanges)) {
    b.add(
      s.from,
      s.from,
      Decoration.widget({
        widget: new SwatchWidget(s.text, s.from, s.to, s.format, onPick),
        side: -1,
      }),
    )
  }
  return b.finish()
}

/** Swatches for every colour literal in view. `onPick` fires on a click. */
export function colorSwatches(onPick: (hit: SwatchHit) => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view, onPick)
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view, onPick)
      }
    },
    { decorations: (v) => v.decorations },
  )
}
