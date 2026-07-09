// UI test: the Source Control panel renders the working-tree status (staged /
// unstaged / conflicted), stages files, commits a message, and drives the
// repo-level fetch/pull/push toolbar. Every git edge is mocked, so no real repo
// is touched and the ~4s status poll is harmless (real timers, findBy).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GitChange, StashEntry } from "../../../lib/api";

// Deterministic spies for the git surface. gitStatus resolves immediately so the
// initial load (and the interval poll) return a known shape; every mutation
// resolves so `act`/`runRepo`'s follow-up refresh() is a no-op re-fetch.
const gitStatus = vi.fn<(root: string) => Promise<GitChange[]>>();
const gitStashList = vi.fn<(root: string) => Promise<StashEntry[]>>();
const gitStage = vi.fn<(root: string, path: string) => Promise<void>>();
const gitUnstage = vi.fn<(root: string, path: string) => Promise<void>>();
const gitStageAll = vi.fn<(root: string) => Promise<void>>();
const gitCommit = vi.fn<(root: string, message: string) => Promise<void>>();
const gitFetch = vi.fn<(root: string) => Promise<void>>();
const gitPull = vi.fn<(root: string) => Promise<void>>();
const gitPush = vi.fn<(root: string) => Promise<void>>();
const gitSync = vi.fn<(root: string) => Promise<{ conflicted: string[] }>>();
// gitInfo is called by the panel's post-op refresh; resolve it so refreshInfo
// doesn't hit the real Tauri bridge.
const gitInfo = vi.fn(async () => useProject.getState().git);

vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  gitStatus: (root: string) => gitStatus(root),
  gitStashList: (root: string) => gitStashList(root),
  gitStage: (root: string, path: string) => gitStage(root, path),
  gitUnstage: (root: string, path: string) => gitUnstage(root, path),
  gitStageAll: (root: string) => gitStageAll(root),
  gitCommit: (root: string, message: string) => gitCommit(root, message),
  gitFetch: (root: string) => gitFetch(root),
  gitPull: (root: string) => gitPull(root),
  gitPush: (root: string) => gitPush(root),
  gitSync: (root: string) => gitSync(root),
  gitInfo: () => gitInfo(),
}));

import { GitPanel } from "../GitPanel";
import { useProject } from "../../../lib/store";
import { useNotice } from "../../../lib/notice";

const ROOT = "/repo";

const CHANGES: GitChange[] = [
  { path: "src/staged.ts", status: "added", staged: true },
  { path: "src/unstaged.ts", status: "modified", staged: false },
  { path: "src/conflict.ts", status: "conflicted", staged: false },
];

beforeEach(() => {
  gitStatus.mockReset().mockResolvedValue(CHANGES);
  gitStashList.mockReset().mockResolvedValue([]);
  gitStage.mockReset().mockResolvedValue(undefined);
  gitUnstage.mockReset().mockResolvedValue(undefined);
  gitStageAll.mockReset().mockResolvedValue(undefined);
  gitCommit.mockReset().mockResolvedValue(undefined);
  gitFetch.mockReset().mockResolvedValue(undefined);
  gitPull.mockReset().mockResolvedValue(undefined);
  gitPush.mockReset().mockResolvedValue(undefined);
  gitSync.mockReset().mockResolvedValue({ conflicted: [] });
  useNotice.setState({ notices: [] });
  useProject.setState({ root: ROOT, git: { isRepo: true, branch: "main", ahead: 0, behind: 0, hasRemote: true, hasUpstream: false } });
});

// Grab the <li> row for a given filename (basename is rendered as its own span).
// Async: the file list arrives from the initial `gitStatus` poll after mount.
const rowFor = async (name: string) => {
  const li = (await screen.findByText(name)).closest("li");
  if (!li) throw new Error(`no row for ${name}`);
  return li as HTMLElement;
};

describe("GitPanel", () => {
  it("renders staged and unstaged file rows from the mocked status", async () => {
    render(<GitPanel />);

    // Initial poll load (real timers → findBy).
    await screen.findByText("staged.ts");
    expect(screen.getByText("unstaged.ts")).toBeInTheDocument();
    expect(gitStatus).toHaveBeenCalledWith(ROOT);

    // Groups: staged count 1, unstaged (changes) count 2.
    expect(screen.getByText("git.staged")).toBeInTheDocument();
    expect(screen.getByText("git.changes")).toBeInTheDocument();
  });

  it("shows the conflicted file with its '!' badge in the changes group", async () => {
    render(<GitPanel />);

    const row = await rowFor("conflict.ts");
    // conflicted → letter "!" (STATUS map); an unstaged change, so it lives in
    // the changes group and carries a stage affordance.
    expect(within(row).getByText("!")).toBeInTheDocument();
    expect(within(row).getByLabelText("git.stage")).toBeInTheDocument();
  });

  it("stages a file via gitStage(root, path)", async () => {
    render(<GitPanel />);

    const row = await rowFor("unstaged.ts");
    await userEvent.click(within(row).getByLabelText("git.stage"));

    expect(gitStage).toHaveBeenCalledWith(ROOT, "src/unstaged.ts");
  });

  it("commits only when a message is typed and something is staged", async () => {
    render(<GitPanel />);
    await screen.findByText("staged.ts");

    const commitBtn = screen.getByRole("button", { name: "git.commit" });
    // Empty message → disabled even though a file is staged.
    expect(commitBtn).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText("git.commitPlaceholder"),
      "fix things",
    );
    expect(commitBtn).toBeEnabled();

    await userEvent.click(commitBtn);
    expect(gitCommit).toHaveBeenCalledWith(ROOT, "fix things");
    // Message clears after a successful commit.
    await waitFor(() =>
      expect(screen.getByPlaceholderText("git.commitPlaceholder")).toHaveValue(""),
    );
  });

  it("drives the repo toolbar: fetch, pull, push", async () => {
    render(<GitPanel />);
    await screen.findByLabelText("git.fetch");

    // Each op flips `busy` (disabling the toolbar) until it resolves, so wait for
    // the buttons to re-enable between clicks. `ToolButton` is a component defined
    // inside GitPanel, so it remounts on each `busy` change — hence fireEvent on a
    // freshly-queried node each time (a held reference / userEvent's async delay
    // can land the click on a detached button).
    fireEvent.click(screen.getByLabelText("git.fetch"));
    await waitFor(() => expect(gitFetch).toHaveBeenCalledWith(ROOT));
    await waitFor(() => expect(screen.getByLabelText("git.pull")).toBeEnabled());

    fireEvent.click(screen.getByLabelText("git.pull"));
    await waitFor(() => expect(gitPull).toHaveBeenCalledWith(ROOT));
    await waitFor(() => expect(screen.getByLabelText("git.push")).toBeEnabled());

    fireEvent.click(screen.getByLabelText("git.push"));
    await waitFor(() => expect(gitPush).toHaveBeenCalledWith(ROOT));
  });

  it("gates fetch/pull/push/sync on what the remote state allows", async () => {
    // No remote → nothing to fetch/pull/push/sync.
    useProject.setState({
      git: { isRepo: true, branch: "main", ahead: 0, behind: 0, hasRemote: false, hasUpstream: false },
    });
    render(<GitPanel />);
    await screen.findByLabelText("git.fetch");
    expect(screen.getByLabelText("git.fetch")).toBeDisabled();
    expect(screen.getByLabelText("git.pull")).toBeDisabled();
    expect(screen.getByLabelText("git.push")).toBeDisabled();
    expect(screen.getByRole("button", { name: /git\.sync/ })).toBeDisabled();

    // Tracking branch, nothing ahead → push is dead (nothing to push), but sync
    // is live (it can still pull) and shows the behind count.
    useProject.setState({
      git: { isRepo: true, branch: "main", ahead: 0, behind: 2, hasRemote: true, hasUpstream: true },
    });
    await waitFor(() => expect(screen.getByLabelText("git.push")).toBeDisabled());
    expect(screen.getByLabelText("git.pull")).toBeEnabled();
    expect(screen.getByRole("button", { name: /git\.sync.*↓2/ })).toBeEnabled();

    // Commits to push → push re-enables.
    useProject.setState({
      git: { isRepo: true, branch: "main", ahead: 3, behind: 0, hasRemote: true, hasUpstream: true },
    });
    await waitFor(() => expect(screen.getByLabelText("git.push")).toBeEnabled());
  });

  it("syncs (pull+push) and reports conflicts left to resolve", async () => {
    gitSync.mockResolvedValue({ conflicted: ["src/conflict.ts", "src/other.ts"] });
    useProject.setState({
      git: { isRepo: true, branch: "main", ahead: 1, behind: 1, hasRemote: true, hasUpstream: true },
    });
    render(<GitPanel />);
    await screen.findByRole("button", { name: /git\.sync/ });

    // Query fresh at click time: ToolButton remounts on the status-poll re-render,
    // so a held reference can be detached.
    fireEvent.click(screen.getByRole("button", { name: /git\.sync/ }));
    await waitFor(() => expect(gitSync).toHaveBeenCalledWith(ROOT));
    // A conflict outcome surfaces a notice (the files also show in the list).
    await waitFor(() =>
      expect(useNotice.getState().notices.some((n) => n.text.includes("git.syncConflicts"))).toBe(true),
    );
  });
});
