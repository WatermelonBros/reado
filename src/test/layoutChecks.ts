/**
 * Geometric checks for tests running in a real browser — the class of bug a
 * simulated DOM cannot see, because it has no layout: a menu opening *under* a
 * panel, a popover hanging off the edge of the window.
 *
 * A floating layer is found the way `lib/overlays.ts` finds one (a subtree
 * portalled to `<body>`, or anything `position: fixed`), then narrowed to its
 * *panels*: a full-window backdrop or positioner is scaffolding, not the thing
 * the user reads, so the walk descends through it to what it holds.
 */

/** Visible to the user: laid out, not transparent, not `visibility: hidden`. */
function shown(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return (
    r.width > 0 &&
    r.height > 0 &&
    el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  )
}

function panelsOf(el: Element, out: Set<Element>) {
  const r = el.getBoundingClientRect()
  const fullWindow = r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1
  if (shown(el) && !fullWindow) {
    out.add(el)
    return
  }
  for (const child of Array.from(el.children)) panelsOf(child, out)
}

const NOT_UI = new Set(["SCRIPT", "STYLE", "LINK", "TEMPLATE", "NOSCRIPT", "META"])

/** Every floating panel on screen right now. `app` is the element the app is
 *  rendered into — anything outside it at body level is a portal. */
export function floatingPanels(app: Element): Element[] {
  const out = new Set<Element>()
  for (const node of Array.from(document.body.children)) {
    if (NOT_UI.has(node.tagName) || node.contains(app)) continue
    panelsOf(node, out)
  }
  for (const node of Array.from(app.querySelectorAll(".fixed"))) panelsOf(node, out)
  // A panel nested in another panel is the same layer counted twice.
  return [...out].filter((p) => ![...out].some((o) => o !== p && o.contains(p)))
}

/** A short, readable name for a panel in a failure message. */
export function describe(el: Element): string {
  const role = el.getAttribute("role")
  const part = el.getAttribute("data-part")
  const scope = el.getAttribute("data-scope")
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)
  const tag = [scope, part].filter(Boolean).join(":") || el.tagName.toLowerCase()
  return `${tag}${role ? `[role=${role}]` : ""} "${text}"`
}

/** The panel sits entirely inside the window (1px of rounding allowed). */
export function outsideViewport(el: Element): string | null {
  const r = el.getBoundingClientRect()
  const off = [
    r.left < -1 && `left ${Math.round(r.left)}`,
    r.top < -1 && `top ${Math.round(r.top)}`,
    r.right > window.innerWidth + 1 && `right ${Math.round(r.right - window.innerWidth)}px past`,
    r.bottom > window.innerHeight + 1 &&
      `bottom ${Math.round(r.bottom - window.innerHeight)}px past`,
  ].filter(Boolean)
  return off.length ? off.join(", ") : null
}

/**
 * Whatever the user sees at a few points inside the panel belongs to the panel.
 * `elementFromPoint` answers with what is painted on top, so a panel stacked
 * under a sibling layer or under the app shows up here as someone else's element.
 *
 * Hit-testing skips `pointer-events: none` — which tooltips set on purpose — so
 * the probe turns pointer events on for the panel while it looks.
 */
export function coveredBy(el: Element): string | null {
  const r = el.getBoundingClientRect()
  const inset = Math.min(6, r.width / 4, r.height / 4)
  const xs = [r.left + inset, r.left + r.width / 2, r.right - inset]
  const ys = [r.top + inset, r.top + r.height / 2, r.bottom - inset]
  const probe = document.createElement("style")
  probe.textContent =
    "[data-layout-probe], [data-layout-probe] * { pointer-events: auto !important }"
  document.head.append(probe)
  el.setAttribute("data-layout-probe", "")
  try {
    for (const x of xs)
      for (const y of ys) {
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue
        const hit = document.elementFromPoint(x, y)
        if (hit && !el.contains(hit))
          return `${describe(hit)} at (${Math.round(x)}, ${Math.round(y)})`
      }
    return null
  } finally {
    el.removeAttribute("data-layout-probe")
    probe.remove()
  }
}

/** The window itself scrolls sideways: something is wider than the app. */
export function pageOverflow(): string | null {
  const over = document.documentElement.scrollWidth - window.innerWidth
  return over > 1 ? `the page is ${over}px wider than the window` : null
}

/** Code and terminal surfaces clip on purpose — they scroll their own content. */
const OWN_SCROLLERS = ".cm-editor, .xterm, [data-layout-ignore]"

/**
 * Text cut off by a box that hides its overflow, with nothing to say so. An
 * ellipsis (`text-overflow: ellipsis`) is a truncation the design chose; a word
 * sliced mid-letter at a panel's edge is one nobody did. Horizontal only: that
 * is where a narrow window or a large zoom squeezes.
 */
export function clippedText(root: Element): string[] {
  const out: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim()
    const parent = node.parentElement
    if (!text || !parent || parent.closest(OWN_SCROLLERS) || !parent.checkVisibility()) continue
    range.selectNodeContents(node)
    const r = range.getBoundingClientRect()
    if (r.width === 0) continue
    for (
      let box = parent as Element | null;
      box && box !== document.body;
      box = box.parentElement
    ) {
      const cs = getComputedStyle(box)
      // Truncation the design chose, or a box that scrolls to what it hides.
      if (cs.textOverflow === "ellipsis" || cs.overflowX === "auto" || cs.overflowX === "scroll")
        break
      if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") continue
      const b = box.getBoundingClientRect()
      // A pixel-sized box is the screen-reader-only pattern (1px, scaled by the
      // interface zoom): clipped on purpose.
      if (b.width < 4 || b.height < 4) break
      if (r.right > b.right + 1 || r.left < b.left - 1) {
        out.push(`"${text.slice(0, 40)}" cut by ${describe(box)}`)
        break
      }
    }
  }
  return out
}
