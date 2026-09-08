// The shell behind the settings-JSON and keybindings dialogs: read the current
// text in, let it be edited, apply, and say what happened. The part worth
// pinning is that the message survives — both callers apply by writing to a
// store they also read from, and a reload triggered by that write would clear
// the message describing it before anyone could read it.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button } from "@/components/atoms/Button"
import { TextDialog } from "@/components/molecules/TextDialog"

/** A dialog over one string, applied the way the real ones apply: by writing to
 *  the same place `load` reads from. */
function harness(over: Partial<Parameters<typeof TextDialog>[0]> = {}) {
  const store = { text: "one\ntwo\n" }
  const onApply = vi.fn((draft: string) => {
    store.text = draft.toUpperCase()
    return `applied ${draft.split("\n").length} lines`
  })
  const utils = render(
    <TextDialog
      open
      onClose={() => {}}
      title="the title"
      hint="the hint"
      load={() => store.text}
      onApply={onApply}
      applyLabel="Apply"
      {...over}
    />,
  )
  return { ...utils, store, onApply, field: () => screen.getByRole("textbox") }
}

describe("TextDialog", () => {
  it("opens showing the text as it stands", () => {
    const { field } = harness()
    expect(field()).toHaveValue("one\ntwo\n")
    expect(screen.getByText("the hint")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "the title" })).toBeInTheDocument()
  })

  it("hands the edited text to onApply and reports what it returns", async () => {
    const { field, onApply } = harness()
    await userEvent.clear(field())
    await userEvent.type(field(), "three")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(onApply).toHaveBeenCalledWith("three")
    expect(screen.getByText("applied 1 lines")).toBeInTheDocument()
  })

  it("keeps the message up after applying, not just for a frame", async () => {
    // Apply writes to the store the field is loaded from. An effect watching
    // that store would fire straight after and wipe the message.
    const { field } = harness()
    await userEvent.clear(field())
    await userEvent.type(field(), "abc")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(await screen.findByText("applied 1 lines")).toBeInTheDocument()
  })

  it("settles the field on what was actually stored, not on what was typed", async () => {
    // The keybindings editor keeps only the lines that differ from the
    // defaults; showing the reader's draft back would misrepresent what it kept.
    const { field } = harness()
    await userEvent.clear(field())
    await userEvent.type(field(), "abc")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))
    expect(field()).toHaveValue("ABC")
  })

  it("reloads on reopen, so it never shows a stale copy", () => {
    const store = { text: "before" }
    const { rerender } = render(
      <TextDialog
        open
        onClose={() => {}}
        title="t"
        hint="h"
        load={() => store.text}
        onApply={() => ""}
        applyLabel="Apply"
      />,
    )
    const props = {
      onClose: () => {},
      title: "t",
      hint: "h",
      load: () => store.text,
      onApply: () => "",
      applyLabel: "Apply",
    }
    rerender(<TextDialog open={false} {...props} />)
    store.text = "after"
    rerender(<TextDialog open {...props} />)
    expect(screen.getByRole("textbox")).toHaveValue("after")
  })

  it("clears a stale message when an extra action reloads the field", async () => {
    const { field } = harness({
      actions: ({ reload }) => (
        <Button variant="secondary" onClick={reload}>
          Revert
        </Button>
      ),
    })
    await userEvent.clear(field())
    await userEvent.type(field(), "x")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))
    await userEvent.click(screen.getByRole("button", { name: "Revert" }))
    expect(field()).toHaveValue("X")
    expect(screen.queryByText(/applied/)).not.toBeInTheDocument()
  })

  it("gives an extra action the current draft", async () => {
    const seen: string[] = []
    const { field } = harness({
      actions: ({ draft }) => (
        <Button variant="ghost" onClick={() => seen.push(draft)}>
          Copy
        </Button>
      ),
    })
    await userEvent.type(field(), "!")
    await userEvent.click(screen.getByRole("button", { name: "Copy" }))
    expect(seen).toEqual(["one\ntwo\n!"])
  })
})
