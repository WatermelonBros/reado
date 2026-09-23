import { describe, expect, it, vi } from "vitest"
import { trackPointer } from "@/lib/pointerDrag"

const fire = (type: string) => window.dispatchEvent(new PointerEvent(type))

describe("trackPointer", () => {
  it("follows moves until pointerup, then stops listening", () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    trackPointer(onMove, onEnd)
    fire("pointermove")
    fire("pointerup")
    fire("pointermove")
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd.mock.calls[0][0]).toBeInstanceOf(PointerEvent)
  })

  it.each(["pointercancel", "blur"])("an interrupted drag (%s) ends with null", (type) => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    trackPointer(onMove, onEnd)
    window.dispatchEvent(type === "blur" ? new Event("blur") : new PointerEvent(type))
    fire("pointermove")
    fire("pointerup")
    expect(onMove).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledWith(null)
  })
})
