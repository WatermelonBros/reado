// UI test: the Search panel runs a full-text project search, renders the matches
// grouped by file (text + relative path:line), opens a result on click, reflects
// the case/word/regex toggles (and re-runs with them), and drives the replace
// flow. Only the two backend edges (searchText / replaceText) are mocked; the
// panel's own debounce and state are real. Real timers + findBy cover the async.

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { searchText, replaceText, replaceInFile } = vi.hoisted(() => ({
  searchText: vi.fn(),
  replaceText: vi.fn(),
  replaceInFile: vi.fn(),
}))
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  searchText,
  replaceText,
  replaceInFile,
}))

import { SearchPanel } from "@/components/organisms/SearchPanel"
import type { SearchMatch } from "@/lib/api"
import { useFileUndo } from "@/lib/fileUndo"
import { useProject, useWorkspace } from "@/lib/store"

const ROOT = "/repo"

// Two files, three matches — deterministic, so the grouped list is stable.
const MATCHES: SearchMatch[] = [
  { path: "/repo/src/a.ts", line: 12, column: 3, text: "  const foo = 1;" },
  { path: "/repo/src/a.ts", line: 40, column: 1, text: "foo();" },
  { path: "/repo/src/b.ts", line: 7, column: 2, text: "  return foo;" },
]

function seed() {
  // Results preview: walking a list is browsing, so each click lands in the tab
  // the next one replaces rather than adding to the strip.
  const open = vi.fn()
  useProject.setState({ root: ROOT, openPreview: open })
  return { open }
}

beforeEach(() => {
  searchText.mockReset().mockResolvedValue(MATCHES)
  replaceText.mockReset().mockResolvedValue({ changed: 3, backups: [] })
  replaceInFile.mockReset().mockResolvedValue({ changed: 1, backups: [] })
  useFileUndo.setState({ stack: [] })
  // A stale query would auto-run a search on mount; start each test clean.
  useWorkspace.setState({ searchQuery: "", pendingSearch: null, searchScope: null })
})

describe("SearchPanel", () => {
  it("typing a query runs searchText and renders the grouped results", async () => {
    seed()
    render(<SearchPanel />)
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo")

    // Each match renders its trimmed text plus a relative path:line line.
    expect(await screen.findByText("const foo = 1;")).toBeInTheDocument()
    expect(screen.getByText("foo();")).toBeInTheDocument()
    expect(screen.getByText("return foo;")).toBeInTheDocument()
    expect(screen.getByText("src/a.ts:12")).toBeInTheDocument()
    expect(screen.getByText("src/a.ts:40")).toBeInTheDocument()
    expect(screen.getByText("src/b.ts:7")).toBeInTheDocument()

    expect(searchText).toHaveBeenCalledWith(ROOT, "foo", {
      include: "",
      exclude: "",
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      scope: null,
    })
  })

  it("a requested search seeds the query and puts the caret in the field", async () => {
    seed()
    useWorkspace.setState({ pendingSearch: "needle" })
    render(<SearchPanel />)
    const field = screen.getByPlaceholderText("search.placeholder")
    expect(field).toHaveValue("needle")
    // ⌘⇧F lands here now, so it has to be typeable straight away.
    expect(document.activeElement).toBe(field)
  })

  it("an empty request keeps the last query, selected and ready to retype", async () => {
    seed()
    useWorkspace.setState({ searchQuery: "previous", pendingSearch: "" })
    render(<SearchPanel />)
    const field = screen.getByPlaceholderText("search.placeholder")
    expect(field).toHaveValue("previous")
    expect(document.activeElement).toBe(field)
  })

  it("clicking a result previews it at its path and line", async () => {
    const { open } = seed()
    render(<SearchPanel />)
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo")

    await userEvent.click(await screen.findByText("const foo = 1;"))
    expect(open).toHaveBeenCalledWith("/repo/src/a.ts", 12)
  })

  it("toggling case sensitivity reflects aria-pressed and re-runs the search", async () => {
    seed()
    render(<SearchPanel />)
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo")
    await screen.findByText("const foo = 1;")

    const caseBtn = screen.getByRole("button", { name: "search.caseSensitive" })
    expect(caseBtn).toHaveAttribute("aria-pressed", "false")

    await userEvent.click(caseBtn)
    expect(caseBtn).toHaveAttribute("aria-pressed", "true")

    // The changed option re-runs the debounced search with the new flag.
    await waitFor(() =>
      expect(searchText).toHaveBeenLastCalledWith(
        ROOT,
        "foo",
        expect.objectContaining({ caseSensitive: true }),
      ),
    )
  })

  it("each of the case / word / regex toggles flips its aria-pressed state", async () => {
    seed()
    render(<SearchPanel />)
    for (const name of ["search.caseSensitive", "search.wholeWord", "search.regex"]) {
      const btn = screen.getByRole("button", { name })
      expect(btn).toHaveAttribute("aria-pressed", "false")
      await userEvent.click(btn)
      expect(btn).toHaveAttribute("aria-pressed", "true")
    }
  })

  it("the replace flow confirms, calls replaceText, and shows the changed count", async () => {
    seed()
    render(<SearchPanel />)
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo")
    await screen.findByText("const foo = 1;")

    await userEvent.type(screen.getByPlaceholderText("search.replacePlaceholder"), "bar")

    // Replace All arms a confirm step, then records one undoable batch.
    await userEvent.click(screen.getByRole("button", { name: "search.replaceAll" }))
    await userEvent.click(screen.getByRole("button", { name: "search.replaceConfirm" }))

    expect(replaceText).toHaveBeenCalledWith(
      ROOT,
      "foo",
      "bar",
      expect.objectContaining({ caseSensitive: false, wholeWord: false, regex: false }),
    )
    // The status now says how to take it back, not just how many files moved.
    expect(await screen.findByText("search.replaceUndo")).toBeInTheDocument()
  })

  it("records a project-wide replace as one undoable action", async () => {
    // Forty rewritten files, one ⌘Z: the user made one decision.
    replaceText.mockResolvedValue({
      changed: 2,
      backups: [
        { path: "/repo/src/a.ts", backup: "/repo/.reado/.undo/1__a.ts" },
        { path: "/repo/src/b.ts", backup: "/repo/.reado/.undo/2__b.ts" },
      ],
    })
    seed()
    render(<SearchPanel />)
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo")
    await screen.findByText("const foo = 1;")
    await userEvent.type(screen.getByPlaceholderText("search.replacePlaceholder"), "bar")
    await userEvent.click(screen.getByRole("button", { name: "search.replaceAll" }))
    await userEvent.click(screen.getByRole("button", { name: "search.replaceConfirm" }))

    await waitFor(() => expect(useFileUndo.getState().stack).toHaveLength(1))
    expect(useFileUndo.getState().stack[0]).toMatchObject({ kind: "replace" })
  })

  it("replaces a single match by its position, not by an index", async () => {
    // Two occurrences on one line are different matches; the row you clicked is
    // the one you meant.
    seed()
    render(<SearchPanel />)
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo")
    await screen.findByText("const foo = 1;")
    await userEvent.type(screen.getByPlaceholderText("search.replacePlaceholder"), "bar")
    await userEvent.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("const foo = 1;"),
    })
    await userEvent.click(screen.getByRole("menuitem", { name: "search.replaceThis" }))

    expect(replaceInFile).toHaveBeenCalledWith(
      ROOT,
      "/repo/src/a.ts",
      "foo",
      "bar",
      expect.objectContaining({ regex: false }),
      [[12, 3]],
    )
  })

  it("replaces with the toggles the search ran with, not literally", async () => {
    // The bug: the panel searched with regex on and Replace All went through
    // literally, so it rewrote the pattern text instead of the matches. The
    // toggles have to reach both calls or the rewrite is not the list on screen.
    seed()
    render(<SearchPanel />)
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo")
    await screen.findByText("const foo = 1;")
    await userEvent.click(screen.getByRole("button", { name: "search.regex" }))
    await userEvent.click(screen.getByRole("button", { name: "search.caseSensitive" }))
    await userEvent.type(screen.getByPlaceholderText("search.replacePlaceholder"), "bar")

    await userEvent.click(screen.getByRole("button", { name: "search.replaceAll" }))
    await userEvent.click(screen.getByRole("button", { name: "search.replaceConfirm" }))

    await waitFor(() =>
      expect(replaceText).toHaveBeenCalledWith(
        ROOT,
        "foo",
        "bar",
        expect.objectContaining({ regex: true, caseSensitive: true }),
      ),
    )
  })

  it("offers no replace action until there is something to replace with", async () => {
    // An empty replacement would silently delete the match.
    seed()
    render(<SearchPanel />)
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo")
    await screen.findByText("const foo = 1;")
    await userEvent.pointer({
      keys: "[MouseRight]",
      target: screen.getByText("const foo = 1;"),
    })
    expect(screen.queryByRole("menuitem", { name: "search.replaceThis" })).not.toBeInTheDocument()
  })

  it("a folder scope reaches the search, the replace, and back out of the chip", async () => {
    seed()
    useWorkspace.setState({ searchScope: "src/lib" })
    render(<SearchPanel />)
    await userEvent.type(screen.getByPlaceholderText("search.placeholder"), "foo")
    await waitFor(() =>
      expect(searchText).toHaveBeenCalledWith(
        ROOT,
        "foo",
        expect.objectContaining({ scope: "src/lib" }),
      ),
    )
    // The rewrite must be scoped the same way the results are.
    await userEvent.click(await screen.findByTitle("search.replaceAll"))
    await userEvent.click(await screen.findByTitle("search.replaceConfirm"))
    await waitFor(() =>
      expect(replaceText).toHaveBeenCalledWith(
        ROOT,
        "foo",
        "",
        expect.objectContaining({ scope: "src/lib" }),
      ),
    )

    await userEvent.click(screen.getByRole("button", { name: "search.clearScope" }))
    expect(useWorkspace.getState().searchScope).toBeNull()
  })
})
