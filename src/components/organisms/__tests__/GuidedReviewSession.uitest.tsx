// UI test: the Review Guide with a session running — the focus card, the route
// queue, and disposing of the agent's proposals. Every artifact is a proposal
// the human accepts, edits, converts, defers or discards, so that is what's
// asserted. (The empty state is covered in GuidedReviewPanel.uitest.tsx.)
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Proposal, Session } from "@/lib/api"

vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  gitBranches: vi.fn(async () => ({ local: ["main"], current: "main" })),
}))
vi.mock("../../../lib/agents", () => ({
  dispatchToAgent: vi.fn(),
  sanitizePromptText: (s: string) => s,
}))
vi.mock("../../molecules/ResolveLoopBar", () => ({ ResolveLoopBar: () => null }))

import { GuidedReviewPanel } from "@/components/organisms/GuidedReviewPanel"
import { useGuidedReview } from "@/lib/guidedReview"
import { useProject } from "@/lib/store"

const ROOT = "/repo"

const store = {
  focusFile: vi.fn(async () => {}),
  reviewFile: vi.fn(async () => {}),
  challenge: vi.fn(async () => {}),
  respond: vi.fn(async () => {}),
  widen: vi.fn(async () => {}),
  finishFile: vi.fn(async () => {}),
  accept: vi.fn(async () => {}),
  discard: vi.fn(async () => {}),
  edit: vi.fn(async () => {}),
  falsePositive: vi.fn(async () => {}),
  sendTasks: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  discardSession: vi.fn(async () => {}),
}

const proposal = (over: Partial<Proposal> = {}): Proposal =>
  ({
    id: "p1",
    artifactType: "comment",
    state: "proposed",
    file: "src/a.ts",
    startLine: 12,
    endLine: 12,
    type: "bug",
    body: "this can be null here",
    author: "agent",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Proposal

const session = (over: Partial<Session> = {}): Session =>
  ({
    id: "s1",
    title: "Review the diff",
    scope: { kind: "diff" },
    objective: "bug_risk",
    status: "in_review",
    position: 0,
    route: [
      { file: "src/a.ts", priority: 1, reason: "most dependents", suggestedReviewMode: "deep" },
      { file: "src/b.ts", priority: 2, reason: "", suggestedReviewMode: "quick" },
    ],
    files: [],
    proposals: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Session

/** Alias so a test reads "the session I am about to mount", not "session()". */
const mountable = session

/** Mount the panel with `s` as the running session. */
function mount(s: Session) {
  useGuidedReview.setState({ sessions: [s], currentId: s.id, busy: false, ...store })
  return render(<GuidedReviewPanel />)
}

beforeEach(() => {
  vi.clearAllMocks()
  useProject.setState({ root: ROOT, open: vi.fn() })
})

describe("the focus card", () => {
  it("names the current file with the agent's reason for it", () => {
    mount(session())
    expect(screen.getByRole("button", { name: "a.ts" })).toBeInTheDocument()
    expect(screen.getByText("most dependents")).toBeInTheDocument()
  })

  it("opens the file when its name is clicked", async () => {
    mount(session())
    await userEvent.click(screen.getByRole("button", { name: "a.ts" }))
    expect(store.focusFile).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts")
  })

  it("reviews the file first, then offers a second opinion once it has findings", async () => {
    const { unmount } = mount(session())
    await userEvent.click(screen.getByRole("button", { name: "guided.action.review" }))
    expect(store.reviewFile).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts")
    unmount()

    mount(session({ proposals: [proposal()] }))
    await userEvent.click(screen.getByRole("button", { name: "guided.action.again" }))
    expect(store.challenge).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts")
  })

  it("marks the file reviewed or skipped, responds, and widens", async () => {
    mount(session())
    await userEvent.click(screen.getByRole("button", { name: "guided.action.reviewed" }))
    expect(store.finishFile).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts", "reviewed")
    await userEvent.click(screen.getByRole("button", { name: "guided.action.skip" }))
    expect(store.finishFile).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts", "skipped")
    await userEvent.click(screen.getByRole("button", { name: "guided.action.respond" }))
    expect(store.respond).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts")
    await userEvent.click(screen.getByRole("button", { name: "guided.action.widen" }))
    expect(store.widen).toHaveBeenCalledWith(ROOT, "s1")
  })

  it("shows the related files the route named", () => {
    mount(
      session({
        route: [
          {
            file: "src/a.ts",
            priority: 1,
            reason: "",
            suggestedReviewMode: "deep",
            relatedFiles: ["src/x.ts", "src/y.ts"],
          },
        ],
      }),
    )
    expect(screen.getByText(/src\/x\.ts, src\/y\.ts/)).toBeInTheDocument()
  })
})

describe("while the agent is still planning", () => {
  it("says so, with nothing to act on", () => {
    mount(session({ route: [], status: "planning" }))
    expect(screen.getByText("guided.planning")).toBeInTheDocument()
    expect(screen.queryByText("guided.proposals")).not.toBeInTheDocument()
  })

  it("says the route came back empty when planning finished with nothing", () => {
    mount(session({ route: [], status: "in_review" }))
    expect(screen.getByText("guided.noRoute")).toBeInTheDocument()
  })
})

describe("disposing of a proposal", () => {
  it("shows its type, body and anchor, and opens the anchor", async () => {
    mount(session({ proposals: [proposal()] }))
    expect(screen.getByText("this can be null here")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "src/a.ts:12" }))
    expect(useProject.getState().open).toHaveBeenCalledWith("/repo/src/a.ts", 12)
  })

  it("approves it as a task, or as a note", async () => {
    mount(session({ proposals: [proposal()] }))
    await userEvent.click(screen.getByRole("button", { name: "guided.approve" }))
    expect(store.accept).toHaveBeenCalledWith(ROOT, "s1", "p1")
    await userEvent.click(screen.getByRole("button", { name: "guided.approveNote" }))
    expect(store.accept).toHaveBeenLastCalledWith(ROOT, "s1", "p1", true)
  })

  it("discards it, or records it as a false positive", async () => {
    mount(session({ proposals: [proposal()] }))
    await userEvent.click(screen.getByRole("button", { name: "guided.discard" }))
    expect(store.discard).toHaveBeenCalledWith(ROOT, "s1", "p1")
    await userEvent.click(screen.getByRole("button", { name: "guided.falsePositive" }))
    expect(store.falsePositive).toHaveBeenCalledWith(ROOT, "s1", "p1", "guided.fpNote")
  })

  it("edits the wording before accepting it", async () => {
    mount(session({ proposals: [proposal()] }))
    await userEvent.click(screen.getByRole("button", { name: "guided.edit" }))
    const box = screen.getByRole("textbox")
    await userEvent.clear(box)
    await userEvent.type(box, "sharper wording")
    await userEvent.click(screen.getByRole("button", { name: "guided.save" }))
    expect(store.edit).toHaveBeenCalledWith(ROOT, "s1", "p1", "sharper wording")
  })

  it("cancels an edit without changing anything", async () => {
    mount(session({ proposals: [proposal()] }))
    await userEvent.click(screen.getByRole("button", { name: "guided.edit" }))
    await userEvent.click(screen.getByRole("button", { name: "guided.cancel" }))
    expect(store.edit).not.toHaveBeenCalled()
    expect(screen.getByText("this can be null here")).toBeInTheDocument()
  })

  it("floats the current file's proposals to the top", () => {
    mount(
      session({
        proposals: [
          proposal({ id: "elsewhere", file: "src/b.ts", body: "on another file" }),
          proposal({ id: "here", body: "on the current file" }),
        ],
      }),
    )
    const bodies = screen.getAllByText(/on the current file|on another file/)
    expect(bodies[0]).toHaveTextContent("on the current file")
  })

  it("offers a batch disposal only once the current file has several", async () => {
    const { unmount } = mount(session({ proposals: [proposal()] }))
    expect(screen.queryByRole("button", { name: "guided.approveAll" })).not.toBeInTheDocument()
    unmount()

    mount(session({ proposals: [proposal(), proposal({ id: "p2", body: "and another" })] }))
    await userEvent.click(screen.getByRole("button", { name: "guided.approveAll" }))
    expect(store.accept).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole("button", { name: "guided.discardAll" }))
    expect(store.discard).toHaveBeenCalledTimes(2)
  })

  it("says so when there is nothing left to dispose of", () => {
    mount(session())
    expect(screen.getByText("guided.noProposals")).toBeInTheDocument()
  })

  it("leaves already-disposed proposals out of the list", () => {
    mount(session({ proposals: [proposal({ state: "discarded", body: "gone" })] }))
    expect(screen.queryByText("gone")).not.toBeInTheDocument()
    expect(screen.getByText("guided.noProposals")).toBeInTheDocument()
  })
})

describe("the route queue", () => {
  it("lists each file with its state, and marks the current one", async () => {
    mount(session({ files: [{ file: "src/b.ts", state: "reviewed" }] as Session["files"] }))
    expect(screen.getByText("guided.fs.reviewed")).toBeInTheDocument()
    expect(screen.getByText("guided.fs.queued")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /b\.ts/ }))
    expect(store.focusFile).toHaveBeenCalledWith(ROOT, "s1", "src/b.ts")
  })
})

describe("what the session remembers", () => {
  it("shows the file summary, the decisions and the running summary", () => {
    mount(
      session({
        files: [
          { file: "src/a.ts", state: "reviewed", summary: "checked the null paths" },
        ] as Session["files"],
        proposals: [proposal({ id: "d1", artifactType: "decision", body: "keep the guard" })],
        summary: "two risky spots, one fixed",
      }),
    )
    expect(screen.getByText("checked the null paths")).toBeInTheDocument()
    // A still-open decision shows twice: once as a proposal to dispose of, once
    // in the session's Decisions memo.
    expect(screen.getAllByText(/keep the guard/)).toHaveLength(2)
    expect(screen.getByText("two risky spots, one fixed")).toBeInTheDocument()
  })

  // The count itself is rendered through `t("guided.memory", { count })`, and the
  // i18n stub returns the bare key — so only its presence is observable here.
  it("surfaces the session's memory once something was dismissed", () => {
    // "once" is the claim: with nothing dismissed the line must be absent, or
    // the guard could be deleted and this would still pass.
    const { unmount } = mount(session())
    expect(screen.queryByText("guided.memory")).not.toBeInTheDocument()
    unmount()
    mount(session({ proposals: [proposal({ state: "resolved_as_false_positive" })] }))
    expect(screen.getByText("guided.memory")).toBeInTheDocument()
  })

  it("draws the progress bar at the fraction reviewed, and names the objective", () => {
    const { container } = mount(
      mountable({ files: [{ file: "src/a.ts", state: "reviewed" }] as Session["files"] }),
    )
    // One of the two routed files is done.
    const bar = container.querySelector(".bg-accent") as HTMLElement
    expect(bar.style.width).toBe("50%")
    expect(screen.getByText("guided.obj.bug_risk")).toBeInTheDocument()
  })

  it("draws an empty bar for a session with no route yet", () => {
    const { container } = mount(mountable({ route: [], files: [] }))
    expect((container.querySelector(".bg-accent") as HTMLElement).style.width).toBe("0%")
  })
})

describe("finishing", () => {
  it("won't send tasks until something was accepted", async () => {
    const { unmount } = mount(session())
    expect(screen.getByRole("button", { name: "guided.sendTasks" })).toBeDisabled()
    unmount()

    mount(session({ proposals: [proposal({ state: "converted_to_task", commentId: "c1" })] }))
    await userEvent.click(screen.getByRole("button", { name: "guided.sendTasks" }))
    expect(store.sendTasks).toHaveBeenCalledWith(ROOT, "s1")
  })

  it("closes the session, and can reset it entirely", async () => {
    mount(session())
    await userEvent.click(screen.getByRole("button", { name: "guided.close" }))
    expect(store.close).toHaveBeenCalledWith(ROOT, "s1")
    await userEvent.click(screen.getByRole("button", { name: "guided.reset" }))
    expect(store.discardSession).toHaveBeenCalledWith(ROOT, "s1")
  })

  it("offers no close on a finished session", () => {
    mount(session({ status: "done" }))
    expect(screen.queryByRole("button", { name: "guided.close" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "guided.reset" })).toBeInTheDocument()
  })
})
