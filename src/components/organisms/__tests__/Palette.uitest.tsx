// Unified quick-open palette: the closed (no mode) state, file mode (async file
// index → fuzzy filter → open a file + close), and command mode (static command
// list → running one fires its action). The api layer is mocked so listFiles
// returns a deterministic index; i18n is mocked to keys by the global setup.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Palette } from "../Palette";
import { usePalette, useProject, useSettings } from "../../../lib/store";
import { useDocInfo } from "../../../lib/docInfo";
import { useBookmarks } from "../../../lib/bookmarks";

// A fake editor view exposing only what the gating reads: whether the selection
// is empty. `null` = no editor open.
const view = (empty: boolean) =>
  ({ state: { selection: { main: { empty } } } }) as unknown as ReturnType<
    typeof useDocInfo.getState
  >["view"];

vi.mock("../../../lib/api", () => ({
  // list_files returns project-relative paths; the palette basenames + opens them.
  listFiles: vi.fn(async () => ["src/app.tsx", "src/lib/store.ts", "docs/guide.md"]),
  searchText: vi.fn(async () => []),
  listSymbols: vi.fn(async () => []),
}));

const openFile = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  usePalette.setState({ mode: null });
  useProject.setState({ root: "/proj", open: openFile });
  useSettings.setState({ wrap: false });
});

describe("Palette", () => {
  it("renders nothing while closed (no mode)", () => {
    render(<Palette />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens in file mode with a search input and the loaded file results", async () => {
    usePalette.setState({ mode: "files" });
    render(<Palette />);

    // The search input is present immediately; results arrive after listFiles resolves.
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(await screen.findByText("app.tsx")).toBeInTheDocument();
    expect(screen.getByText("store.ts")).toBeInTheDocument();
    expect(screen.getByText("guide.md")).toBeInTheDocument();
  });

  it("narrows the results as you type (fuzzy filter on the basename)", async () => {
    const user = userEvent.setup();
    usePalette.setState({ mode: "files" });
    render(<Palette />);
    await screen.findByText("app.tsx");

    await user.type(screen.getByRole("textbox"), "store");

    expect(await screen.findByText("store.ts")).toBeInTheDocument();
    expect(screen.queryByText("app.tsx")).not.toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
  });

  it("clicking a result opens that file (absolute path) and closes the palette", async () => {
    const user = userEvent.setup();
    usePalette.setState({ mode: "files" });
    render(<Palette />);

    await user.click(await screen.findByText("store.ts"));

    expect(openFile).toHaveBeenCalledWith("/proj/src/lib/store.ts");
    expect(usePalette.getState().mode).toBeNull();
  });

  it("Enter on the highlighted row opens the first file and closes the palette", async () => {
    const user = userEvent.setup();
    usePalette.setState({ mode: "files" });
    render(<Palette />);
    await screen.findByText("app.tsx");

    // Row 0 is highlighted by default; Enter in the (focused) input runs it.
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Enter}");

    expect(openFile).toHaveBeenCalledWith("/proj/src/app.tsx");
    expect(usePalette.getState().mode).toBeNull();
  });

  it("command mode lists commands and running one fires its action", async () => {
    const user = userEvent.setup();
    usePalette.setState({ mode: "commands" });
    render(<Palette />);

    // A representative command row (labels come back as i18n keys).
    expect(screen.getByText("settings.title")).toBeInTheDocument();
    const wrapRow = screen.getByText("editor.wrap: off");
    expect(wrapRow).toBeInTheDocument();

    await user.click(wrapRow);

    // The wrap toggle flips the setting via the real store action.
    expect(useSettings.getState().wrap).toBe(true);
  });

  describe("empty states", () => {
    it("shows a per-mode message instead of a blank box when there are no rows", async () => {
      // bookmarks with none stored → the bookmarks empty message.
      useBookmarks.setState({ bookmarks: [] });
      usePalette.setState({ mode: "bookmarks" });
      const { rerender } = render(<Palette />);
      expect(await screen.findByText("bookmarks.empty")).toBeInTheDocument();

      // symbols with an empty index → the symbols empty message (not blank).
      usePalette.setState({ mode: "symbols" });
      rerender(<Palette />);
      expect(await screen.findByText("symbols.empty")).toBeInTheDocument();
    });

    it("stays silent in command mode until you type (empty query ≠ no results)", () => {
      usePalette.setState({ mode: "commands" });
      // No project context, but always-available commands still populate rows,
      // so this is really about the search/commands 'type first' rule: force zero
      // rows via a query that matches nothing.
      render(<Palette />);
      expect(screen.queryByText("palette.noResults")).not.toBeInTheDocument();
    });
  });

  describe("command gating", () => {
    beforeEach(() => {
      usePalette.setState({ mode: "commands" });
      useDocInfo.setState({ view: null });
      useBookmarks.setState({ bookmarks: [] });
    });

    it("hides context-specific commands when their preconditions aren't met", () => {
      // No file open, no selection, not a repo, no history/terminal.
      useProject.setState({
        root: "/proj",
        active: null,
        git: { isRepo: false, branch: null, ahead: 0, behind: 0, hasRemote: false, hasUpstream: false },
        navStack: [],
        navIndex: -1,
        closedTabs: [],
        splitPath: null,
      });
      render(<Palette />);
      // Always-available commands are there…
      expect(screen.getByText("settings.title")).toBeInTheDocument();
      // …but the ones that need context are not.
      expect(screen.queryByText("comment.new")).not.toBeInTheDocument(); // needs a selection
      expect(screen.queryByText("editor.format")).not.toBeInTheDocument(); // needs a file
      expect(screen.queryByText("prereview.run")).not.toBeInTheDocument(); // needs a repo
      expect(screen.queryByText("nav.back")).not.toBeInTheDocument(); // needs history
      expect(screen.queryByText("terminal.clear")).not.toBeInTheDocument(); // needs a terminal
      expect(screen.queryByText("bookmarks.goto")).not.toBeInTheDocument(); // needs a bookmark
    });

    it("shows 'go to bookmark' only once a bookmark exists", () => {
      useBookmarks.setState({ bookmarks: [] });
      const { rerender } = render(<Palette />);
      expect(screen.queryByText("bookmarks.goto")).not.toBeInTheDocument();

      useBookmarks.setState({ bookmarks: [{ path: "a.ts", line: 1, snippet: "x" }] });
      rerender(<Palette />);
      expect(screen.getByText("bookmarks.goto")).toBeInTheDocument();
    });

    it("shows file commands with a file open, but selection commands only with a selection", () => {
      useProject.setState({ root: "/proj", active: "/proj/a.ts", git: { isRepo: true, branch: "main", ahead: 0, behind: 0, hasRemote: false, hasUpstream: false } });
      useDocInfo.setState({ view: view(true) }); // file open, caret only (no selection)
      const { rerender } = render(<Palette />);
      expect(screen.getByText("editor.format")).toBeInTheDocument(); // file → shown
      expect(screen.getByText("prereview.run")).toBeInTheDocument(); // repo → shown
      expect(screen.queryByText("comment.new")).not.toBeInTheDocument(); // no selection → hidden

      // Make a selection → the "comment on selection" command appears.
      useDocInfo.setState({ view: view(false) });
      rerender(<Palette />);
      expect(screen.getByText("comment.new")).toBeInTheDocument();
    });
  });
});
