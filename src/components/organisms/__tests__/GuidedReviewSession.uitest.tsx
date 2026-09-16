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
  cover: vi.fn(async () => {}),
  acceptRouteChange: vi.fn(async () => {}),
  discardRouteChange: vi.fn(async () => {}),
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
  useGuidedReview.setState({ sessions: [s], currentId: s.id, busy: null, ...store })
  return render(<GuidedReviewPanel />)
}

/** Open an overflow menu — the current file's, or the `nth` proposal's. Ark's
 *  trigger listens on pointerdown, so a bare `.click()` would not open it. */
async function openMenu(nth = 0) {
  const triggers = screen.getAllByRole("button", { name: "guided.moreActions" })
  await userEvent.click(triggers[nth])
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

  it("keeps the two moves that advance the review in reach", async () => {
    mount(session())
    await userEvent.click(screen.getByRole("button", { name: "guided.action.reviewed" }))
    expect(store.finishFile).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts", "reviewed")
    await userEvent.click(screen.getByRole("button", { name: "guided.action.skip" }))
    expect(store.finishFile).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts", "skipped")
  })

  it("gives the cluster one height and one rhythm", async () => {
    // Four controls at four sizes in one spot read as debris. The primary is
    // taller on purpose; the row under it is one row, not three chips.
    mount(session())
    const cta = screen.getByRole("button", { name: "guided.action.review" })
    const reviewed = screen.getByRole("button", { name: "guided.action.reviewed" })
    const skip = screen.getByRole("button", { name: "guided.action.skip" })
    const more = screen.getAllByRole("button", { name: "guided.moreActions" })[0]
    expect(cta.className).toContain("h-9")
    for (const el of [reviewed, skip, more]) expect(el.className).toContain("h-8")
    // The two labelled chips share the row rather than hugging their labels.
    expect(reviewed.className).toContain("flex-1")
    expect(skip.className).toContain("flex-1")
    expect(more.className).toContain("w-8")
  })

  it("keeps the occasional passes one press deeper", async () => {
    // Four chips in one row cost the two that matter their prominence.
    mount(session())
    expect(screen.queryByRole("button", { name: "guided.action.widen" })).not.toBeInTheDocument()
    await openMenu()
    await userEvent.click(await screen.findByRole("menuitem", { name: "guided.action.respond" }))
    expect(store.respond).toHaveBeenCalledWith(ROOT, "s1", "src/a.ts")
    await openMenu()
    await userEvent.click(await screen.findByRole("menuitem", { name: "guided.action.widen" }))
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
    await userEvent.click(screen.getByTitle("src/a.ts:12"))
    expect(useProject.getState().open).toHaveBeenCalledWith("/repo/src/a.ts", 12)
  })

  it("puts the two answers in reach and the rest one press deeper", async () => {
    // Approve and discard are the whole loop; note / edit / false-positive are
    // the exceptions, and five equal chips made the frequent case a scan.
    mount(session({ proposals: [proposal()] }))
    expect(screen.getByRole("button", { name: "guided.approve" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "guided.discard" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "guided.approveNote" })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "guided.approve" }))
    expect(store.accept).toHaveBeenCalledWith(ROOT, "s1", "p1")
  })

  it("approves it as a note from the overflow menu", async () => {
    mount(session({ proposals: [proposal()] }))
    await openMenu(1)
    await userEvent.click(await screen.findByRole("menuitem", { name: "guided.approveNote" }))
    expect(store.accept).toHaveBeenLastCalledWith(ROOT, "s1", "p1", true)
  })

  it("discards it, or records it as a false positive", async () => {
    mount(session({ proposals: [proposal()] }))
    await userEvent.click(screen.getByRole("button", { name: "guided.discard" }))
    expect(store.discard).toHaveBeenCalledWith(ROOT, "s1", "p1")
    await openMenu(1)
    await userEvent.click(await screen.findByRole("menuitem", { name: "guided.falsePositive" }))
    expect(store.falsePositive).toHaveBeenCalledWith(ROOT, "s1", "p1", "guided.fpNote")
  })

  it("edits the wording before accepting it", async () => {
    mount(session({ proposals: [proposal()] }))
    await openMenu(1)
    await userEvent.click(await screen.findByRole("menuitem", { name: "guided.edit" }))
    const box = screen.getByRole("textbox")
    await userEvent.clear(box)
    await userEvent.type(box, "sharper wording")
    await userEvent.click(screen.getByRole("button", { name: "guided.save" }))
    expect(store.edit).toHaveBeenCalledWith(ROOT, "s1", "p1", "sharper wording")
  })

  it("cancels an untouched edit in one press", async () => {
    mount(session({ proposals: [proposal()] }))
    await openMenu(1)
    await userEvent.click(await screen.findByRole("menuitem", { name: "guided.edit" }))
    await userEvent.click(screen.getByRole("button", { name: "guided.cancel" }))
    expect(store.edit).not.toHaveBeenCalled()
    expect(screen.getByText("this can be null here")).toBeInTheDocument()
  })

  it("asks before throwing away wording you typed", async () => {
    // Cancel used to drop the draft silently, which is the one case where the
    // press costs something.
    mount(session({ proposals: [proposal()] }))
    await openMenu(1)
    await userEvent.click(await screen.findByRole("menuitem", { name: "guided.edit" }))
    await userEvent.type(screen.getByRole("textbox"), " and more")
    await userEvent.click(screen.getByRole("button", { name: "guided.cancel" }))
    // Still editing: the first press only armed the question.
    expect(screen.getByRole("textbox")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "guided.cancelConfirm" }))
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
    // Discarding the lot is N irreversible disposals from one click, so it asks.
    await userEvent.click(screen.getByRole("button", { name: "guided.discardAll" }))
    expect(store.discard).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "guided.discardAllConfirm" }))
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

  it("closes the session in one press, and asks twice before deleting it", async () => {
    // Close is reversible, delete is not, and they used to look the same.
    mount(session())
    await userEvent.click(screen.getByRole("button", { name: "guided.close" }))
    expect(store.close).toHaveBeenCalledWith(ROOT, "s1")
    await userEvent.click(screen.getByRole("button", { name: "guided.reset" }))
    expect(store.discardSession).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "guided.resetConfirm" }))
    expect(store.discardSession).toHaveBeenCalledWith(ROOT, "s1")
  })

  it("offers no close on a finished session", () => {
    mount(session({ status: "done" }))
    expect(screen.queryByRole("button", { name: "guided.close" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "guided.reset" })).toBeInTheDocument()
  })
})

describe("the coverage gap", () => {
  /** A diff session whose scope Reado enumerated, and a route that misses some. */
  const missing = (over: Partial<Session> = {}) =>
    session({
      expectedFiles: ["src/a.ts", "src/b.ts", "src/new.test.ts", "vendor/x.js"],
      ...over,
    })

  it("names the files the scope has and the route left out", () => {
    // The route holds a.ts and b.ts; the untracked test file and the vendor file
    // are in the diff and nowhere in the plan. Each path is written directory-
    // quiet + name-legible, so the text is split across two elements.
    mount(missing())
    expect(screen.getByText("guided.uncovered")).toBeInTheDocument()
    const gap = screen.getAllByTitle("guided.openFile").map((b) => b.textContent)
    expect(gap).toContain("src/new.test.ts")
    expect(gap).toContain("vendor/x.js")
  })

  it("opens an uncovered file — the first question is always which one", async () => {
    mount(missing())
    // Both lists write the path the same way now, so the first uncovered row is
    // found by its text rather than by which list it is in.
    const row = screen
      .getAllByTitle("guided.openFile")
      .find((b) => b.textContent === "src/new.test.ts")
    await userEvent.click(row as HTMLElement)
    expect(store.focusFile).toHaveBeenCalledWith(ROOT, "s1", "src/new.test.ts")
  })

  it("draws the plan and the unplanned as two separate bars", () => {
    // One stacked bar made the uncovered share read as a kind of progress. It
    // is the opposite — work that was never scheduled — so it is its own bar,
    // sized against the plan's and set apart from it.
    mount(missing({ files: [{ file: "src/a.ts", state: "reviewed" }] }))
    const bar = screen.getByRole("progressbar")
    expect(bar).toHaveAttribute("aria-valuemax", "2")
    expect(bar).toHaveAttribute("aria-valuenow", "1")
    // Visible track: it used to be `bg-surface` on a `bg-surface` parent, which
    // painted nothing at all at 0%.
    expect(bar.className).toContain("border-line")
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("50%")

    // 2 routed files against 2 uncovered → the second bar is the same width.
    // It is decorative: the line above says it in words, in the same colour.
    const gap = screen.getByTestId("uncovered-bar")
    expect(bar.style.flexGrow).toBe("2")
    expect(gap.style.flexGrow).toBe("2")
    expect(gap).toHaveAttribute("aria-hidden", "true")
  })

  it("has no second bar when nothing is missing", () => {
    mount(session())
    expect(screen.getByRole("progressbar")).toBeInTheDocument()
    expect(screen.queryByTestId("uncovered-bar")).not.toBeInTheDocument()
  })

  it("survives a plan that came back empty — the whole change is the gap", () => {
    // The gap used to live inside the route section, so a route of zero files
    // hid the fact that nothing at all was going to be reviewed.
    mount(missing({ route: [], files: [] }))
    expect(screen.getByText("guided.uncovered")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "guided.uncoveredAsk" })).toBeInTheDocument()
  })

  it("lists only as many missing files as are worth reading, and counts the rest", () => {
    const many = Array.from({ length: 12 }, (_, i) => `src/f${i}.ts`)
    mount(missing({ expectedFiles: many, route: [] }))
    expect(screen.getAllByTitle("guided.openFile")).toHaveLength(8)
    expect(screen.getByText("guided.uncoveredMore")).toBeInTheDocument()
  })

  it("says so next to the progress, where 'done' would otherwise be a lie", () => {
    // Progress counts the route. A route covering 1 of 3 changed files reaches
    // "1/1 reviewed" with two thirds of the change never opened.
    mount(missing())
    expect(screen.getByText(/guided\.outside/)).toBeInTheDocument()
  })

  it("asks the agent about exactly the files that are missing", async () => {
    mount(missing())
    await userEvent.click(screen.getByRole("button", { name: "guided.uncoveredAsk" }))
    expect(store.cover).toHaveBeenCalledWith(ROOT, "s1", ["src/new.test.ts", "vendor/x.js"])
  })

  it("says nothing once every file is routed or deliberately left out", () => {
    mount(
      missing({
        files: [
          { file: "src/new.test.ts", state: "out_of_scope" },
          { file: "vendor/x.js", state: "skipped" },
        ],
      }),
    )
    expect(screen.queryByText("guided.uncovered")).not.toBeInTheDocument()
  })

  it("claims no gap for a scope Reado could not enumerate", () => {
    // A PR lives in git refs: there is no working-tree file set to compare to.
    mount(session({ scope: { kind: "pr", pr: "#7" }, expectedFiles: [] }))
    expect(screen.queryByText("guided.uncovered")).not.toBeInTheDocument()
  })
})

describe("a proposed route change", () => {
  const proposed = (over: Partial<Session> = {}) =>
    session({
      routeChange: {
        id: "rc1",
        reason: "src/c.ts is the only caller of the changed function",
        author: "agent",
        agent: "claude-code",
        createdAt: 0,
        route: [
          { file: "src/a.ts", priority: 1, reason: "", suggestedReviewMode: "deep" },
          { file: "src/b.ts", priority: 2, reason: "", suggestedReviewMode: "quick" },
          { file: "src/c.ts", priority: 3, reason: "caller", suggestedReviewMode: "normal" },
        ],
      },
      ...over,
    })

  it("says what the box is, next to the buttons it qualifies", () => {
    // The agent's reason says what it wants. Nothing said what a route is, or
    // what either button would do — which is the whole question a first-timer
    // has in front of two unfamiliar verbs.
    mount(proposed())
    const explain = screen.getByText("guided.routeChangeExplain")
    expect(explain).toBeInTheDocument()
    const accept = screen.getByRole("button", { name: "guided.routeChangeAccept" })
    expect(explain.compareDocumentPosition(accept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("shows the agent's reason and which files it would add", () => {
    mount(proposed())
    expect(screen.getByText("guided.routeChange")).toBeInTheDocument()
    expect(
      screen.getByText("src/c.ts is the only caller of the changed function"),
    ).toBeInTheDocument()
    expect(screen.getByText(/guided\.routeChangeAdds: src\/c\.ts/)).toBeInTheDocument()
  })

  it("says out loud which files it would drop", () => {
    // A count alone hides the expensive half: accepting can remove the file you
    // already have findings on, and that is the decision you would want back.
    mount(
      proposed({
        routeChange: {
          id: "rc2",
          reason: "config is the only risk here",
          author: "agent",
          createdAt: 0,
          route: [{ file: "src/c.ts", priority: 1, reason: "", suggestedReviewMode: "quick" }],
        },
      }),
    )
    expect(screen.getByText(/guided\.routeChangeDrops: src\/a\.ts, src\/b\.ts/)).toBeInTheDocument()
  })

  it("leaves the running route alone until the human answers", () => {
    // The point of the proposal: b.ts is still the second stop, and nothing in
    // the route queue moved on its own.
    mount(proposed())
    expect(screen.getByRole("button", { name: "guided.action.review" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "c.ts" })).not.toBeInTheDocument()
  })

  it("accepts a pure addition in one press", async () => {
    mount(proposed())
    await userEvent.click(screen.getByRole("button", { name: "guided.routeChangeAccept" }))
    expect(store.acceptRouteChange).toHaveBeenCalledWith(ROOT, "s1")
  })

  it("prices what it would drop, and asks again when that costs findings", async () => {
    // Dropping a file you already have findings on is the decision you would
    // most want back — and there is no undo behind it.
    mount(
      proposed({
        proposals: [proposal({ file: "src/a.ts" }), proposal({ id: "p2", file: "src/a.ts" })],
        routeChange: {
          id: "rc3",
          reason: "config is the only risk here",
          author: "agent",
          createdAt: 0,
          route: [{ file: "src/b.ts", priority: 1, reason: "", suggestedReviewMode: "quick" }],
        },
      }),
    )
    expect(screen.getByText(/guided\.findings/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "guided.routeChangeAccept" }))
    expect(store.acceptRouteChange).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "guided.routeChangeConfirm" }))
    expect(store.acceptRouteChange).toHaveBeenCalledWith(ROOT, "s1")
  })

  it("discards it", async () => {
    mount(proposed())
    await userEvent.click(screen.getByRole("button", { name: "guided.routeChangeDiscard" }))
    expect(store.discardRouteChange).toHaveBeenCalledWith(ROOT, "s1")
  })

  it("is absent when the agent has proposed nothing", () => {
    mount(session())
    expect(screen.queryByText("guided.routeChange")).not.toBeInTheDocument()
  })
})
