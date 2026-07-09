// The bottom status bar: file/cursor, indentation, encoding, line-ending and
// language pickers, the git branch switcher, comment count and the
// Anywhere/terminal toggles. Stores are real; the Tauri edge is stubbed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({
  anywhereStatus: vi.fn(async () => null as unknown),
  gitBranches: vi.fn(async () => ({
    current: "main",
    local: ["main", "dev"],
    remote: ["origin/main"],
  })),
  gitCheckout: vi.fn(async () => {}),
  gitInfo: vi.fn(async () => ({ isRepo: true, branch: "dev", ahead: 0, behind: 0, hasRemote: false, hasUpstream: false })),
}));
vi.mock("../../../lib/api", () => api);

// The editor-command edges the status bar drives (go to line, convert line
// endings) are no-ops without a live CodeMirror view, so we spy on them at the
// module boundary while keeping the real `useDocInfo` store the other tests use.
const docEdge = vi.hoisted(() => ({ goToLine: vi.fn(), convertEol: vi.fn() }));
vi.mock("../../../lib/docInfo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/docInfo")>();
  return { ...actual, goToLine: docEdge.goToLine, convertEol: docEdge.convertEol };
});

import { StatusBar } from "../StatusBar";
import { useProject, useCursor, usePalette } from "../../../lib/store";
import { useComments } from "../../../lib/comments";
import { useDocInfo } from "../../../lib/docInfo";
import { useTerminals } from "../../../lib/terminals";

function setActiveFile() {
  useProject.setState({
    root: "/repo",
    active: "/repo/src/app/main.ts",
    git: { isRepo: true, branch: "main", ahead: 0, behind: 0, hasRemote: false, hasUpstream: false },
  });
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockClear());
  Object.values(docEdge).forEach((f) => f.mockClear());
  useProject.setState({
    root: "/repo",
    active: null,
    git: { isRepo: false, branch: null, ahead: 0, behind: 0, hasRemote: false, hasUpstream: false },
  });
  useCursor.setState({ line: 1, col: 1 });
  useComments.setState({ comments: [] });
  useDocInfo.setState({
    eol: "LF",
    indentKind: "spaces",
    indentSize: 2,
    language: "",
    languageOverride: null,
  });
  usePalette.setState({ anywhereOpen: false });
  useTerminals.setState({ open: false });
});

describe("StatusBar with no active file", () => {
  it("shows the no-file placeholder and the not-git marker", () => {
    render(<StatusBar />);
    expect(screen.getByText("status.noFile")).toBeInTheDocument();
    expect(screen.getByText("status.notGit")).toBeInTheDocument();
    expect(screen.getByText("status.comments")).toBeInTheDocument();
    expect(screen.getByText("status.agentIdle")).toBeInTheDocument();
  });

  it("queries the Anywhere status on mount", () => {
    render(<StatusBar />);
    expect(api.anywhereStatus).toHaveBeenCalled();
  });

  it("opens the Anywhere dialog from the device button", async () => {
    render(<StatusBar />);
    await userEvent.click(screen.getByRole("button", { name: /anywhere\.title/ }));
    expect(usePalette.getState().anywhereOpen).toBe(true);
  });

  it("toggles the integrated terminal", async () => {
    render(<StatusBar />);
    await userEvent.click(screen.getByRole("button", { name: "terminal.toggle" }));
    expect(useTerminals.getState().open).toBe(true);
  });
});

describe("StatusBar with an active file", () => {
  beforeEach(setActiveFile);

  it("shows the relative path and cursor position", () => {
    useCursor.setState({ line: 12, col: 5 });
    render(<StatusBar />);
    expect(screen.getByText("src/app/main.ts")).toBeInTheDocument();
    expect(screen.getByText(/Ln 12, Col 5/)).toBeInTheDocument();
  });

  it("opens the go-to-line popover and submits on Enter", async () => {
    render(<StatusBar />);
    await userEvent.click(screen.getByTitle("status.goToLine"));
    const input = screen.getByPlaceholderText("status.goToLinePlaceholder");
    await userEvent.type(input, "42{Enter}");
    // Enter parses the field and jumps the editor to that 1-based line.
    expect(docEdge.goToLine).toHaveBeenCalledWith(42);
    // ...and the popover closes after submit.
    expect(screen.queryByPlaceholderText("status.goToLinePlaceholder")).not.toBeInTheDocument();
  });

  it("changes the indentation kind from the indent popover", async () => {
    render(<StatusBar />);
    await userEvent.click(screen.getByTitle("status.indent"));
    await userEvent.click(screen.getByRole("button", { name: "status.useTabs" }));
    expect(useDocInfo.getState().indentKind).toBe("tabs");
  });

  it("changes the indentation size from the indent popover", async () => {
    render(<StatusBar />);
    await userEvent.click(screen.getByTitle("status.indent"));
    await userEvent.click(screen.getByRole("button", { name: "4" }));
    expect(useDocInfo.getState().indentSize).toBe(4);
  });

  it("converts the line endings when a different option is chosen", async () => {
    render(<StatusBar />);
    await userEvent.click(screen.getByTitle("status.eol"));
    // "CRLF" only exists as a popover option (the toggle shows the current "LF").
    expect(screen.getByRole("button", { name: "CRLF" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "CRLF" }));
    // Picking a non-current option rewrites the file with those endings...
    expect(docEdge.convertEol).toHaveBeenCalledWith("CRLF");
    // ...and the popover closes.
    expect(screen.queryByRole("button", { name: "CRLF" })).not.toBeInTheDocument();
  });

  it("shows the language picker and changes the mode", async () => {
    useDocInfo.setState({ language: "TypeScript" });
    render(<StatusBar />);
    await userEvent.click(screen.getByTitle("status.language"));
    await userEvent.click(screen.getByRole("button", { name: "Rust" }));
    expect(useDocInfo.getState().language).toBe("Rust");
    expect(useDocInfo.getState().languageOverride).toBe("Rust");
  });

  it("hides the language picker when no language is known", () => {
    useDocInfo.setState({ language: "" });
    render(<StatusBar />);
    expect(screen.queryByTitle("status.language")).not.toBeInTheDocument();
  });

  it("closes an open popover on Escape", async () => {
    render(<StatusBar />);
    await userEvent.click(screen.getByTitle("status.eol"));
    expect(screen.getByRole("button", { name: "CRLF" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "CRLF" })).not.toBeInTheDocument();
  });
});

describe("StatusBar branch switcher", () => {
  beforeEach(setActiveFile);

  it("opens the branch menu and lists local + remote branches", async () => {
    render(<StatusBar />);
    await userEvent.click(screen.getByTitle("status.branch"));
    expect(api.gitBranches).toHaveBeenCalledWith("/repo");
    expect(await screen.findByRole("button", { name: "dev" })).toBeInTheDocument();
    expect(screen.getByText("branch.local")).toBeInTheDocument();
    expect(screen.getByText("branch.remote")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "origin/main" })).toBeInTheDocument();
  });

  it("checks out a chosen local branch and refreshes git info", async () => {
    render(<StatusBar />);
    await userEvent.click(screen.getByTitle("status.branch"));
    await userEvent.click(await screen.findByRole("button", { name: "dev" }));
    expect(api.gitCheckout).toHaveBeenCalledWith("/repo", "dev", false);
    await vi.waitFor(() => expect(api.gitInfo).toHaveBeenCalledWith("/repo"));
  });

  it("surfaces a checkout error inside the open menu", async () => {
    api.gitCheckout.mockRejectedValueOnce(new Error("dirty tree"));
    render(<StatusBar />);
    await userEvent.click(screen.getByTitle("status.branch"));
    await userEvent.click(await screen.findByRole("button", { name: "dev" }));
    expect(await screen.findByText(/dirty tree/)).toBeInTheDocument();
  });
});
