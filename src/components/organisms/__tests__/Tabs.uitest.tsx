// UI test: the editor tab strip. Renders a tab per open file, activates a tab
// on click, closes a tab via its × button, honours the `tabBar` setting
// (multiple / single / hidden), and stays reactive to a single store change per
// test. Pointer drag-reorder is deliberately not exercised (fragile in jsdom).

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const ask = vi.fn(async () => true)
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: (...a: unknown[]) => ask(...(a as [])) }))

import { Tabs, tabLabels } from "@/components/organisms/Tabs"
import { useEditorActions, useProject, useSettings } from "@/lib/store"
import { useUntitled } from "@/lib/untitled"

// Seed just the slice Tabs reads (the store's action functions stay intact).
// `closedTabs` is needed because close() pushes onto it.
beforeEach(() => {
  useProject.setState({
    tabs: ["/proj/src/a.ts", "/proj/src/b.ts", "/proj/README.md"],
    active: "/proj/src/a.ts",
    closedTabs: [],
  })
  useSettings.setState({ tabBar: "multiple" })
  useEditorActions.setState({ dirtyPaths: [] })
  useProject.setState({ previewPath: null, pinnedTabs: [] })
  useUntitled.setState({ texts: {} })
  ask.mockClear()
  ask.mockResolvedValue(true)
})

describe("untitled tabs", () => {
  beforeEach(() => {
    useProject.setState({ root: "/proj", tabs: ["untitled:1"], active: "untitled:1" })
  })

  it("shows the buffer's name, not the id it is keyed by", () => {
    render(<Tabs />)
    expect(screen.getByRole("tab", { name: "Untitled-1" })).toBeInTheDocument()
  })

  it("asks before closing one with text in it, and drops the text on yes", async () => {
    useUntitled.setState({ texts: { "/proj": { "untitled:1": "a draft" } } })
    render(<Tabs />)
    await userEvent.click(screen.getByRole("button", { name: "tabs.close Untitled-1" }))
    expect(ask).toHaveBeenCalled()
    expect(useProject.getState().tabs).toEqual([])
    expect(useUntitled.getState().textOf("untitled:1")).toBe("")
  })

  it("keeps the buffer when the question is answered no", async () => {
    useUntitled.setState({ texts: { "/proj": { "untitled:1": "a draft" } } })
    ask.mockResolvedValue(false)
    render(<Tabs />)
    await userEvent.click(screen.getByRole("button", { name: "tabs.close Untitled-1" }))
    expect(useProject.getState().tabs).toEqual(["untitled:1"])
    expect(useUntitled.getState().textOf("untitled:1")).toBe("a draft")
  })

  it("closes an empty one without a question", async () => {
    render(<Tabs />)
    await userEvent.click(screen.getByRole("button", { name: "tabs.close Untitled-1" }))
    expect(ask).not.toHaveBeenCalled()
    expect(useProject.getState().tabs).toEqual([])
  })
})

describe("Tabs", () => {
  it("renders a tab per open file, showing each basename", () => {
    render(<Tabs />)
    expect(screen.getByRole("tab", { name: "a.ts" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "b.ts" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "README.md" })).toBeInTheDocument()
  })

  it("marks the active tab as selected", () => {
    render(<Tabs />)
    expect(screen.getByRole("tab", { name: "a.ts" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "b.ts" })).toHaveAttribute("aria-selected", "false")
  })

  it("activates a tab when it is clicked", async () => {
    render(<Tabs />)
    await userEvent.click(screen.getByRole("tab", { name: "b.ts" }))
    expect(useProject.getState().active).toBe("/proj/src/b.ts")
    // Reactive re-render reflects the new selection.
    expect(screen.getByRole("tab", { name: "b.ts" })).toHaveAttribute("aria-selected", "true")
  })

  it("closes a tab via its × button, removing it from the store", async () => {
    render(<Tabs />)
    await userEvent.click(screen.getByRole("button", { name: "tabs.close b.ts" }))
    expect(useProject.getState().tabs).toEqual(["/proj/src/a.ts", "/proj/README.md"])
    expect(screen.queryByRole("tab", { name: "b.ts" })).not.toBeInTheDocument()
  })

  it('shows only the active file in "single" tabBar mode', () => {
    useSettings.setState({ tabBar: "single" })
    render(<Tabs />)
    expect(screen.getByRole("tab", { name: "a.ts" })).toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "b.ts" })).not.toBeInTheDocument()
  })

  it('renders nothing when tabBar is "hidden"', () => {
    useSettings.setState({ tabBar: "hidden" })
    const { container } = render(<Tabs />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
  })

  it("renders nothing when there are no open tabs", () => {
    useProject.setState({ tabs: [], active: null })
    const { container } = render(<Tabs />)
    expect(container).toBeEmptyDOMElement()
  })

  it("marks a tab with unsaved edits", () => {
    // Dirty paths are project-relative; the strip holds absolute paths.
    useProject.setState({ root: "/proj" })
    useEditorActions.setState({ dirtyPaths: ["src/b.ts"] })
    render(<Tabs />)
    expect(screen.getByLabelText("tabs.unsaved")).toBeInTheDocument()
    expect(screen.getAllByLabelText("tabs.unsaved")).toHaveLength(1)
  })

  it("disambiguates same-named tabs with their folder, and leaves unique ones alone", () => {
    const labels = tabLabels(["/proj/a/index.ts", "/proj/b/index.ts", "/proj/README.md"])
    expect(labels.get("/proj/a/index.ts")).toEqual({ name: "index.ts", dir: "a" })
    expect(labels.get("/proj/b/index.ts")).toEqual({ name: "index.ts", dir: "b" })
    expect(labels.get("/proj/README.md")).toEqual({ name: "README.md", dir: undefined })
  })

  it("offers the file actions on right-click, not just the close set", async () => {
    render(<Tabs />)
    await userEvent.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("tab", { name: "b.ts" }),
    })
    for (const label of [
      "tabs.closeSaved",
      "tabs.splitRight",
      "tree.copyPath",
      "tree.copyRelativePath",
      "tree.openInTerminal",
    ]) {
      expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument()
    }
  })

  it("shows a preview tab in italics, and keeps it open on a double-click", async () => {
    // A preview is the tab the next file you look at replaces; a double-click
    // is how you say you meant to keep this one.
    useProject.setState({ previewPath: "/proj/src/b.ts" })
    render(<Tabs />)
    const tab = screen.getByRole("tab", { name: "b.ts" })
    expect(tab.querySelector("span.italic")).not.toBeNull()
    await userEvent.dblClick(tab)
    expect(useProject.getState().previewPath).toBeNull()
  })

  it("sorts pinned tabs to the front and marks them", () => {
    useProject.setState({ pinnedTabs: ["/proj/README.md"] })
    render(<Tabs />)
    const names = screen.getAllByRole("tab").map((el) => el.textContent)
    expect(names[0]).toContain("README.md")
    expect(screen.getByLabelText("tabs.pinned")).toBeInTheDocument()
  })

  it("spares a pinned tab from the bulk closes", async () => {
    // A pin the user set is exactly the tab "close everything" must not take.
    useProject.setState({ pinnedTabs: ["/proj/README.md"] })
    render(<Tabs />)
    await userEvent.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("tab", { name: "a.ts" }),
    })
    await userEvent.click(screen.getByRole("menuitem", { name: "tabs.closeAll" }))
    expect(useProject.getState().tabs).toEqual(["/proj/README.md"])
  })

  it("pins and unpins from the tab menu", async () => {
    render(<Tabs />)
    await userEvent.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("tab", { name: "a.ts" }),
    })
    await userEvent.click(screen.getByRole("menuitem", { name: "tabs.pin" }))
    expect(useProject.getState().pinnedTabs).toEqual(["/proj/src/a.ts"])
  })
})
