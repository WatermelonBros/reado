// Which of Reado's own DOM is floating over the browser pane. The pane is a
// native child window that paints above every pixel of DOM, so this answer is
// the only thing that can put a menu, a tooltip or a dialog on top of it — and
// it has to be true for layers nobody registered, which is the whole point.
import { afterEach, describe, expect, it } from "vitest"
import { overlayRects, overlaysCover } from "@/lib/overlays"

/** happy-dom has no layout: every rect is 0×0 unless we say otherwise. */
function at(el: Element, left: number, top: number, width: number, height: number): Element {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => "",
    }) as DOMRect
  return el
}

/** A body-level portal, as every floating layer in Reado is. */
function portal(...rects: Array<[number, number, number, number]>): HTMLElement {
  const host = document.createElement("div") // portal wrappers have no size of their own
  for (const [l, t, w, h] of rects) host.appendChild(at(document.createElement("div"), l, t, w, h))
  document.body.appendChild(host)
  return host
}

/** The app, with the pane inside it. */
function app(): HTMLElement {
  const root = document.createElement("div")
  root.id = "root"
  const pane = at(document.createElement("div"), 800, 100, 400, 600)
  pane.setAttribute("data-pane", "")
  root.appendChild(pane)
  at(root, 0, 0, 1200, 800)
  document.body.appendChild(root)
  return pane as HTMLElement
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("what floats over the pane", () => {
  it("counts a layer that overlaps it", () => {
    const pane = app()
    portal([700, 200, 300, 200]) // a menu hanging over the pane's left half
    expect(overlaysCover(pane)).toBe(true)
  })

  it("ignores one that lands elsewhere", () => {
    const pane = app()
    portal([10, 300, 200, 40]) // a tooltip on a sidebar icon
    // Blanking the page for a layer that was never going to be covered by it is
    // a flicker for nothing.
    expect(overlaysCover(pane)).toBe(false)
  })

  it("never counts the app's own tree, whatever wraps it", () => {
    const pane = app()
    // The app box contains the pane and overlaps it by definition. Told apart by
    // containment, so no element has to be known by name.
    expect(overlayRects(pane)).toHaveLength(0)
    expect(overlaysCover(pane)).toBe(false)
  })

  it("sees through a portal wrapper with no size of its own", () => {
    const pane = app()
    const host = portal([900, 150, 120, 80])
    expect(host.getBoundingClientRect().width).toBe(0)
    expect(overlaysCover(pane)).toBe(true)
  })

  it("does not count a layer that is mounted but closed", () => {
    const pane = app()
    portal() // an Ark menu kept mounted: present in the tree, zero-size, invisible
    expect(overlaysCover(pane)).toBe(false)
  })

  it("does not count touching edges as covering", () => {
    const pane = app()
    portal([400, 100, 400, 600]) // stops exactly at the pane's left edge
    expect(overlaysCover(pane)).toBe(false)
  })

  it("sees a layer that floats without leaving the tree", () => {
    // Toasts, the drag ghost, the tooltip singleton: `position: fixed` inside
    // the app is floating over it just as much as a portal is.
    const pane = app()
    const toast = at(document.createElement("div"), 700, 600, 400, 60)
    toast.className = "fixed"
    document.getElementById("root")!.appendChild(toast)
    expect(overlaysCover(pane)).toBe(true)
  })

  it("ignores body-level nodes that are not UI", () => {
    const pane = app()
    const s = at(document.createElement("script"), 0, 0, 1200, 800)
    document.body.appendChild(s)
    expect(overlaysCover(pane)).toBe(false)
  })
})
