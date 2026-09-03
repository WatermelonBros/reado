// UI test: the first-run tour — when it auto-starts, when it doesn't, replaying
// it from Settings, and walking its steps. Ark's Tour is real; the surrounding
// gates (a project being open, the once-per-machine flag) are what's asserted.
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OnboardingTour } from "@/components/organisms/OnboardingTour"
import { useProject } from "@/lib/store"
import { useTourGuide } from "@/lib/tour"

const SEEN_KEY = "reado.tour.seen"

beforeEach(() => {
  // Ark's positioner reaches for it; happy-dom has no visual viewport.
  vi.stubGlobal("visualViewport", {
    width: 1280,
    height: 800,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  vi.useFakeTimers()
  localStorage.clear()
  useProject.setState({ root: "/repo" })
  useTourGuide.setState({ runNonce: 0 })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Let the 800ms settle delay pass. */
const settle = () => vi.advanceTimersByTimeAsync(1000)

describe("auto-starting", () => {
  it("opens once the UI has settled, the first time a project is open", async () => {
    render(<OnboardingTour />)
    expect(screen.queryByText("tour.welcomeTitle")).not.toBeInTheDocument()
    await settle()
    expect(screen.getByText("tour.welcomeTitle")).toBeInTheDocument()
  })

  it("marks itself seen only when it actually fires", async () => {
    const { unmount } = render(<OnboardingTour />)
    unmount() // a StrictMode-style throwaway mount must not burn the flag
    await settle()
    expect(localStorage.getItem(SEEN_KEY)).toBeNull()
    render(<OnboardingTour />)
    await settle()
    expect(localStorage.getItem(SEEN_KEY)).toBe("1")
  })

  it("never fires twice on the same machine", async () => {
    localStorage.setItem(SEEN_KEY, "1")
    render(<OnboardingTour />)
    await settle()
    expect(screen.queryByText("tour.welcomeTitle")).not.toBeInTheDocument()
  })

  it("stays out of the launcher, where its targets don't exist", async () => {
    useProject.setState({ root: "" })
    render(<OnboardingTour />)
    await settle()
    expect(screen.queryByText("tour.welcomeTitle")).not.toBeInTheDocument()
    expect(localStorage.getItem(SEEN_KEY)).toBeNull()
  })
})

describe("replaying from Settings", () => {
  it("starts from the first step, even after it has been seen", async () => {
    localStorage.setItem(SEEN_KEY, "1")
    render(<OnboardingTour />)
    await settle()
    useTourGuide.getState().run()
    await vi.advanceTimersByTimeAsync(10)
    expect(screen.getByText("tour.welcomeTitle")).toBeInTheDocument()
  })
})

describe("walking the steps", () => {
  it("offers skip and next on the welcome step, and dismisses on skip", async () => {
    render(<OnboardingTour />)
    await settle()
    expect(screen.getByText("tour.skip")).toBeInTheDocument()
    fireEvent.click(screen.getByText("tour.skip"))
    await vi.advanceTimersByTimeAsync(50)
    expect(screen.queryByText("tour.welcomeTitle")).not.toBeInTheDocument()
  })

  it("advances to the reading step", async () => {
    render(<OnboardingTour />)
    await settle()
    fireEvent.click(screen.getByText("tour.next"))
    await vi.advanceTimersByTimeAsync(50)
    expect(screen.getByText("tour.readTitle")).toBeInTheDocument()
  })

  it("closes from the × without finishing", async () => {
    render(<OnboardingTour />)
    await settle()
    fireEvent.click(screen.getByText("×"))
    await vi.advanceTimersByTimeAsync(50)
    expect(screen.queryByText("tour.welcomeTitle")).not.toBeInTheDocument()
  })
})
