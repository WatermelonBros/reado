// Cross-OS UI test: the shared right-click menu renders items and dismisses
// consistently. Pure component (no Tauri) — runs on macOS / Windows / Linux.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ContextMenu, type ContextMenuItem } from "@/components/atoms/ContextMenu"

function setup(extra: Partial<ContextMenuItem>[] = []) {
  const onClose = vi.fn()
  const onSelect = vi.fn()
  const items: ContextMenuItem[] = [
    { label: "Comment on file", onSelect },
    { label: "Delete", onSelect: vi.fn(), danger: true },
    ...extra.map((e) => ({ label: "X", onSelect: vi.fn(), ...e })),
  ]
  render(<ContextMenu x={10} y={10} items={items} onClose={onClose} />)
  return { onClose, onSelect }
}

describe("ContextMenu", () => {
  it("renders every item as a menuitem", () => {
    setup()
    const items = screen.getAllByRole("menuitem")
    expect(items).toHaveLength(2)
    expect(screen.getByText("Comment on file")).toBeInTheDocument()
    expect(screen.getByText("Delete")).toBeInTheDocument()
  })

  it("stays inside the window when opened against an edge", () => {
    // happy-dom measures everything at 0, so give the menu a real size.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 120,
      top: 0,
      left: 0,
      right: 200,
      bottom: 120,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    const items: ContextMenuItem[] = [{ label: "Comment on file", onSelect: vi.fn() }]
    render(
      <ContextMenu
        x={window.innerWidth - 4}
        y={window.innerHeight - 4}
        items={items}
        onClose={vi.fn()}
      />,
    )
    // Right-clicking near the corner must not put the items off-screen where
    // they can't be reached.
    const menu = screen.getByRole("menu") as HTMLElement
    expect(Number.parseFloat(menu.style.left)).toBeLessThanOrEqual(window.innerWidth - 200 - 8)
    expect(Number.parseFloat(menu.style.top)).toBeLessThanOrEqual(window.innerHeight - 120 - 8)
    vi.restoreAllMocks()
  })

  it("selecting an item fires its action and closes the menu", async () => {
    const { onClose, onSelect } = setup()
    await userEvent.click(screen.getByText("Comment on file"))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalled()
  })

  it("Escape closes the menu", async () => {
    const { onClose } = setup()
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
  })

  it("a disabled item is not actionable", async () => {
    const disabledSelect = vi.fn()
    setup([{ label: "Disabled", onSelect: disabledSelect, disabled: true }])
    const btn = screen.getByText("Disabled").closest("button")!
    expect(btn).toBeDisabled()
    // pointerEventsCheck: 0 — a disabled button has pointer-events:none, which
    // would otherwise make userEvent throw; we want the click to be a no-op.
    await userEvent.setup({ pointerEventsCheck: 0 }).click(btn)
    expect(disabledSelect).not.toHaveBeenCalled()
  })
})
