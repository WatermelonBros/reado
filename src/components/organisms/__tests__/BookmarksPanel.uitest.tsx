// UI test: the Bookmarks panel renders this project's reading pins grouped by
// file, jumps on click, and removes a pin. Stores are seeded directly; the
// backend persist call is mocked so no Tauri IPC is touched.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Only the persist edge needs mocking; the store logic itself is real.
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  setBookmarks: vi.fn(async () => {}),
}));

import { BookmarksPanel } from "../BookmarksPanel";
import { useBookmarks } from "../../../lib/bookmarks";
import { useProject } from "../../../lib/store";
import type { Bookmark } from "../../../lib/api";

const ROOT = "/repo";

function seed(bookmarks: Bookmark[]) {
  const open = vi.fn();
  useBookmarks.setState({ bookmarks });
  useProject.setState({ root: ROOT, open });
  return { open };
}

beforeEach(() => {
  useBookmarks.setState({ bookmarks: [] });
});

describe("BookmarksPanel", () => {
  it("shows the empty state when there are no bookmarks", () => {
    seed([]);
    render(<BookmarksPanel />);
    expect(screen.getByText("bookmarks.empty")).toBeInTheDocument();
  });

  it("groups pins by file, sorted by line, with snippet + line", () => {
    // Deliberately seeded out of order: file b before a, and within a.ts the
    // line-20 pin before the line-2 pin. The component must sort both.
    seed([
      { path: "b.ts", line: 5, snippet: "five" },
      { path: "a.ts", line: 20, snippet: "twenty" },
      { path: "a.ts", line: 2, snippet: "two" },
    ]);
    render(<BookmarksPanel />);

    // Both file headings present.
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("b.ts")).toBeInTheDocument();
    // Snippets rendered.
    expect(screen.getByText("two")).toBeInTheDocument();
    expect(screen.getByText("twenty")).toBeInTheDocument();
    expect(screen.getByText("five")).toBeInTheDocument();

    // `x` precedes `y` in the actual DOM order.
    const precedes = (x: Element, y: Element) =>
      Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);

    // Files are ordered by path: a.ts heading before b.ts heading.
    // (Fails if the `.sort((a, b) => a.path.localeCompare(b.path))` is removed.)
    expect(precedes(screen.getByText("a.ts"), screen.getByText("b.ts"))).toBe(true);

    // Within a.ts, pins are ordered by line: line 2 ("two") before line 20
    // ("twenty"). (Fails if the per-file `.sort((a, b) => a.line - b.line)` goes.)
    expect(precedes(screen.getByText("two"), screen.getByText("twenty"))).toBe(true);

    // And the whole a.ts group renders ahead of the b.ts group's pin.
    expect(precedes(screen.getByText("twenty"), screen.getByText("five"))).toBe(true);
  });

  it("falls back to an em dash when a snippet is empty", () => {
    seed([{ path: "a.ts", line: 1, snippet: "" }]);
    render(<BookmarksPanel />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("clicking a pin opens the file at its line", async () => {
    const { open } = seed([{ path: "a.ts", line: 7, snippet: "lucky" }]);
    render(<BookmarksPanel />);
    await userEvent.click(screen.getByText("lucky"));
    expect(open).toHaveBeenCalledWith(`${ROOT}/a.ts`, 7);
  });

  it("the remove action drops the pin from the store", async () => {
    seed([{ path: "a.ts", line: 7, snippet: "lucky" }]);
    render(<BookmarksPanel />);
    await userEvent.click(screen.getByRole("button", { name: "bookmarks.remove" }));
    expect(useBookmarks.getState().bookmarks).toHaveLength(0);
    expect(screen.queryByText("lucky")).not.toBeInTheDocument();
  });
});
