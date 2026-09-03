// UI test: the Comments side panel. It lists open comments, switches to the
// archived History view, filters by type/state/this-file, and navigates the
// editor when a comment is clicked. The real stores are seeded (useComments,
// useProject, useReadProgress) and the outward edges are stubbed with vi.fn:
// `loadArchived`/`setActive` on the comments store and `open` on the project
// store, so no Tauri command fires. The workspace filter store (persisted) is
// reset to its defaults each test. i18n is stubbed globally (t(k) => k).

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CommentsPanel } from "@/components/organisms/CommentsPanel"
import type { Comment, CommentType } from "@/lib/api"
import { useComments } from "@/lib/comments"
import { useReadProgress } from "@/lib/readProgress"
import { useProject, useWorkspace } from "@/lib/store"

const ROOT = "/repo"

function comment(over: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    type: "note",
    state: "open",
    kind: "note",
    anchor: { file: "src/a.ts", scope: "range", startLine: 12, endLine: 12 },
    context: { snippet: "", before: "", after: "" },
    links: [],
    author: "you",
    orphan: false,
    createdAt: 0,
    updatedAt: 0,
    messages: [{ author: "you", createdAt: 0, body: "why is this here?" }],
    archived: false,
    ...over,
  }
}

/** Seed both stores' data + stub the navigation/loading edges. */
function seed(opts: { comments?: Comment[]; archived?: Comment[]; active?: string | null } = {}) {
  const open = vi.fn()
  const setActive = vi.fn()
  const loadArchived = vi.fn(async () => {})
  useComments.setState({
    comments: opts.comments ?? [],
    archived: opts.archived ?? [],
    loadArchived,
    setActive,
    activeId: null,
  })
  useProject.setState({ root: ROOT, active: opts.active ?? null, open })
  return { open, setActive, loadArchived }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Filters live in the persisted workspace store; reset to defaults so tests
  // don't leak view/type/state into each other.
  useWorkspace.setState({
    commentFilter: { view: "open", type: "all", state: "all", thisFile: false },
  })
  useReadProgress.setState({ read: new Set(), changed: new Set() })
})

describe("CommentsPanel", () => {
  it("lists the open comments", () => {
    seed({
      comments: [
        comment({ id: "c1", messages: [{ author: "you", createdAt: 0, body: "first note" }] }),
        comment({ id: "c2", messages: [{ author: "you", createdAt: 0, body: "second note" }] }),
      ],
    })
    render(<CommentsPanel />)

    expect(screen.getByText("first note")).toBeInTheDocument()
    expect(screen.getByText("second note")).toBeInTheDocument()
  })

  it("lists the most recently touched comment first", () => {
    const body = (b: string) => [{ author: "you", createdAt: 0, body: b }]
    seed({
      comments: [
        comment({ id: "c1", updatedAt: 10, messages: body("oldest") }),
        comment({ id: "c2", updatedAt: 30, messages: body("newest") }),
        comment({ id: "c3", updatedAt: 20, messages: body("middle") }),
      ],
    })
    render(<CommentsPanel />)
    // Order, not membership: the thread you just replied to must not sink to
    // the bottom of the list.
    const rows = screen
      .getAllByRole("button")
      .filter((b) => /oldest|newest|middle/.test(b.textContent ?? ""))
    expect(rows.map((r) => r.textContent?.match(/oldest|newest|middle/)?.[0])).toEqual([
      "newest",
      "middle",
      "oldest",
    ])
  })

  it("shows the empty state when there are no open comments", () => {
    seed({ comments: [] })
    render(<CommentsPanel />)
    expect(screen.getByText("comments.empty")).toBeInTheDocument()
  })

  it("switching to History loads and shows the archived comments", async () => {
    const { loadArchived } = seed({
      comments: [
        comment({ id: "c1", messages: [{ author: "you", createdAt: 0, body: "still open" }] }),
      ],
      archived: [
        comment({
          id: "a1",
          state: "done",
          archived: true,
          messages: [{ author: "you", createdAt: 0, body: "resolved thing" }],
        }),
      ],
    })
    render(<CommentsPanel />)

    await userEvent.click(screen.getByText("comments.history"))

    expect(loadArchived).toHaveBeenCalled()
    expect(screen.getByText("resolved thing")).toBeInTheDocument()
    // The open comment is not in the history view.
    expect(screen.queryByText("still open")).not.toBeInTheDocument()
  })

  it("a type filter narrows the list to matching comments", async () => {
    seed({
      comments: [
        comment({
          id: "c1",
          type: "bug" as CommentType,
          kind: "task",
          messages: [{ author: "you", createdAt: 0, body: "a real bug" }],
        }),
        comment({
          id: "c2",
          type: "note" as CommentType,
          messages: [{ author: "you", createdAt: 0, body: "just a note" }],
        }),
      ],
    })
    render(<CommentsPanel />)

    // Both show under the default "all" filter.
    expect(screen.getByText("a real bug")).toBeInTheDocument()
    expect(screen.getByText("just a note")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("combobox", { name: "type filter" }))
    await userEvent.click(screen.getByRole("option", { name: "comment.type.bug" }))

    expect(screen.getByText("a real bug")).toBeInTheDocument()
    expect(screen.queryByText("just a note")).not.toBeInTheDocument()
  })

  it("clicking a comment opens its file at the anchor and selects it", async () => {
    const { open, setActive } = seed({
      comments: [
        comment({ id: "c1", messages: [{ author: "you", createdAt: 0, body: "jump here" }] }),
      ],
    })
    render(<CommentsPanel />)

    await userEvent.click(screen.getByText("jump here"))

    expect(open).toHaveBeenCalledWith(`${ROOT}/src/a.ts`, 12)
    expect(setActive).toHaveBeenCalledWith("c1")
  })

  it("marks a comment as pending when its file changed since it was read", () => {
    seed({
      comments: [
        comment({ id: "c1", messages: [{ author: "you", createdAt: 0, body: "check me" }] }),
      ],
    })
    // The agent touched this file after it was last read → pending review.
    useReadProgress.setState({ changed: new Set(["src/a.ts"]) })
    render(<CommentsPanel />)

    // t("comments.pending") is uppercased in the badge.
    expect(screen.getByText("COMMENTS.PENDING")).toBeInTheDocument()
    expect(screen.getByText("comments.agentChanged")).toBeInTheDocument()
  })
})

describe("a comment the agent may have touched", () => {
  it("flags it as pending review, and opens its delta", async () => {
    seed({ comments: [comment()] })
    useReadProgress.setState({ read: new Set(["src/a.ts"]), changed: new Set(["src/a.ts"]) })
    const { useEditorActions } = await import("@/lib/store")
    render(<CommentsPanel />)
    expect(screen.getByText("comments.pending".toUpperCase())).toBeInTheDocument()
    const review = screen
      .getAllByRole("button")
      .find((b) => /delta|review/i.test(b.textContent ?? "")) as HTMLElement
    await userEvent.click(review)
    expect(useEditorActions.getState().diffing).toBe(true)
  })

  it("doesn't flag one whose file is unchanged", () => {
    seed({ comments: [comment()] })
    useReadProgress.setState({ read: new Set(), changed: new Set() })
    render(<CommentsPanel />)
    expect(screen.getByText("why is this here?")).toBeInTheDocument()
    expect(screen.queryByText("comments.pending".toUpperCase())).not.toBeInTheDocument()
    expect(screen.queryByText("comments.reviewChange")).not.toBeInTheDocument()
  })
})

describe("navigating from the list", () => {
  it("opens a file-scoped comment at the file, with no line", async () => {
    const { open } = seed({
      comments: [
        comment({
          anchor: { file: "src/a.ts", scope: "file", startLine: 0, endLine: 0 },
        } as Partial<Comment>),
      ],
    })
    render(<CommentsPanel />)
    await userEvent.click(screen.getByText("why is this here?"))
    expect(open).toHaveBeenCalledWith(`${ROOT}/src/a.ts`)
  })

  it("reveals a design comment in the browser instead of the editor", async () => {
    const { usePreview } = await import("@/lib/preview")
    const { open } = seed({
      comments: [
        comment({
          anchor: {
            file: "",
            scope: "web",
            url: "http://localhost:5173/x",
            x: 4,
            y: 9,
            startLine: 0,
            endLine: 0,
          },
        } as Partial<Comment>),
      ],
    })
    render(<CommentsPanel />)
    await userEvent.click(screen.getByText("why is this here?"))
    expect(open).not.toHaveBeenCalled()
    expect(usePreview.getState().pinRequest).toMatchObject({
      url: "http://localhost:5173/x",
      x: 4,
      y: 9,
    })
  })

  it("opens nothing for a project-scoped comment", async () => {
    const { open, setActive } = seed({
      comments: [
        comment({
          anchor: { file: "", scope: "project", startLine: 0, endLine: 0 },
        } as Partial<Comment>),
      ],
    })
    render(<CommentsPanel />)
    await userEvent.click(screen.getByText("why is this here?"))
    // The click did land — it selects the comment, it just has nowhere to open.
    expect(setActive).toHaveBeenCalledWith("c1")
    expect(open).not.toHaveBeenCalled()
  })
})

describe("what each row shows", () => {
  it("marks an orphan, and names where a comment came from", () => {
    seed({ comments: [comment({ orphan: true, origin: "agent" } as Partial<Comment>)] })
    render(<CommentsPanel />)
    expect(screen.getByText("⚠")).toBeInTheDocument()
    expect(screen.getByText("agent")).toBeInTheDocument()
  })

  it("dates a resolved comment in the history view", async () => {
    seed({ comments: [], archived: [comment({ state: "done", updatedAt: 1_700_000_000_000 })] })
    render(<CommentsPanel />)
    await userEvent.click(screen.getByText("comments.history"))
    expect(await screen.findByText("comments.resolvedAt")).toBeInTheDocument()
  })

  it("resolves a comment straight from the list", async () => {
    seed({ comments: [comment()] })
    const setState = vi.fn(async () => {})
    useComments.setState({ setState })
    render(<CommentsPanel />)
    await userEvent.click(screen.getByLabelText("comments.resolve"))
    expect(setState).toHaveBeenCalledWith("c1", "done")
  })

  it("offers no resolve on an already-done comment", () => {
    seed({ comments: [comment({ state: "done" })] })
    render(<CommentsPanel />)
    expect(screen.queryByLabelText("comments.resolve")).not.toBeInTheDocument()
  })

  it("shows a comment with no body without breaking", () => {
    seed({ comments: [comment({ messages: [] })] })
    render(<CommentsPanel />)
    expect(screen.getByText("src/a.ts:12")).toBeInTheDocument()
  })
})
