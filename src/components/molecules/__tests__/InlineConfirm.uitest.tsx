// The in-place confirmation: it names the action rather than saying "yes", both
// answers are reachable, and it is built from the shared Button — the pattern
// had been hand-drawn five times in two different visual languages.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { InlineConfirm } from "@/components/molecules/InlineConfirm"

const setup = (className?: string) => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <InlineConfirm
      question="Discard?"
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
      className={className}
    />,
  )
  return { onConfirm, onCancel }
}

describe("InlineConfirm", () => {
  it("asks the question and names the action", () => {
    setup()
    expect(screen.getByText("Discard?")).toBeInTheDocument()
    // "Delete", not "Yes" — the answer has to say what it does.
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
  })

  it("reports each answer separately", async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("lets the caller own the layout without changing the controls", () => {
    // Stacking the question is a class the caller passes, not a prop that forks
    // the render tree.
    setup("flex-col items-start")
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "common.cancel" })).toBeInTheDocument()
  })

  it("marks the destructive answer as the destructive one", () => {
    setup()
    // `danger` is the atom's own destructive surface — this pattern used to
    // invent its own, so the same decision looked different in two places.
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("text-marker")
  })

  it("gives both answers the shared focus ring", () => {
    setup()
    for (const name of ["Delete", "common.cancel"]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/focus-visible:/)
    }
  })
})
