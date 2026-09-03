// The Review Guide's empty state — what a review can run over (the diff, a
// branch, a PR, a free-text request) — and submitting a finished PR review back
// to the host. The forge and the session store are doubles; the panel is real.
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "@/lib/api"

const gitBranches = vi.hoisted(() =>
  vi.fn(async () => ({ local: ["main", "dev"], current: "dev", remote: [] })),
)
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  gitBranches,
}))
vi.mock("../../../lib/agents", () => ({
  dispatchToAgent: vi.fn(),
  sanitizePromptText: (s: string) => s.replace(/[`$\\]/g, " ").trim(),
}))
vi.mock("../../molecules/ResolveLoopBar", () => ({ ResolveLoopBar: () => null }))

import { GuidedReviewPanel } from "@/components/organisms/GuidedReviewPanel"
import { useComments } from "@/lib/comments"
import { useForge } from "@/lib/forge"
import { useGuidedReview } from "@/lib/guidedReview"
import { useProject, useSettings } from "@/lib/store"

const ROOT = "/repo"
const start = vi.fn(async () => null)
const openPr = vi.fn(async () => {})
const submit = vi.fn(async () => null as string | null)
const listPrs = vi.fn(async () => {})
const detect = vi.fn(async () => {})
const installCli = vi.fn(async () => {})

/** The forge as it looks with a working `gh` and two open PRs. */
const readyForge = {
  forge: { provider: "github", hasAdapter: true, cli: "gh", term: "PR" },
  cliPresent: true,
  prs: [
    { number: 7, title: "Add the search index" },
    { number: 9, title: "Fix the gutter" },
  ],
  loadingPrs: false,
  prsError: null as string | null,
  detect,
  listPrs,
  installCli,
  openPr,
  submit,
}

/** Pick a value from one of the panel's Ark selects, by its accessible name. */
async function choose(field: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: field }))
  await userEvent.click(await screen.findByRole("option", { name: option }))
}

beforeEach(() => {
  vi.clearAllMocks()
  useProject.setState({ root: ROOT, git: { isRepo: true } as never })
  useSettings.setState({ reviewObjective: "bug_risk" })
  useGuidedReview.setState({ sessions: [], currentId: null, busy: false, start })
  useComments.setState({ comments: [] })
  useForge.setState(readyForge as never)
  gitBranches.mockResolvedValue({ local: ["main", "dev"], current: "dev", remote: [] })
})

describe("choosing what to review", () => {
  it("offers the diff by default, and starts on it", async () => {
    render(<GuidedReviewPanel />)
    await userEvent.click(screen.getByRole("button", { name: "guided.startReview" }))
    expect(start).toHaveBeenCalledWith(ROOT, { kind: "diff" }, "bug_risk")
  })

  it("only offers the git-scoped sources inside a repository", async () => {
    useProject.setState({ git: { isRepo: false } as never })
    render(<GuidedReviewPanel />)
    await userEvent.click(screen.getByRole("combobox", { name: "guided.source" }))
    expect(screen.queryByRole("option", { name: "guided.src.branch" })).not.toBeInTheDocument()
    expect(screen.getByRole("option", { name: "guided.src.prompt" })).toBeInTheDocument()
  })

  it("loads the branches and defaults the base to main", async () => {
    render(<GuidedReviewPanel />)
    await choose("guided.source", "guided.src.branch")
    await waitFor(() => expect(gitBranches).toHaveBeenCalledWith(ROOT))
    await userEvent.click(screen.getByRole("button", { name: "guided.startReview" }))
    expect(start).toHaveBeenCalledWith(ROOT, { kind: "branch", base: "main" }, "bug_risk")
  })

  it("falls back to the current branch when there's no main or master", async () => {
    gitBranches.mockResolvedValue({ local: ["trunk"], current: "trunk", remote: [] })
    render(<GuidedReviewPanel />)
    await choose("guided.source", "guided.src.branch")
    await waitFor(() => expect(gitBranches).toHaveBeenCalled())
    await userEvent.click(screen.getByRole("button", { name: "guided.startReview" }))
    expect(start).toHaveBeenCalledWith(ROOT, { kind: "branch", base: "trunk" }, "bug_risk")
  })

  it("survives a repo whose branches can't be listed", async () => {
    gitBranches.mockRejectedValue(new Error("not a repo"))
    render(<GuidedReviewPanel />)
    await choose("guided.source", "guided.src.branch")
    await waitFor(() => expect(gitBranches).toHaveBeenCalled())
    expect(screen.getByRole("button", { name: "guided.startReview" })).toBeDisabled()
  })

  it("takes a free-text request, sanitised before it reaches the agent", async () => {
    render(<GuidedReviewPanel />)
    await choose("guided.source", "guided.src.prompt")
    const box = await screen.findByPlaceholderText("guided.reviewPromptPlaceholder")
    expect(screen.getByRole("button", { name: "guided.startReview" })).toBeDisabled()
    await userEvent.type(box, "look at `rm -rf`")
    await userEvent.click(screen.getByRole("button", { name: "guided.startReview" }))
    expect(start).toHaveBeenCalledWith(
      ROOT,
      { kind: "prompt", request: "look at  rm -rf" },
      "bug_risk",
    )
  })

  it("remembers the objective for next time", async () => {
    render(<GuidedReviewPanel />)
    await choose("guided.objective.label", "guided.obj.security")
    expect(useSettings.getState().reviewObjective).toBe("security")
    await userEvent.click(screen.getByRole("button", { name: "guided.startReview" }))
    expect(start).toHaveBeenCalledWith(ROOT, { kind: "diff" }, "security")
  })

  it("starts from the remembered objective", async () => {
    useSettings.setState({ reviewObjective: "performance" })
    render(<GuidedReviewPanel />)
    await userEvent.click(screen.getByRole("button", { name: "guided.startReview" }))
    expect(start).toHaveBeenCalledWith(ROOT, { kind: "diff" }, "performance")
  })

  it("ignores a stored objective that is no longer offered", async () => {
    useSettings.setState({ reviewObjective: "nonsense" })
    render(<GuidedReviewPanel />)
    await userEvent.click(screen.getByRole("button", { name: "guided.startReview" }))
    expect(start).toHaveBeenCalledWith(ROOT, { kind: "diff" }, "bug_risk")
  })
})

describe("picking a pull request", () => {
  const openPrList = async () => {
    render(<GuidedReviewPanel />)
    await choose("guided.source", "guided.src.pr")
  }

  it("lists the open PRs, and starts the review on the one picked", async () => {
    await openPrList()
    await waitFor(() => expect(detect).toHaveBeenCalledWith(ROOT))
    expect(listPrs).toHaveBeenCalledWith(ROOT)
    expect(screen.getByRole("button", { name: "guided.startReview" })).toBeDisabled()
    await userEvent.click(screen.getByText("Add the search index"))
    await userEvent.click(screen.getByRole("button", { name: "guided.startReview" }))
    expect(openPr).toHaveBeenCalledWith(ROOT, readyForge.prs[0], "bug_risk")
  })

  it("marks the selected one for assistive tech", async () => {
    await openPrList()
    const row = (await screen.findByText("Fix the gutter")).closest("button") as HTMLElement
    await userEvent.click(row)
    expect(row).toHaveAttribute("aria-pressed", "true")
  })

  it("says so when the project has no forge Reado can talk to", async () => {
    useForge.setState({ forge: { provider: "unknown", hasAdapter: false } } as never)
    await openPrList()
    expect(await screen.findByText("forge.pickNoForge")).toBeInTheDocument()
  })

  it("offers to install the CLI when it's missing", async () => {
    useForge.setState({ cliPresent: false } as never)
    await openPrList()
    await userEvent.click(await screen.findByRole("button", { name: "forge.install" }))
    expect(installCli).toHaveBeenCalled()
  })

  it("shows the list loading, empty, and failed", async () => {
    useForge.setState({ loadingPrs: true } as never)
    const { unmount } = render(<GuidedReviewPanel />)
    await choose("guided.source", "guided.src.pr")
    expect(await screen.findByText("forge.loading")).toBeInTheDocument()
    unmount()

    useForge.setState({ loadingPrs: false, prs: [] } as never)
    const second = render(<GuidedReviewPanel />)
    await choose("guided.source", "guided.src.pr")
    expect(await screen.findByText("forge.pickEmpty")).toBeInTheDocument()
    second.unmount()

    useForge.setState({ prsError: "gh: not authenticated" } as never)
    render(<GuidedReviewPanel />)
    await choose("guided.source", "guided.src.pr")
    expect(await screen.findByText("forge.listError")).toBeInTheDocument()
  })
})

describe("submitting a PR review back to the host", () => {
  const prSession = (over: Partial<Session> = {}): Session =>
    ({
      id: "s1",
      title: "PR #7",
      scope: { kind: "pr", pr: "#7" },
      status: "in_review",
      position: 0,
      route: [{ file: "src/a.ts", priority: 1, reason: "", suggestedReviewMode: "deep" }],
      files: [],
      proposals: [],
      summary: "looks good apart from the null path",
      createdAt: 0,
      updatedAt: 0,
      ...over,
    }) as Session

  const mount = (s: Session) => {
    useGuidedReview.setState({ sessions: [s], currentId: s.id, busy: false, start })
    return render(<GuidedReviewPanel />)
  }

  it("submits the summary as the review body, with the file's comments inline", async () => {
    useComments.setState({
      comments: [
        {
          id: "c1",
          anchor: { scope: "range", file: "src/a.ts", startLine: 12, endLine: 12 },
          messages: [{ author: "me", body: "this can be null", createdAt: 0 }],
        },
        // Pulled from the host — re-posting it would duplicate the thread.
        {
          id: "c2",
          externalId: "gh-1",
          anchor: { scope: "range", file: "src/a.ts", startLine: 3, endLine: 3 },
          messages: [{ author: "them", body: "already on the PR", createdAt: 0 }],
        },
        // Anchored to a file this review never covered.
        {
          id: "c3",
          anchor: { scope: "range", file: "src/elsewhere.ts", startLine: 1, endLine: 1 },
          messages: [{ author: "me", body: "off-scope", createdAt: 0 }],
        },
      ],
    } as unknown as Parameters<typeof useComments.setState>[0])
    mount(prSession())
    await userEvent.click(screen.getByRole("button", { name: "forge.approve" }))
    expect(submit).toHaveBeenCalledWith(ROOT, 7, "approve", "looks good apart from the null path", [
      { path: "src/a.ts", line: 12, body: "this can be null" },
    ])
    expect(await screen.findByText("forge.submitted")).toBeInTheDocument()
  })

  it("offers all three verdicts", async () => {
    const { unmount } = mount(prSession())
    await userEvent.click(screen.getByRole("button", { name: "forge.requestChanges" }))
    expect(submit).toHaveBeenLastCalledWith(ROOT, 7, "request_changes", expect.any(String), [])
    unmount()

    mount(prSession())
    await userEvent.click(screen.getByRole("button", { name: "forge.comment" }))
    expect(submit).toHaveBeenLastCalledWith(ROOT, 7, "comment", expect.any(String), [])
    // The third, approve, is asserted with its inline comments above.
  })

  it("surfaces a rejected submission instead of claiming success", async () => {
    submit.mockResolvedValue("gh: 403 Forbidden")
    mount(prSession())
    await userEvent.click(screen.getByRole("button", { name: "forge.comment" }))
    expect(await screen.findByText("gh: 403 Forbidden")).toBeInTheDocument()
    expect(screen.queryByText("forge.submitted")).not.toBeInTheDocument()
  })

  it("won't submit without a real PR number", async () => {
    mount(prSession({ scope: { kind: "pr" } as Session["scope"] }))
    expect(screen.getByRole("button", { name: "forge.approve" })).toBeDisabled()
    expect(screen.getByText("forge.noNumber")).toBeInTheDocument()
  })

  it("shows the send-tasks button instead for a non-PR session", () => {
    mount(prSession({ scope: { kind: "diff" } as Session["scope"] }))
    expect(screen.queryByRole("button", { name: "forge.approve" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "guided.sendTasks" })).toBeInTheDocument()
  })
})

describe("while the agent is working", () => {
  it("says so in the header", () => {
    const { unmount } = render(<GuidedReviewPanel />)
    expect(screen.queryByText("guided.busy")).not.toBeInTheDocument()
    unmount()
    useGuidedReview.setState({ busy: true })
    render(<GuidedReviewPanel />)
    expect(screen.getByText("guided.busy")).toBeInTheDocument()
  })
})
