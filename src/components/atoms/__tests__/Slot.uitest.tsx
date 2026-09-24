// The Slot atom: renders what a build registered for a slot — nothing when
// nobody did — and contains a contribution that throws.

import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }))
vi.mock("@/lib/logger", () => ({ log: { error: logError } }))

import { Slot } from "@/components/atoms/Slot"
import { registerSlot, resetSlotsForTest } from "@/lib/slots"

beforeEach(() => {
  resetSlotsForTest()
  logError.mockClear()
})

describe("Slot", () => {
  it("renders nothing when nothing is registered", () => {
    const { container } = render(
      <div data-testid="host">
        <Slot name="activitybar.account" />
      </div>,
    )
    expect(container.querySelector("[data-testid='host']")?.childNodes).toHaveLength(0)
  })

  it("renders registered components in registration order", () => {
    registerSlot("activitybar.account", () => <span>first</span>)
    registerSlot("activitybar.account", () => <span>second</span>)
    registerSlot("settings.footer", () => <span>elsewhere</span>)
    render(<Slot name="activitybar.account" />)
    const items = screen.getAllByText(/first|second/).map((el) => el.textContent)
    expect(items).toEqual(["first", "second"])
    expect(screen.queryByText("elsewhere")).not.toBeInTheDocument()
  })

  it("contains a contribution that throws and logs it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    registerSlot("activitybar.account", () => {
      throw new Error("boom")
    })
    registerSlot("activitybar.account", () => <span>survivor</span>)
    render(
      <div>
        <span>title bar</span>
        <Slot name="activitybar.account" />
      </div>,
    )
    expect(screen.getByText("title bar")).toBeInTheDocument()
    expect(screen.getByText("survivor")).toBeInTheDocument()
    expect(logError).toHaveBeenCalledWith(
      "slot contribution failed",
      expect.objectContaining({ slot: "activitybar.account", message: "boom" }),
    )
  })
})
