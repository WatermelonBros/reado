// UI test: the Search panel runs a full-text project search, renders the matches
// grouped by file (text + relative path:line), opens a result on click, reflects
// the case/word/regex toggles (and re-runs with them), and drives the replace
// flow. Only the two backend edges (searchText / replaceText) are mocked; the
// panel's own debounce and state are real. Real timers + findBy cover the async.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { searchText, replaceText } = vi.hoisted(() => ({
  searchText: vi.fn(),
  replaceText: vi.fn(),
}));
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  searchText,
  replaceText,
}));

import { SearchPanel } from "../SearchPanel";
import { useProject, useWorkspace } from "../../../lib/store";
import type { SearchMatch } from "../../../lib/api";

const ROOT = "/repo";

// Two files, three matches — deterministic, so the grouped list is stable.
const MATCHES: SearchMatch[] = [
  { path: "/repo/src/a.ts", line: 12, column: 3, text: "  const foo = 1;" },
  { path: "/repo/src/a.ts", line: 40, column: 1, text: "foo();" },
  { path: "/repo/src/b.ts", line: 7, column: 2, text: "  return foo;" },
];

function seed() {
  const open = vi.fn();
  useProject.setState({ root: ROOT, open });
  return { open };
}

beforeEach(() => {
  searchText.mockReset().mockResolvedValue(MATCHES);
  replaceText.mockReset().mockResolvedValue(3);
  // A stale query would auto-run a search on mount; start each test clean.
  useWorkspace.setState({ searchQuery: "", pendingSearch: null });
});

describe("SearchPanel", () => {
  it("typing a query runs searchText and renders the grouped results", async () => {
    seed();
    render(<SearchPanel />);
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo");

    // Each match renders its trimmed text plus a relative path:line line.
    expect(await screen.findByText("const foo = 1;")).toBeInTheDocument();
    expect(screen.getByText("foo();")).toBeInTheDocument();
    expect(screen.getByText("return foo;")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:12")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:40")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts:7")).toBeInTheDocument();

    expect(searchText).toHaveBeenCalledWith(ROOT, "foo", {
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    });
  });

  it("clicking a result opens it at its path and line", async () => {
    const { open } = seed();
    render(<SearchPanel />);
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo");

    await userEvent.click(await screen.findByText("const foo = 1;"));
    expect(open).toHaveBeenCalledWith("/repo/src/a.ts", 12);
  });

  it("toggling case sensitivity reflects aria-pressed and re-runs the search", async () => {
    seed();
    render(<SearchPanel />);
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo");
    await screen.findByText("const foo = 1;");

    const caseBtn = screen.getByRole("button", { name: "search.caseSensitive" });
    expect(caseBtn).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(caseBtn);
    expect(caseBtn).toHaveAttribute("aria-pressed", "true");

    // The changed option re-runs the debounced search with the new flag.
    await waitFor(() =>
      expect(searchText).toHaveBeenLastCalledWith(
        ROOT,
        "foo",
        expect.objectContaining({ caseSensitive: true }),
      ),
    );
  });

  it("each of the case / word / regex toggles flips its aria-pressed state", async () => {
    seed();
    render(<SearchPanel />);
    for (const name of ["search.caseSensitive", "search.wholeWord", "search.regex"]) {
      const btn = screen.getByRole("button", { name });
      expect(btn).toHaveAttribute("aria-pressed", "false");
      await userEvent.click(btn);
      expect(btn).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("the replace flow confirms, calls replaceText, and shows the changed count", async () => {
    seed();
    render(<SearchPanel />);
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo");
    await screen.findByText("const foo = 1;");

    await userEvent.type(screen.getByPlaceholderText("search.replacePlaceholder"), "bar");

    // Replace All arms a confirm step (it writes files with no undo).
    await userEvent.click(screen.getByRole("button", { name: "search.replaceAll" }));
    await userEvent.click(screen.getByRole("button", { name: "search.replaceConfirm" }));

    expect(replaceText).toHaveBeenCalledWith(ROOT, "foo", "bar");
    // The panel surfaces the "replaced" status (count is fed to i18n).
    expect(await screen.findByText("search.replaced")).toBeInTheDocument();
  });
});
