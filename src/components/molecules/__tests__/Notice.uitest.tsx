// The Notice toast stack component (render side). The store logic is covered in
// lib/__tests__/notice.uitest.ts; here we verify the component renders a toast
// per entry and that a manual dismiss removes one.

import { act, render, screen, waitForElementToBeRemoved } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Notice } from "@/components/molecules/Notice"
import { useNotice } from "@/lib/notice"

beforeEach(() => useNotice.setState({ notices: [] }))
afterEach(() => vi.useRealTimers())

// Kept in step with the component's own constants.
const EXIT_MS = 200

describe("Notice", () => {
  it("renders nothing when there are no notices", () => {
    const { container } = render(<Notice />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders a toast per notice, error as an alert", () => {
    useNotice.getState().show("error", "boom")
    useNotice.getState().show("info", "hello")
    render(<Notice />)
    expect(screen.getByText("boom")).toBeInTheDocument()
    expect(screen.getByText("hello")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("boom")
  })

  it("clears itself after its five seconds, and not before", async () => {
    vi.useFakeTimers()
    useNotice.getState().show("info", "self-clearing")
    render(<Notice />)

    // The exit timer is created by a React effect *after* the linger fires, so
    // a single big advance can never traverse both — step, let React settle,
    // step again.
    const step = async (ms: number) => {
      await act(async () => {
        vi.advanceTimersByTime(ms)
      })
      await act(async () => {
        vi.advanceTimersByTime(EXIT_MS)
      })
    }

    // 4.2s in: comfortably past any shorter linger plus its exit, still up.
    await step(4000)
    expect(useNotice.getState().notices).toHaveLength(1)
    expect(screen.getByText("self-clearing")).toBeInTheDocument()

    // Past 5s, it leaves of its own accord.
    await step(1000)
    expect(useNotice.getState().notices).toHaveLength(0)
  })

  it("removes a toast when its dismiss button is clicked", async () => {
    useNotice.getState().show("info", "bye soon")
    render(<Notice />)
    const toast = screen.getByText("bye soon")
    const dismiss = screen.getByRole("button", { name: "common.dismiss" })
    await userEvent.click(dismiss)
    await waitForElementToBeRemoved(toast)
    expect(screen.queryByText("bye soon")).not.toBeInTheDocument()
  })
})
