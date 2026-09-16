// The companion's view: which cell of the atlas is on screen, and where the
// bubble opens. Everything here is decided by the corner and the state — the two
// inputs the window will feed it.
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CORNERS, cornerLayout } from "../corner"
import { ANIMATIONS, COLS, cellPosition, ROWS } from "../frames"
import { Mascot } from "../Mascot"
import { MascotCompanion } from "../MascotCompanion"
import { bubblePath } from "../SpeechBubble"

/** happy-dom has no matchMedia; the component asks it for reduced motion. */
function stubMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

const cell = () => Number(screen.getByRole("img").dataset.mascotCell)

/** Move the clock AND let React paint what the timer changed: a bare
 *  `advanceTimersByTimeAsync` leaves the DOM a frame behind. */
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

beforeEach(() => stubMotion(false))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("the character", () => {
  it("starts on its state's first frame", () => {
    render(<Mascot state="think" />)
    expect(cell()).toBe(ANIMATIONS.think.frames[0].cell)
  })

  it("walks the frames on each one's own timing", async () => {
    vi.useFakeTimers()
    render(<Mascot state="idle" />)
    const [a, b] = ANIMATIONS.idle.frames
    expect(cell()).toBe(a.cell)
    // Still there just before the long hold is up: an even cadence would have
    // blinked several times by now.
    await advance(a.ms - 50)
    expect(cell()).toBe(a.cell)
    await advance(100)
    expect(cell()).toBe(b.cell)
  })

  it("plays a one-shot state once and stays on its last frame", async () => {
    vi.useFakeTimers()
    render(<Mascot state="done" />)
    const frames = ANIMATIONS.done.frames
    expect(ANIMATIONS.done.loop).toBe(false)
    await advance(60_000)
    expect(cell()).toBe(frames[frames.length - 1].cell)
  })

  it("holds one frame and starts no timer when motion is reduced", async () => {
    stubMotion(true)
    vi.useFakeTimers()
    render(<Mascot state="ask" />)
    expect(cell()).toBe(ANIMATIONS.ask.still)
    await advance(60_000)
    expect(cell()).toBe(ANIMATIONS.ask.still)
  })

  it("survives a switch to a state with fewer frames", async () => {
    // `ask` has more frames than `done`. Reading the new animation with the old
    // index is an index that does not exist — which used to throw, and a throw
    // here blanks the whole companion window.
    vi.useFakeTimers()
    const { rerender } = render(<Mascot state="ask" />)
    await advance(ANIMATIONS.ask.frames.slice(0, -1).reduce((n, f) => n + f.ms, 0) + 50)
    rerender(<Mascot state="done" />)
    expect(cell()).toBe(ANIMATIONS.done.frames[0].cell)
    await advance(5_000)
    expect(Number.isNaN(cell())).toBe(false)
  })

  it("restarts from the first frame when the state changes", async () => {
    vi.useFakeTimers()
    const { rerender } = render(<Mascot state="talk" />)
    await advance(ANIMATIONS.talk.frames[0].ms + 10)
    expect(cell()).not.toBe(ANIMATIONS.talk.frames[0].cell)
    rerender(<Mascot state="think" />)
    expect(cell()).toBe(ANIMATIONS.think.frames[0].cell)
  })
})

describe("where a cell sits in the atlas", () => {
  it("puts the first cell top-left and the last bottom-right", () => {
    expect(cellPosition(0)).toBe("0% 0%")
    expect(cellPosition(COLS * ROWS - 1)).toBe("100% 100%")
  })

  it("addresses every cell distinctly", () => {
    const seen = new Set(Array.from({ length: COLS * ROWS }, (_, i) => cellPosition(i)))
    expect(seen.size).toBe(COLS * ROWS)
  })

  it("names a cell for every frame of every state", () => {
    for (const anim of Object.values(ANIMATIONS))
      for (const f of anim.frames) expect(f.cell).toBeLessThan(COLS * ROWS)
  })
})

describe("the bubble follows the corner it is parked in", () => {
  it.each(CORNERS)("%s opens away from the edges it is against", (corner) => {
    const { column, align } = cornerLayout(corner)
    expect(column).toBe(corner.startsWith("bottom") ? "column" : "column-reverse")
    expect(align).toBe(corner.endsWith("right") ? "flex-end" : "flex-start")
  })

  it.each(CORNERS)("%s points its tail at the owl", (corner) => {
    render(<MascotCompanion state="idle" text="done" corner={corner} />)
    const bubble = screen.getByRole("button", { name: /done/ })
    expect(bubble.dataset.bubbleSide).toBe(corner.startsWith("bottom") ? "bottom" : "top")
  })

  it("draws bubble and tail as one closed path", () => {
    const d = bubblePath(200, 80, 170)
    // One `M`, one `Z`: a second subpath would be a tail drawn separately, which
    // is the seam this exists to avoid.
    expect(d.match(/M/g)).toHaveLength(1)
    expect(d.trim().endsWith("Z")).toBe(true)
  })

  it("keeps the tail inside the bubble however far out the tip is asked to go", () => {
    const xs = bubblePath(200, 80, 9999)
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number)
    expect(Math.max(...xs)).toBeLessThanOrEqual(200)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
  })
})

describe("sending it to the edge", () => {
  const bar = () => screen.getByRole("button", { name: "mascot.show" }).querySelector("span")!

  it("leaves a thin bar as tall as the character, and nothing else", async () => {
    const user = userEvent.setup()
    render(<MascotCompanion state="idle" corner="bottom-right" size={160} />)
    await user.click(screen.getByRole("button", { name: "mascot.tuck" }))
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "mascot.show" })).toHaveStyle({ height: "160px" })
    expect(bar()).toHaveStyle({ width: "3px" })
  })

  it("widens under the pointer", async () => {
    const user = userEvent.setup()
    render(<MascotCompanion state="idle" corner="bottom-right" size={160} />)
    await user.click(screen.getByRole("button", { name: "mascot.tuck" }))
    await user.hover(screen.getByRole("button", { name: "mascot.show" }))
    expect(bar()).toHaveStyle({ width: "10px" })
  })

  it("shows the way out when the backend says the pointer is there", () => {
    // The DOM's own hover cannot be relied on: while the window is letting the
    // pointer through it gets no events, so a pointer that arrives and stops
    // never produces `pointerenter`. The backend polls, and says so.
    const { rerender } = render(<MascotCompanion state="idle" corner="bottom-right" />)
    const tuck = () => screen.getByRole("button", { name: "mascot.tuck" })
    expect(tuck().className).toContain("opacity-0")
    rerender(<MascotCompanion state="idle" corner="bottom-right" pointerOver />)
    expect(tuck().className).toContain("opacity-100")
  })

  it("puts the way out where the pointer can reach it", async () => {
    // The window lets clicks through everywhere except the rectangle the page
    // declares, and that rectangle is built from these marks: a control without
    // one is a control nobody can press.
    render(<MascotCompanion state="idle" corner="bottom-right" />)
    const tuck = screen.getByRole("button", { name: "mascot.tuck" })
    expect(tuck.hasAttribute("data-mascot-tuck")).toBe(true)
  })

  it("rounds the side that is inside the screen", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<MascotCompanion state="idle" corner="bottom-right" />)
    await user.click(screen.getByRole("button", { name: "mascot.tuck" }))
    // Parked right: the bar's left side is the one anyone can see.
    expect(bar().className).toContain("rounded-l-md")
    unmount()

    render(<MascotCompanion state="idle" corner="top-left" />)
    await user.click(screen.getByRole("button", { name: "mascot.tuck" }))
    expect(bar().className).toContain("rounded-r-md")
  })

  it("tells the window it has gone, so the solid part can move with it", async () => {
    // The window declares which rectangle of itself accepts the pointer. Tuck
    // without saying so and it keeps pointing at where the owl used to be: the
    // bar is then unclickable, and nothing can bring the companion back.
    const user = userEvent.setup()
    const onTuckChange = vi.fn()
    render(<MascotCompanion state="idle" corner="bottom-right" onTuckChange={onTuckChange} />)
    await user.click(screen.getByRole("button", { name: "mascot.tuck" }))
    expect(onTuckChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole("button", { name: "mascot.show" }))
    expect(onTuckChange).toHaveBeenLastCalledWith(false)
  })

  it("says nothing while it is away, and comes back when clicked", async () => {
    const user = userEvent.setup()
    render(<MascotCompanion state="done" text="tutto verde" corner="bottom-right" />)
    expect(screen.getByRole("status")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "mascot.tuck" }))
    // Words from beyond the screen's edge belong to nobody.
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "mascot.show" }))
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.getByRole("img")).toBeInTheDocument()
  })
})

describe("what the companion shows", () => {
  it("talks while it has something to say", () => {
    render(<MascotCompanion state="idle" text="the tests are green" />)
    expect(screen.getByRole("img").dataset.mascotState).toBe("talk")
  })

  it("keeps a state that has a face of its own", () => {
    // The leaning question is the message; it must not be overwritten by a
    // talking mouth just because a bubble is up.
    render(<MascotCompanion state="ask" text="which branch?" />)
    expect(screen.getByRole("img").dataset.mascotState).toBe("ask")
  })

  it("says nothing at all with no text", () => {
    render(<MascotCompanion state="idle" />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.getByRole("img").dataset.mascotState).toBe("idle")
  })

  it("never lets a long message grow past what the window reserved", () => {
    // 280 characters is the most `mascot_say` accepts. Expanded, the bubble must
    // still be bounded: a taller one has its top — where the reader starts —
    // clipped by the window's own edge.
    render(<MascotCompanion state="idle" text={"parola ".repeat(40).trim()} />)
    const box = screen.getByRole("status")
    expect(box).toHaveStyle({ overflow: "hidden" })
    const clamp = Number(box.dataset.clamp)
    expect(clamp).toBeGreaterThan(0)
    expect(clamp).toBeLessThanOrEqual(10)
  })

  it("shows the agent's text literally, markup and all", () => {
    render(<MascotCompanion state="idle" text="<b>done</b> — see `src/a.ts`" />)
    expect(screen.getByRole("status")).toHaveTextContent("<b>done</b> — see `src/a.ts`")
    expect(screen.queryByRole("status")?.querySelector("b")).toBeNull()
  })
})
