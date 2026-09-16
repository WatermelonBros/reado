// UI test: the Test Explorer draws a windowed list (a big project puts a slice
// of its tests in the DOM, not all of them), and its header offers Run while
// idle and Stop while a run is in flight. The run/stop edge is mocked — what is
// under test is the panel, not the PTY.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { runTests, stopTests } = vi.hoisted(() => ({
  runTests: vi.fn(async () => {}),
  stopTests: vi.fn(),
}))
vi.mock("@/lib/testing", async (orig) => ({
  ...(await orig<typeof import("@/lib/testing")>()),
  runTests,
  stopTests,
}))

import { TestsPanel } from "@/components/organisms/TestsPanel"
import type { TestFile } from "@/lib/api"
import { useProject } from "@/lib/store"
import { testId, useTesting } from "@/lib/testing"

const ROOT = "/repo"

/** `n` files of `per` tests each — enough to be past the window. */
const bigProject = (n: number, per: number): TestFile[] =>
  Array.from({ length: n }, (_, f) => ({
    path: `src/file${f}.test.ts`,
    framework: "vitest",
    project: "",
    modified: 0,
    tests: Array.from({ length: per }, (_, i) => ({ name: `test ${f}-${i}`, suites: [], line: i })),
  }))

beforeEach(() => {
  runTests.mockClear()
  stopTests.mockClear()
  useProject.setState({ root: ROOT, open: vi.fn() })
  useTesting.setState({ files: [], byRoot: {}, loading: false, running: false })
})

describe("TestsPanel", () => {
  it("draws a window over the list rather than every test", () => {
    // 40 files × 50 tests = 2040 rows; the window is 300.
    useTesting.setState({ files: bigProject(40, 50) })
    render(<TestsPanel />)
    const rows = screen.getAllByRole("listitem")
    // Plus the two spacers that stand in for what is not drawn.
    expect(rows.length).toBeLessThanOrEqual(302)
    expect(screen.getByText("src/file0.test.ts")).toBeInTheDocument()
    // Far past the window: present in the model, absent from the DOM.
    expect(screen.queryByText("src/file39.test.ts")).not.toBeInTheDocument()
  })

  it("keeps the scrollbar honest about the rows it did not draw", () => {
    useTesting.setState({ files: bigProject(40, 50) })
    render(<TestsPanel />)
    const spacers = screen
      .getAllByRole("listitem", { hidden: true })
      .filter((li) => li.getAttribute("aria-hidden") === "true")
    expect(spacers).toHaveLength(2)
    // 2040 rows at 24px, minus the 300 drawn.
    const height = spacers.reduce((n, li) => n + Number.parseInt(li.style.height, 10), 0)
    expect(height).toBe((40 * 51 - 300) * 24)
  })

  it("accounts for every test in the strip, judged or not", () => {
    // The complaint this answers: "3312 tests, 3301 passed, 0 failed — where are
    // the other 11?". A test the framework never reported back has no verdict,
    // and the strip has to say so rather than let the reader do the subtraction.
    useTesting.setState({
      files: bigProject(2, 5),
      byRoot: {
        [ROOT]: {
          [testId("src/file0.test.ts", [], "test 0-0")]: { status: "pass", at: 1 },
          [testId("src/file0.test.ts", [], "test 0-1")]: { status: "fail", at: 1 },
        },
      },
    })
    render(<TestsPanel />)
    expect(screen.getByText("tests.count")).toBeInTheDocument()
    expect(screen.getByText("tests.passed")).toBeInTheDocument()
    expect(screen.getByText("tests.failed")).toBeInTheDocument()
    // 10 tests, 1 pass + 1 fail judged → 8 with no verdict.
    expect(screen.getByText("tests.notRun")).toBeInTheDocument()
  })

  it("counts a row for as many tests as the run reported it under", () => {
    // Why the panel's total used to read lower than the framework's: one
    // `it(`${name} …`)` in a loop is one row and two hundred tests.
    useTesting.setState({
      files: bigProject(1, 2),
      byRoot: {
        [ROOT]: {
          [testId("src/file0.test.ts", [], "test 0-0")]: { status: "pass", at: 1, cases: 200 },
          [testId("src/file0.test.ts", [], "test 0-1")]: { status: "pass", at: 1 },
        },
      },
    })
    render(<TestsPanel />)
    // 200 + 1, not 2 — and all of them green, so nothing is left unexplained.
    expect(screen.getByText("tests.count")).toBeInTheDocument()
    expect(screen.queryByText("tests.notRun")).not.toBeInTheDocument()
    expect(screen.getByText("×200")).toBeInTheDocument()
  })

  it("offers Run while idle and Stop while running", async () => {
    useTesting.setState({ files: bigProject(1, 1) })
    const { rerender } = render(<TestsPanel />)

    await userEvent.click(screen.getByRole("button", { name: "tests.runAll" }))
    expect(runTests).toHaveBeenCalledWith({ framework: "vitest" })
    expect(screen.queryByRole("button", { name: "tests.stop" })).not.toBeInTheDocument()

    useTesting.setState({ running: true })
    rerender(<TestsPanel />)
    expect(screen.queryByRole("button", { name: "tests.runAll" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "tests.stop" }))
    expect(stopTests).toHaveBeenCalled()
  })

  it("collapses every file at once, then expands them again", async () => {
    useTesting.setState({ files: bigProject(3, 2) })
    render(<TestsPanel />)
    expect(screen.getByText("test 2-1")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "tests.collapseAll" }))
    expect(screen.queryByText("test 2-1")).not.toBeInTheDocument()
    expect(screen.getByText("src/file2.test.ts")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "tests.expandAll" }))
    expect(screen.getByText("test 2-1")).toBeInTheDocument()
  })

  it("collapsing a file drops its tests out of the list", async () => {
    useTesting.setState({ files: bigProject(1, 3) })
    render(<TestsPanel />)
    expect(screen.getByText("test 0-1")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { expanded: true }))
    expect(screen.queryByText("test 0-1")).not.toBeInTheDocument()
  })
})
