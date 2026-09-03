// UI test: the left tool rail renders base tools always, gated tools only when
// their store condition holds, shows a Badge count for tools that carry one,
// selects a tool on click, and wires the docs/graph/settings footer buttons.
// (Pointer drag-reorder is deliberately not exercised — too fragile in jsdom.)

import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ActivityBar } from "@/components/organisms/ActivityBar"
import type { Comment } from "@/lib/api"
import { useBookmarks } from "@/lib/bookmarks"
import { useComments } from "@/lib/comments"
import { useDiagnostics } from "@/lib/diagnostics"
import { useGuidedReview } from "@/lib/guidedReview"
import { useHierarchy } from "@/lib/hierarchy"
import { usePreReview } from "@/lib/preReview"
import { useQa } from "@/lib/qa"
import { useSpecs } from "@/lib/specs"
import { usePalette, useProject, useWorkspace } from "@/lib/store"
import { useTours } from "@/lib/tours"

const mkComment = (over: Partial<Comment> = {}): Comment =>
  ({
    id: "c1",
    type: "note",
    state: "open",
    kind: "task",
    anchor: { file: "a.ts", scope: "range", startLine: 1, endLine: 2 },
    context: { snippet: "", before: "", after: "" },
    links: [],
    author: "user",
    orphan: false,
    createdAt: 0,
    updatedAt: 0,
    messages: [],
    archived: false,
    ...over,
  }) as Comment

// Reset every store the rail reads so each test starts from a known baseline:
// base tools visible, all gated tools hidden, no badges.
beforeEach(() => {
  useWorkspace.setState({ tool: "files", toolOrder: [] })
  usePalette.setState({ settingsOpen: false })
  useProject.setState({
    git: {
      isRepo: false,
      branch: null,
      ahead: 0,
      behind: 0,
      hasRemote: false,
      hasUpstream: false,
      changedFiles: 0,
    },
  })
  useComments.setState({ comments: [] })
  useSpecs.setState({ groups: [] })
  useDiagnostics.setState({ byFile: {} })
  useBookmarks.setState({ bookmarks: [] })
  useHierarchy.setState({ root: null, loading: false, unsupported: false })
  useQa.setState({ notes: [] })
  useTours.setState({ tours: [] })
  usePreReview.setState({ drafts: [] })
  useGuidedReview.setState({ sessions: [] })
})

// Buttons carry the (mocked-through) i18n key as their aria-label, so we can
// query by role+name using the key directly.
const tool = (name: string) => screen.getByRole("button", { name })

describe("ActivityBar", () => {
  it("renders the base tools as labelled buttons", () => {
    render(<ActivityBar />)
    for (const label of [
      "files.panel",
      "search.placeholder",
      "comments.panel",
      "outline.panel",
      "ext.panel",
      "guided.panel",
      "coverage.panel",
    ]) {
      expect(tool(label)).toBeInTheDocument()
    }
  })

  it("renders the footer docs / graph / settings buttons", () => {
    render(<ActivityBar />)
    expect(tool("kb.title")).toBeInTheDocument()
    expect(tool("graph.title")).toBeInTheDocument()
    expect(tool("settings.title")).toBeInTheDocument()
  })

  it("shows the git tool only when the project is a repo", () => {
    // One reactive instance: the git tool appears when the store flips to a repo
    // (rendering twice would leave two live ActivityBars both reacting → two
    // git buttons, which getByRole then rejects as ambiguous).
    render(<ActivityBar />)
    expect(screen.queryByRole("button", { name: "git.panel" })).not.toBeInTheDocument()

    act(() =>
      useProject.setState({
        git: {
          isRepo: true,
          branch: "main",
          ahead: 0,
          behind: 0,
          hasRemote: false,
          hasUpstream: false,
          changedFiles: 0,
        },
      }),
    )
    expect(tool("git.panel")).toBeInTheDocument()
  })

  it("renders a badge count for a tool that carries one", () => {
    useComments.setState({
      comments: [
        mkComment({ id: "c1", state: "open" }),
        mkComment({ id: "c2", state: "open" }),
        mkComment({ id: "c3", state: "done" }),
      ],
    })
    render(<ActivityBar />)
    // Two open comments → the comments button shows the count "2".
    const commentsBtn = tool("comments.panel")
    expect(commentsBtn).toHaveTextContent("2")
  })

  it("badges Source Control with the number of changed files", () => {
    act(() =>
      useProject.setState({
        git: {
          isRepo: true,
          branch: "main",
          ahead: 0,
          behind: 0,
          hasRemote: false,
          hasUpstream: false,
          changedFiles: 3,
        },
      }),
    )
    render(<ActivityBar />)
    expect(tool("git.panel")).toHaveTextContent("3")

    // A clean tree carries no badge at all, rather than a "0".
    act(() =>
      useProject.setState({
        git: {
          isRepo: true,
          branch: "main",
          ahead: 0,
          behind: 0,
          hasRemote: false,
          hasUpstream: false,
          changedFiles: 0,
        },
      }),
    )
    expect(tool("git.panel")).not.toHaveTextContent("0")
  })

  it("selects a tool in the workspace store when its button is clicked", async () => {
    render(<ActivityBar />)
    // Start on "files"; clicking outline selects it.
    await userEvent.click(tool("outline.panel"))
    expect(useWorkspace.getState().tool).toBe("outline")

    await userEvent.click(tool("search.placeholder"))
    expect(useWorkspace.getState().tool).toBe("search")
  })

  it("toggles the settings palette when Settings is clicked", async () => {
    render(<ActivityBar />)
    expect(usePalette.getState().settingsOpen).toBe(false)
    await userEvent.click(tool("settings.title"))
    expect(usePalette.getState().settingsOpen).toBe(true)
  })
})

describe("every gated tool appears with its own condition", () => {
  // One gate at a time: turning them all on at once and asserting presence
  // passes for a tool whose condition was deleted.
  const GATES: Array<[string, () => void]> = [
    ["git.panel", () => useProject.setState({ git: { isRepo: true } as never })],
    ["timeline.panel", () => useProject.setState({ git: { isRepo: true } as never })],
    [
      "specs.panel",
      () => useSpecs.setState({ groups: [{ kind: "spec", title: "auth", items: [] }] as never }),
    ],
    ["orphans.panel", () => useComments.setState({ comments: [mkComment({ orphan: true })] })],
    [
      "problems.panel",
      () =>
        useDiagnostics.setState({
          byFile: { "a.ts": [{ line: 1, character: 0, severity: 1, message: "x" }] } as never,
        }),
    ],
    [
      "bookmarks.panel",
      () => useBookmarks.setState({ bookmarks: [{ path: "a.ts", line: 1, snippet: "x" }] }),
    ],
    [
      "hier.panel",
      () =>
        useHierarchy.setState({ root: { name: "f", path: "a.ts", line: 1, item: {} } as never }),
    ],
    ["qa.panel", () => useQa.setState({ notes: [{ id: "q1" }] as never })],
    ["tours.panel", () => useTours.setState({ tours: [{ id: "t1" }] as never })],
    ["prereview.panel", () => usePreReview.setState({ drafts: [{ id: "p1" }] as never })],
  ]

  for (const [key, seed] of GATES) {
    it(`shows ${key} only once its condition holds`, () => {
      const off = render(<ActivityBar />)
      expect(screen.queryByLabelText(key)).not.toBeInTheDocument()
      off.unmount()
      act(seed)
      render(<ActivityBar />)
      expect(screen.getByLabelText(key)).toBeInTheDocument()
    })
  }
})

describe("the badges", () => {
  it("counts changed files, open comments, orphans, problems and proposals", () => {
    useProject.setState({ git: { isRepo: true, changedFiles: 4 } as never })
    useComments.setState({
      comments: [mkComment({ orphan: true }), mkComment({ id: "c2" }), mkComment({ id: "c3" })],
    })
    useDiagnostics.setState({
      byFile: { "a.ts": [{ line: 1, character: 0, severity: 1, message: "x" }] } as never,
    })
    usePreReview.setState({ drafts: [{ id: "p1" }, { id: "p2" }] as never })
    render(<ActivityBar />)
    // Source Control's count is information, not an alarm — every count shows.
    expect(screen.getByLabelText("git.panel").textContent).toContain("4")
    expect(screen.getByLabelText("comments.panel").textContent).toContain("3")
    expect(screen.getByLabelText("orphans.panel").textContent).toContain("1")
    expect(screen.getByLabelText("problems.panel").textContent).toContain("1")
    expect(screen.getByLabelText("prereview.panel").textContent).toContain("2")
  })

  it("shows no badge on a tool that carries no count", () => {
    render(<ActivityBar />)
    expect(screen.getByLabelText("files.panel").textContent?.trim()).toBe("")
  })
})

describe("the custom tool order", () => {
  it("puts the ordered tools first, keeping the rest in their natural order", () => {
    useWorkspace.setState({ tool: "files", toolOrder: ["coverage", "search"] })
    render(<ActivityBar />)
    const ids = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("data-reorder-id"))
      .filter(Boolean)
    expect(ids.slice(0, 2)).toEqual(["coverage", "search"])
  })

  it("reorders on a drag", () => {
    render(<ActivityBar />)
    const files = screen.getByLabelText("files.panel")
    const search = screen.getByLabelText("search.placeholder")
    search.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40 }) as DOMRect
    vi.spyOn(document, "elementFromPoint").mockReturnValue(search)
    fireEvent.pointerDown(files, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 0, clientY: 30 })
    fireEvent.pointerUp(window, { clientX: 0, clientY: 30 })
    expect(useWorkspace.getState().toolOrder[0]).toBe("search")
    vi.restoreAllMocks()
  })

  it("ignores a drop on the tool being dragged", () => {
    render(<ActivityBar />)
    const files = screen.getByLabelText("files.panel")
    files.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40 }) as DOMRect
    vi.spyOn(document, "elementFromPoint").mockReturnValue(files)
    const before = useWorkspace.getState().toolOrder
    fireEvent.pointerDown(files, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 0, clientY: 30 })
    fireEvent.pointerUp(window, { clientX: 0, clientY: 30 })
    expect(useWorkspace.getState().toolOrder).toBe(before)
    vi.restoreAllMocks()
  })
})
