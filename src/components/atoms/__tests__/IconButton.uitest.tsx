// IconButton atom: the accessible name, click, and toggle state.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { IconButton } from "@/components/atoms/IconButton"

describe("IconButton", () => {
  it("exposes its label as the accessible name and fires onClick", async () => {
    const onClick = vi.fn()
    render(<IconButton label="Collapse all" icon={<svg />} onClick={onClick} />)
    const btn = screen.getByRole("button", { name: "Collapse all" })
    await userEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("reflects the active toggle state via aria-pressed", () => {
    // A plain action (no `active`) exposes no aria-pressed.
    const { rerender } = render(<IconButton label="Refresh" icon={<svg />} />)
    expect(screen.getByRole("button", { name: "Refresh" })).not.toHaveAttribute("aria-pressed")
    // A toggle exposes aria-pressed true/false — including when off.
    rerender(<IconButton label="Show hidden" icon={<svg />} active={false} />)
    expect(screen.getByRole("button", { name: "Show hidden" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
    rerender(<IconButton label="Show hidden" icon={<svg />} active />)
    expect(screen.getByRole("button", { name: "Show hidden" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })

  it("offers a size for each density the app actually uses", () => {
    // The sizes were measured from the hand-rolled buttons this atom replaced;
    // a missing step is how call sites end up overriding h-/w- by hand again.
    const boxes: Record<string, string> = { xs: "h-5", sm: "h-6", md: "h-7", lg: "h-10" }
    for (const [size, box] of Object.entries(boxes)) {
      const { unmount } = render(
        <IconButton size={size as "xs" | "sm" | "md" | "lg"} label={size} icon={<span />} />,
      )
      expect(screen.getByLabelText(size).className, size).toContain(box)
      unmount()
    }
  })
})
