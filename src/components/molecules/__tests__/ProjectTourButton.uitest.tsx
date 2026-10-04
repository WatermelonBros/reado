import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProjectTourButton } from "@/components/molecules/ProjectTourButton"
import { registerTourMenuItem, resetContributionsForTest } from "@/lib/contributions"
import { type Tour, useProjectTours } from "@/lib/projectTours"

const tour: Tour = {
  id: "t1",
  name: "Request lifecycle",
  onboarding: true,
  steps: [{ file: "a.ts", title: "A", body: "b" }],
}

beforeEach(() => {
  resetContributionsForTest()
  localStorage.clear()
  useProjectTours.setState({ root: "/p", tours: [], newer: false, invalid: 0, playing: null })
})

describe("ProjectTourButton", () => {
  it("isn't there with no tours and nothing registered", () => {
    const { container } = render(<ProjectTourButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it("plays the project tour in one click when there's nothing to choose", async () => {
    useProjectTours.setState({ tours: [tour] })
    render(<ProjectTourButton />)
    await userEvent.click(screen.getByRole("button", { name: /projectTour.button/ }))
    expect(useProjectTours.getState().playing).toEqual({ tourId: "t1", step: 0 })
  })

  it("lists a registered entry — and shows up for it even with no tours yet", async () => {
    const run = vi.fn()
    registerTourMenuItem({ label: (has) => (has ? "Edit tours…" : "Create a tour…"), run })
    render(<ProjectTourButton />)
    await userEvent.click(screen.getByRole("button", { name: /projectTour.button/ }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Create a tour…" }))
    expect(run).toHaveBeenCalled()
  })

  it("puts the entry under the tours when there are some", async () => {
    useProjectTours.setState({ tours: [tour] })
    registerTourMenuItem({
      label: (has) => (has ? "Edit tours…" : "Create a tour…"),
      run: () => {},
    })
    render(<ProjectTourButton />)
    await userEvent.click(screen.getByRole("button", { name: /projectTour.button/ }))
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent)
    expect(items[0]).toContain("Request lifecycle")
    expect(items[items.length - 1]).toBe("Edit tours…")
  })
})
