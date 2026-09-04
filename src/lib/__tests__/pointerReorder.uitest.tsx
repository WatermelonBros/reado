// Pointer-based drag-to-reorder. The Tauri webview hijacks HTML5 drag-and-drop,
// so reordering runs on raw pointer events: press, cross a small threshold, drop
// on another item. A press that never crosses it must still read as a click.
import { fireEvent, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useFlip, usePointerReorder } from "@/lib/pointerReorder"

const onCommit = vi.fn()

/** A tiny reorderable list wired the way the activity bar and tab strip wire it. */
function List({ axis = "x", ids = ["a", "b", "c"] }: { axis?: "x" | "y"; ids?: string[] }) {
  const { dragging, over, onPointerDown } = usePointerReorder(axis, onCommit)
  return (
    <div>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          data-reorder-id={id}
          data-dragging={dragging === id || undefined}
          data-over={over?.id === id ? (over.after ? "after" : "before") : undefined}
          onPointerDown={onPointerDown(id)}
        >
          {id}
        </button>
      ))}
    </div>
  )
}

const item = (id: string) => screen.getByRole("button", { name: id })

/** Pretend the pointer is over `id`'s element, on the given half of it. */
function pointerOver(id: string | null, half: "first" | "second" = "first") {
  const el = id ? item(id) : null
  if (el) {
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }) as DOMRect
  }
  vi.spyOn(document, "elementFromPoint").mockReturnValue(el)
  return half === "first" ? { clientX: 10, clientY: 5 } : { clientX: 90, clientY: 15 }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("a press that never becomes a drag", () => {
  it("commits nothing, so a click still selects the item", () => {
    render(<List />)
    fireEvent.pointerDown(item("a"), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 2, clientY: 1 }) // under the threshold
    fireEvent.pointerUp(window, { clientX: 2, clientY: 1 })
    expect(onCommit).not.toHaveBeenCalled()
    expect(item("a")).not.toHaveAttribute("data-dragging")
    // The other half of the name: unlike a real drop, this click is not
    // swallowed, so the item still activates.
    const click = new MouseEvent("click", { bubbles: true, cancelable: true })
    item("a").dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })

  it("ignores a press with anything but the primary button", () => {
    render(<List />)
    fireEvent.pointerDown(item("a"), { button: 2, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 50, clientY: 50 })
    expect(item("a")).not.toHaveAttribute("data-dragging")
  })
})

describe("a real drag", () => {
  it("marks the dragged item and the item under the pointer", () => {
    render(<List />)
    fireEvent.pointerDown(item("a"), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { ...pointerOver("b"), clientX: 30 })
    expect(item("a")).toHaveAttribute("data-dragging")
    expect(item("b")).toHaveAttribute("data-over", "before")
  })

  it("drops after the target when the pointer is past its middle", () => {
    render(<List />)
    fireEvent.pointerDown(item("a"), { button: 0, clientX: 0, clientY: 0 })
    const at = pointerOver("b", "second")
    fireEvent.pointerMove(window, at)
    expect(item("b")).toHaveAttribute("data-over", "after")
    fireEvent.pointerUp(window, at)
    expect(onCommit).toHaveBeenCalledWith("a", "b", true)
  })

  it("uses the vertical midpoint on a vertical list", () => {
    render(<List axis="y" />)
    fireEvent.pointerDown(item("a"), { button: 0, clientX: 0, clientY: 0 })
    // Past the horizontal middle but above the vertical one → still "before".
    const el = item("b")
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }) as DOMRect
    vi.spyOn(document, "elementFromPoint").mockReturnValue(el)
    fireEvent.pointerMove(window, { clientX: 90, clientY: 5 })
    expect(item("b")).toHaveAttribute("data-over", "before")
  })

  it("never targets the item being dragged", () => {
    render(<List />)
    fireEvent.pointerDown(item("a"), { button: 0, clientX: 0, clientY: 0 })
    const at = pointerOver("a", "second")
    fireEvent.pointerMove(window, { ...at, clientX: 90 })
    expect(item("a")).not.toHaveAttribute("data-over")
    fireEvent.pointerUp(window, at)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("commits nothing when dropped outside the list", () => {
    render(<List />)
    fireEvent.pointerDown(item("a"), { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
    // A drag really is in flight — otherwise this would pass for the boring
    // reason that the gesture never started.
    expect(item("a")).toHaveAttribute("data-dragging")
    pointerOver(null)
    fireEvent.pointerUp(window, { clientX: 999, clientY: 999 })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("swallows the trailing click, so the drop doesn't also activate the item", () => {
    render(<List />)
    fireEvent.pointerDown(item("a"), { button: 0, clientX: 0, clientY: 0 })
    const at = pointerOver("b")
    fireEvent.pointerMove(window, { ...at, clientX: 30 })
    fireEvent.pointerUp(window, at)
    const click = new MouseEvent("click", { bubbles: true, cancelable: true })
    item("b").dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
  })

  it("clears the drag state once it's over", () => {
    render(<List />)
    fireEvent.pointerDown(item("a"), { button: 0, clientX: 0, clientY: 0 })
    const at = pointerOver("b")
    fireEvent.pointerMove(window, { ...at, clientX: 30 })
    fireEvent.pointerUp(window, at)
    expect(item("a")).not.toHaveAttribute("data-dragging")
    expect(item("b")).not.toHaveAttribute("data-over")
  })
})

describe("useFlip", () => {
  /** A list that animates each item from where it was to where it now is. */
  function Flipped({ ids }: { ids: string[] }) {
    const ref = useRef<HTMLElement | null>(null)
    useFlip(ref, ids.join(","))
    return (
      <div
        ref={(el) => {
          ref.current = el
        }}
      >
        {ids.map((id) => (
          <span key={id} data-reorder-id={id}>
            {id}
          </span>
        ))}
      </div>
    )
  }

  /** happy-dom measures everything at 0×0, so derive each item's position from
   *  where it currently sits among its siblings. Reordering the list then really
   *  does move the boxes, which is what FLIP animates. */
  function measureByPosition() {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const i = Array.from(this.parentElement?.children ?? []).indexOf(this)
      const top = Math.max(i, 0) * 20
      return { left: 0, top, width: 40, height: 20, right: 40, bottom: top + 20 } as DOMRect
    })
  }

  it("slides an item that moved from where it was, and leaves the others alone", () => {
    measureByPosition()
    const { rerender } = render(<Flipped ids={["a", "b", "c"]} />)
    // Swap the first two: each starts the frame translated back to where it was,
    // so the release animates it into its new slot.
    rerender(<Flipped ids={["b", "a", "c"]} />)
    expect(screen.getByText("a").style.transform).toBe("translate(0px, -20px)")
    expect(screen.getByText("b").style.transform).toBe("translate(0px, 20px)")
    // `c` never moved, so it is not animated at all.
    expect(screen.getByText("c").style.transform).toBe("")
    vi.restoreAllMocks()
  })
})
