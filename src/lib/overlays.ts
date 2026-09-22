/**
 * What Reado is drawing over its own window right now — and whether any of it
 * lands on the browser pane.
 *
 * The pane is a **native child window**: it paints above every pixel of DOM,
 * whatever the z-index says. So the only way a menu, tooltip, dialog, popover or
 * right-click menu can be *on top of* it is for the pane to step aside while
 * that layer is up.
 *
 * Asking each layer to announce itself is the version that was wrong: every new
 * floating thing had to remember to register, and the ones that forgot opened
 * behind the page — a select, a layout menu, the right-click menu on the URL
 * bar. So nothing registers. This reads it off the DOM instead, from the two
 * shapes a floating layer can have in Reado, neither of which is optional:
 *
 * - **It is portalled out of the app's own tree**, to `<body>`. Ark's menus,
 *   popovers, selects, dialogs and tooltips do, and so does `ContextMenu` — they
 *   have to: the app root carries the interface-zoom transform, and a transform
 *   makes that element the containing block for `position: fixed` descendants,
 *   so a layer left inside it is positioned against the zoomed box instead of
 *   the viewport.
 * - **It is `position: fixed`** — which *is* the definition of floating over the
 *   page — written, as everything here is, as Tailwind's `fixed` class.
 *
 * Either shape is enough to be seen, so a new layer is covered by whichever one
 * it happens to take, and nobody has to remember anything.
 */

/** Body-level nodes that are not UI at all. */
const NOT_UI = new Set(["SCRIPT", "STYLE", "LINK", "TEMPLATE", "NOSCRIPT", "META"])

/** Collect a floating layer's on-screen rectangles.
 *
 *  A portal container is often a zero-size wrapper with the real panel inside —
 *  and a layer that is mounted but closed is zero-size all the way down, which is
 *  how "mounted but not showing" contributes nothing without a single check for
 *  it. */
function rectsOf(el: Element, out: DOMRect[]): void {
  const r = el.getBoundingClientRect()
  if (r.width > 0 && r.height > 0) {
    out.push(r)
    return
  }
  for (const child of Array.from(el.children)) rectsOf(child, out)
}

/**
 * Every rectangle Reado is floating *over* `el` — every body-level subtree that
 * isn't the one `el` lives in.
 *
 * Told apart by containment rather than by a known root id: the app's own tree
 * contains `el`, a portal does not. Nothing has to be named, and nothing that
 * wraps the app later (a zoom layer, a second root, a test harness) can be
 * mistaken for something floating over it.
 */
export function overlayRects(el: Element): DOMRect[] {
  const out: DOMRect[] = []
  for (const node of Array.from(document.body.children)) {
    if (NOT_UI.has(node.tagName) || node.contains(el)) continue
    rectsOf(node, out)
  }
  // And the layers that float without leaving the tree. Counting one twice (a
  // fixed box inside a portal) costs nothing — the question is only whether
  // *any* of them lands on the pane.
  for (const node of Array.from(document.querySelectorAll(".fixed"))) {
    if (!node.contains(el)) rectsOf(node, out)
  }
  return out
}

/** Is anything floating over `el`? Touching edges don't count — only real
 *  overlap, so a menu that stops exactly at the pane's edge leaves it alone. */
export function overlaysCover(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  return overlayRects(el).some(
    (r) => r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom,
  )
}

/**
 * Call `onChange` whenever the answer to "is something floating over this
 * rectangle?" changes. Returns the unsubscribe.
 *
 * One observer for the whole app. It watches `<body>` for layers arriving and
 * leaving, and for the attributes Ark flips on a layer that stays mounted
 * (`data-state`, `hidden`) — a menu that is mounted-but-closed has no size, so
 * opening it is a change in geometry rather than in the tree.
 */
export function watchOverlays(
  elementOf: () => Element | null,
  onChange: (covered: boolean) => void,
): () => void {
  let last: boolean | null = null
  let frame = 0
  let later = 0
  const check = () => {
    const el = elementOf()
    const covered = !!el && overlaysCover(el)
    if (covered === last) return
    last = covered
    onChange(covered)
  }
  // Coalesced to one check per frame — the app mutates constantly (an editor, a
  // terminal) and this must cost nothing when nothing is floating. The second,
  // later check is for a layer that is positioned *after* it mounts: Ark places
  // its panels once they have a size, which is a frame or two after they appear.
  const schedule = () => {
    cancelAnimationFrame(frame)
    clearTimeout(later)
    frame = requestAnimationFrame(check)
    later = window.setTimeout(check, 80)
  }
  const obs = new MutationObserver(schedule)
  obs.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state", "hidden"],
  })
  schedule()
  return () => {
    cancelAnimationFrame(frame)
    clearTimeout(later)
    obs.disconnect()
  }
}
