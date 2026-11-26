// OS drops arrive with a position Tauri calls physical; on macOS it is points.
import { afterEach, describe, expect, it, vi } from "vitest"
import { osDropTarget } from "@/lib/dropTarget"

const ua = (value: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(value)

describe("osDropTarget", () => {
  afterEach(() => vi.restoreAllMocks())

  const hitTest = () => {
    const container = document.createElement("div")
    const at = vi.fn((_x: number, _y: number) => container as Element)
    document.elementFromPoint = at
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2)
    return { container, at }
  }

  it("hit-tests a macOS drop where it landed — wry reports points, not pixels", () => {
    ua("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
    const { container, at } = hitTest()
    expect(osDropTarget(container, { x: 900, y: 700 })).toBe(container)
    expect(at).toHaveBeenCalledWith(900, 700)
  })

  it("scales a physical position back to CSS pixels elsewhere", () => {
    ua("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    const { container, at } = hitTest()
    osDropTarget(container, { x: 900, y: 700 })
    expect(at).toHaveBeenCalledWith(450, 350)
  })

  it("is null outside the container", () => {
    ua("Macintosh")
    const { at } = hitTest()
    at.mockReturnValue(document.body)
    expect(osDropTarget(document.createElement("div"), { x: 1, y: 1 })).toBeNull()
  })
})
