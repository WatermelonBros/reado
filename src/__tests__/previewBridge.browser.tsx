// Browser test: the script Reado injects into the previewed page, run for real.
// Its comment composer, comment card and right-click menu open where the user
// clicked — near an edge, they must still land inside the visible page. A design
// comment's pin follows its element, and the comment says what that element is.
import { render } from "@testing-library/react"
import { afterEach, beforeAll, expect, it } from "vitest"
import type { WebTarget } from "@/lib/api"
import { outsideViewport } from "@/test/layoutChecks"
import source from "../../src-tauri/src/preview.rs?raw"

interface Bridge {
  compose: (x: number, y: number) => void
  showComment: (c: object) => void
  marks: (list: object[], on: boolean) => void
  commentAt: { target: (WebTarget & { component: string | null }) | null } | null
}
const bridge = () => (window as unknown as { __readoBridge: Bridge }).__readoBridge

beforeAll(() => {
  const script = source.match(/const BRIDGE: &str = r#"([\s\S]*?)"#;/)?.[1]
  if (!script) throw new Error("BRIDGE not found in preview.rs")
  new Function(script)()
})

afterEach(() => {
  for (const id of ["__readoCompose", "__readoCommentBack", "__readoMarks", "app"])
    document.getElementById(id)?.remove()
})

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
const pointOf = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
/** Right-click `el`, pick "Comment here", write, save: what the user does. */
function commentOn(el: Element, text: string) {
  const r = el.getBoundingClientRect()
  el.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, clientX: r.left + 10, clientY: r.top + 5 }),
  )
  const item = [...document.querySelectorAll("div")].find((d) => d.textContent === "Comment here")
  item?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
  const box = document.getElementById("__readoCompose") as HTMLElement
  ;(box.querySelector("textarea") as HTMLTextAreaElement).value = text
  const save = [...box.querySelectorAll("button")].find((b) => b.textContent === "Comment")
  save?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
  return { x: r.left + 10, y: r.top + 5 }
}

it("a pin follows its element when the page scrolls inside an inner pane, and on reflow", async () => {
  // An app that scrolls in a pane of its own, as most do: the document never moves.
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="app" style="position:fixed;inset:0;overflow:auto">
       <div style="height:300px"></div>
       <p id="spot" style="margin-left:40px;width:200px;height:20px">Commented</p>
       <div style="height:2000px"></div>
     </div>`,
  )
  const spot = document.getElementById("spot") as HTMLElement
  const click = commentOn(spot, "Here")
  const at = bridge().commentAt
  expect(at?.target, "the comment remembers its element").toBeTruthy()
  expect(at?.target?.selector).toBe("#spot")
  expect(at?.target?.text).toBe("Commented")
  expect(at?.target?.html).toMatch(/^<p id="spot"/)

  bridge().marks([{ id: "c1", x: click.x, y: click.y, target: at?.target }], true)
  const dot = document.getElementById("__readoMarks")?.firstElementChild as HTMLElement
  const gap = () => {
    const d = pointOf(dot)
    const r = spot.getBoundingClientRect()
    return { dx: Math.round(d.x - r.left), dy: Math.round(d.y - r.top) }
  }
  const start = gap()
  expect(start).toEqual({ dx: 10, dy: 5 })

  const pane = document.getElementById("app") as HTMLElement
  pane.scrollTop = 120
  pane.dispatchEvent(new Event("scroll"))
  await frame()
  expect(gap(), "after an inner scroll").toEqual(start)

  spot.style.marginLeft = "180px" // the layout a narrower window reflows into
  window.dispatchEvent(new Event("resize"))
  await frame()
  expect(gap(), "after a reflow").toEqual(start)
})

const corners = () => [
  [window.innerWidth - 5, window.innerHeight - 5],
  [window.innerWidth - 5, 5],
  [5, window.innerHeight - 5],
]

it("the comment composer opens inside the page at every edge", () => {
  for (const [x, y] of corners()) {
    bridge().compose(x, y)
    const box = document.getElementById("__readoCompose")
    expect(box).not.toBeNull()
    expect(outsideViewport(box as Element), `composer at (${x}, ${y})`).toBeNull()
  }
})

it("the comment card opens inside the page at every edge", () => {
  for (const [x, y] of corners()) {
    bridge().showComment({
      id: "c1",
      x,
      y,
      type: "bug",
      kind: "task",
      messages: [{ who: "me", when: "now", body: "Too close to the edge" }],
    })
    const card = document.getElementById("__readoCommentBack")?.firstElementChild
    expect(card).toBeTruthy()
    expect(outsideViewport(card as Element), `card at (${x}, ${y})`).toBeNull()
  }
})

it("a comment on a React app names the component that rendered the element", () => {
  function PayButton() {
    return <button type="button">Pay now</button>
  }
  function Checkout() {
    return (
      <section className="checkout">
        <PayButton />
      </section>
    )
  }
  const { getByText } = render(<Checkout />)
  commentOn(getByText("Pay now"), "Make it bigger")
  const target = bridge().commentAt?.target
  expect(target?.component).toBe("Checkout › PayButton")
  expect(target?.selector).toMatch(/section\.checkout > button$/)
  expect(target?.text).toBe("Pay now")
})
