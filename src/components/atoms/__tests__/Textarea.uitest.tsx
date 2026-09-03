// The Textarea atom: the composer keyboard convention (Cmd/Ctrl+Enter submits,
// Escape cancels), variant surface, and onKeyDown passthrough.

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Textarea } from "@/components/atoms/Textarea"

describe("Textarea", () => {
  it("submits on Cmd/Ctrl+Enter but not on a bare Enter", () => {
    const onSubmit = vi.fn()
    render(<Textarea aria-label="body" onSubmit={onSubmit} />)
    const el = screen.getByLabelText("body")
    fireEvent.keyDown(el, { key: "Enter" })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(el, { key: "Enter", metaKey: true })
    fireEvent.keyDown(el, { key: "Enter", ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it("cancels on Escape", () => {
    const onCancel = vi.fn()
    render(<Textarea aria-label="body" onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByLabelText("body"), { key: "Escape" })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("still calls a caller's onKeyDown", () => {
    const onKeyDown = vi.fn()
    render(<Textarea aria-label="body" onKeyDown={onKeyDown} />)
    fireEvent.keyDown(screen.getByLabelText("body"), { key: "a" })
    expect(onKeyDown).toHaveBeenCalledOnce()
  })

  it("applies variant + mono, overridable by className", () => {
    render(<Textarea aria-label="body" variant="filled" mono className="bg-canvas" />)
    const el = screen.getByLabelText("body")
    expect(el.className).toContain("font-mono")
    expect(el.className).toContain("bg-canvas")
    expect(el.className).not.toContain("bg-surface")
  })

  it("shows focus on every variant a reader can tab into", () => {
    // `filled` has no border to darken, so without a ring it was the one field
    // in the app that gave no sign it had focus.
    const { rerender } = render(<Textarea aria-label="body" variant="bordered" />)
    expect(screen.getByLabelText("body").className).toMatch(/focus:/)
    rerender(<Textarea aria-label="body" variant="filled" />)
    expect(screen.getByLabelText("body").className).toMatch(/focus:/)
  })
})
