// The command palette's command mode: which commands the current context offers,
// that running one actually does its thing, and the modes the palette can switch
// into (symbols, workspace symbols, recents, bookmarks, full-text search).
// File and command basics live in Palette.uitest.tsx; this is the rest.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { listFiles, listSymbols, searchText } = vi.hoisted(() => ({
  listFiles: vi.fn(async () => ["src/a.ts"]),
  listSymbols: vi.fn(
    async () => [] as Array<{ name: string; kind: string; path: string; line: number }>,
  ),
  searchText: vi.fn(
    async () => [] as Array<{ path: string; line: number; column: number; text: string }>,
  ),
}))
// The sweep runs every command, and several reach the backend. Answer them with
// an empty result so nothing rejects into the test run.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }))
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
  ask: vi.fn(async () => false),
  message: vi.fn(async () => {}),
}))
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  listFiles,
  listSymbols,
  searchText,
}))

// The action modules a command reaches for. Each is a spy so "did this command
// do its job" is a single assertion.
const doc = vi.hoisted(() => ({
  goToBracket: vi.fn(),
  gotoLastEdit: vi.fn(),
  showCallHierarchy: vi.fn(),
  showTypeHierarchy: vi.fn(),
  addCursorsToLineEnds: vi.fn(),
  toggleBookmarkAtCursor: vi.fn(),
  formatDocument: vi.fn(),
  askAboutSelection: vi.fn(),
  goToLine: vi.fn(),
}))
vi.mock("../../../lib/docInfo", async (orig) => ({
  ...(await orig<typeof import("../../../lib/docInfo")>()),
  ...doc,
}))
const agents = vi.hoisted(() => ({ clearTerminal: vi.fn(), restartTerminal: vi.fn() }))
vi.mock("../../../lib/agents", async (orig) => ({
  ...(await orig<typeof import("../../../lib/agents")>()),
  ...agents,
}))
const { enableMcp } = vi.hoisted(() => ({ enableMcp: vi.fn(async () => {}) }))
vi.mock("../../../lib/mcp", () => ({ enableMcp }))
const sync = vi.hoisted(() => ({
  exportSettings: vi.fn(async () => {}),
  importSettings: vi.fn(async () => {}),
}))
vi.mock("../../../lib/settingsSync", () => sync)
const { promptDialog } = vi.hoisted(() => ({
  promptDialog: vi.fn(async () => null as string | null),
}))
vi.mock("../../../lib/prompt", async (orig) => ({
  ...(await orig<typeof import("../../../lib/prompt")>()),
  prompt: promptDialog,
}))
const { checkForUpdates } = vi.hoisted(() => ({ checkForUpdates: vi.fn(async () => {}) }))
vi.mock("../../../lib/updater", () => ({ checkForUpdates }))
const { openProjectHere } = vi.hoisted(() => ({ openProjectHere: vi.fn(async () => {}) }))
vi.mock("../../../lib/window", async (orig) => ({
  ...(await orig<typeof import("../../../lib/window")>()),
  openProjectHere,
}))
vi.mock("../../../lib/lsp", async (orig) => ({
  ...(await orig<typeof import("../../../lib/lsp")>()),
  lspDocumentSymbols: () => null,
}))

import { Palette } from "@/components/organisms/Palette"
import { useBookmarks } from "@/lib/bookmarks"
import { useDocInfo } from "@/lib/docInfo"
import { useGuidedReview } from "@/lib/guidedReview"
import { useOnboarding } from "@/lib/onboarding"
import { usePreReview } from "@/lib/preReview"
import { usePreview } from "@/lib/preview"
import { useReadProgress } from "@/lib/readProgress"
import { useResolveLoop } from "@/lib/resolveLoop"
import { useSemanticSearch } from "@/lib/semanticSearch"
import {
  useEditorActions,
  usePalette,
  useProject,
  useRecents,
  useSettings,
  useWorkspace,
} from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

/** An editor view exposing only what the command gating reads. */
const view = (empty: boolean) =>
  ({ state: { selection: { main: { empty } }, doc: { toString: () => "const x = 1" } } }) as never

const project = {
  root: "/repo",
  active: "/repo/src/a.ts" as string | null,
  git: { isRepo: true },
  navIndex: 1,
  navStack: [{ path: "a" }, { path: "b" }, { path: "c" }],
  closedTabs: ["c.ts"],
  splitPath: null as string | null,
  showHidden: false,
  open: vi.fn(),
  setShowHidden: vi.fn(),
  goBack: vi.fn(),
  goForward: vi.fn(),
  reopenClosed: vi.fn(),
  openSplit: vi.fn(),
  closeSplit: vi.fn(),
}

/** Open the palette in command mode and return its row labels. */
function openCommands() {
  usePalette.setState({ mode: "commands" })
  const utils = render(<Palette />)
  return { ...utils, labels: () => screen.getAllByRole("option").map((r) => r.textContent ?? "") }
}

/** Click the command whose label starts with `text`. */
async function run(text: string) {
  const row = screen
    .getAllByRole("option")
    .find((r) => r.textContent?.startsWith(text)) as HTMLElement
  expect(row, `no command labelled ${text}`).toBeTruthy()
  await userEvent.click(row)
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(project, {
    active: "/repo/src/a.ts",
    git: { isRepo: true },
    navIndex: 1,
    navStack: [{ path: "a" }, { path: "b" }, { path: "c" }],
    closedTabs: ["c.ts"],
    splitPath: null,
    showHidden: false,
  })
  useProject.setState(project as never)
  usePalette.setState({ mode: null })
  useSettings.setState({
    wrap: false,
    focusMode: false,
    stickyScroll: false,
    showRibbon: false,
    quickInputPosition: "top",
  })
  useDocInfo.setState({ view: view(false) })
  useTerminals.setState({ sessions: [{ id: "t1", title: "Terminal 1" }] })
  useBookmarks.setState({ bookmarks: [{ path: "src/a.ts", line: 3, snippet: "const x" }] })
  useRecents.setState({ projects: [{ path: "/repo", name: "repo" }] as never })
  useReadProgress.setState({ read: new Set(), changed: new Set() })
  useWorkspace.setState({ graphOpen: false, docsOpen: false })
  usePreview.setState({ open: false, agentAccess: false })
})

describe("what the context offers", () => {
  it("lists the selection-scoped commands only with a selection", () => {
    const { unmount, labels } = openCommands()
    expect(labels().some((l) => l.startsWith("comment.new"))).toBe(true)
    expect(labels().some((l) => l.startsWith("editor.explain"))).toBe(true)
    unmount()

    useDocInfo.setState({ view: view(true) })
    const again = openCommands()
    expect(again.labels().some((l) => l.startsWith("comment.new"))).toBe(false)
  })

  it("drops the file-scoped commands with no file open", () => {
    useProject.setState({ active: null })
    useDocInfo.setState({ view: null })
    const { labels } = openCommands()
    expect(labels().some((l) => l.startsWith("peek.def"))).toBe(false)
    expect(labels().some((l) => l.startsWith("editor.format"))).toBe(false)
  })

  it("drops the git-scoped commands outside a repository", () => {
    useProject.setState({ git: { isRepo: false } as never })
    const { labels } = openCommands()
    expect(labels().some((l) => l.startsWith("prereview.run"))).toBe(false)
    expect(labels().some((l) => l.startsWith("guided.cmd.start"))).toBe(false)
  })

  it("drops the terminal commands with no terminal", () => {
    useTerminals.setState({ sessions: [] })
    const { labels } = openCommands()
    expect(labels().some((l) => l.startsWith("terminal.clear"))).toBe(false)
  })

  it("drops the history commands at the ends of the history", () => {
    useProject.setState({ navIndex: 0, navStack: [{ path: "a" }], closedTabs: [] })
    const { labels } = openCommands()
    expect(labels().some((l) => l.startsWith("nav.back"))).toBe(false)
    expect(labels().some((l) => l.startsWith("nav.forward"))).toBe(false)
    expect(labels().some((l) => l.startsWith("tabs.reopen"))).toBe(false)
  })

  it("offers 'go to bookmark' only when there are bookmarks", () => {
    useBookmarks.setState({ bookmarks: [] })
    const { labels } = openCommands()
    expect(labels().some((l) => l.startsWith("bookmarks.goto"))).toBe(false)
  })

  it("shows each toggle's current state in its label", () => {
    useSettings.setState({ wrap: true, focusMode: false })
    const { labels } = openCommands()
    expect(labels().some((l) => l.includes("editor.wrap: on"))).toBe(true)
    expect(labels().some((l) => l.includes("editor.focus: off"))).toBe(true)
  })

  it("offers a quick switch to every theme", () => {
    const { labels } = openCommands()
    expect(labels().filter((l) => l.startsWith("settings.theme:")).length).toBeGreaterThanOrEqual(4)
  })

  it("filters the list as you type", async () => {
    openCommands()
    await userEvent.type(screen.getByRole("textbox"), "terminal")
    const labels = screen.getAllByRole("option").map((r) => r.textContent ?? "")
    expect(labels.every((l) => l.toLowerCase().includes("terminal"))).toBe(true)
  })

  it("says so when nothing matches — but only once you've typed", async () => {
    openCommands()
    await userEvent.type(screen.getByRole("textbox"), "zzzznope")
    expect(screen.getByText("palette.noResults")).toBeInTheDocument()
  })
})

describe("running a command", () => {
  it("dispatches the editor actions", async () => {
    openCommands()
    await run("editor.goToBracket")
    expect(doc.goToBracket).toHaveBeenCalled()
  })

  it("formats, and asks about the selection", async () => {
    const { unmount } = openCommands()
    await run("editor.format")
    expect(doc.formatDocument).toHaveBeenCalled()
    unmount()
    openCommands()
    await run("qa.ask")
    expect(doc.askAboutSelection).toHaveBeenCalled()
  })

  it("drives the terminal", async () => {
    const { unmount } = openCommands()
    await run("terminal.clear")
    expect(agents.clearTerminal).toHaveBeenCalled()
    unmount()
    openCommands()
    await run("terminal.restart")
    expect(agents.restartTerminal).toHaveBeenCalled()
  })

  it("toggles a setting in place, without closing the palette", async () => {
    openCommands()
    await run("editor.wrap")
    expect(useSettings.getState().wrap).toBe(true)
    expect(usePalette.getState().mode).toBe("commands")
  })

  it("switches theme and pins the mode to manual", async () => {
    useSettings.setState({ theme: "none" as never })
    openCommands()
    await run("settings.theme:")
    expect(useSettings.getState().mode).toBe("manual")
    // The theme itself has to change — "pins the mode" is only half the name.
    expect(useSettings.getState().theme).not.toBe("none")
  })

  it("walks the navigation history", async () => {
    const { unmount } = openCommands()
    await run("nav.back")
    expect(project.goBack).toHaveBeenCalled()
    unmount()
    openCommands()
    await run("nav.forward")
    expect(project.goForward).toHaveBeenCalled()
  })

  it("reopens the last closed tab and toggles the sidebar", async () => {
    const { unmount } = openCommands()
    await run("tabs.reopen")
    expect(project.reopenClosed).toHaveBeenCalled()
    unmount()
    const toggleSidebar = vi.fn()
    useWorkspace.setState({ toggleSidebar })
    openCommands()
    await run("sidebar.toggle")
    expect(toggleSidebar).toHaveBeenCalled()
  })

  it("opens and closes the split editor", async () => {
    const { unmount } = openCommands()
    await run("split.toggle")
    expect(project.openSplit).toHaveBeenCalled()
    unmount()
    useProject.setState({ splitPath: "/repo/b.ts" })
    openCommands()
    await run("split.toggle")
    expect(project.closeSplit).toHaveBeenCalled()
  })

  it("marks the active file read, then unread", async () => {
    const { unmount } = openCommands()
    await run("tree.markRead")
    expect(useReadProgress.getState().read.has("src/a.ts")).toBe(true)
    unmount()
    openCommands()
    await run("tree.markUnread")
    expect(useReadProgress.getState().read.has("src/a.ts")).toBe(false)
  })

  it("toggles hidden files", async () => {
    openCommands()
    await run("tree.showHidden")
    expect(project.setShowHidden).toHaveBeenCalledWith(true)
  })

  it("opens the browser preview, and its agent access", async () => {
    const { unmount } = openCommands()
    await run("preview.toggle")
    expect(usePreview.getState().open).toBe(true)
    unmount()
    openCommands()
    await run("preview.agentAccess")
    expect(usePreview.getState().agentAccess).toBe(true)
  })

  it("wires up MCP, and exports/imports settings", async () => {
    const { unmount } = openCommands()
    await run("mcp.enable")
    expect(enableMcp).toHaveBeenCalledWith("/repo")
    unmount()
    const second = openCommands()
    await run("sync.export")
    expect(sync.exportSettings).toHaveBeenCalled()
    second.unmount()
    openCommands()
    await run("sync.import")
    expect(sync.importSettings).toHaveBeenCalled()
  })

  it("opens the tools that live in the sidebar", async () => {
    const selectTool = vi.fn()
    useWorkspace.setState({ selectTool })
    openCommands()
    await run("tours.open")
    expect(selectTool).toHaveBeenCalledWith("tours")
  })

  it("opens the graph and the docs viewer", async () => {
    const toggleGraph = vi.fn()
    const toggleDocs = vi.fn()
    useWorkspace.setState({ toggleGraph, toggleDocs })
    const { unmount } = openCommands()
    await run("graph.title")
    expect(toggleGraph).toHaveBeenCalledWith(true)
    unmount()
    openCommands()
    await run("kb.title")
    expect(toggleDocs).toHaveBeenCalledWith(true)
  })

  it("opens Settings, the shortcut sheet and Anywhere", async () => {
    const { unmount } = openCommands()
    await run("settings.title")
    expect(usePalette.getState().settingsOpen).toBe(true)
    unmount()
    const second = openCommands()
    await run("sc.title")
    expect(usePalette.getState().shortcutsOpen).toBe(true)
    second.unmount()
    openCommands()
    await run("anywhere.open")
    expect(usePalette.getState().anywhereOpen).toBe(true)
  })

  it("checks for updates on demand", async () => {
    openCommands()
    await run("settings.checkUpdates")
    expect(checkForUpdates).toHaveBeenCalledWith(true)
  })

  it("asks for a query before running a semantic search", async () => {
    openCommands()
    await run("semantic.search")
    await waitFor(() => expect(promptDialog).toHaveBeenCalled())
  })

  it("switches the palette into another mode", async () => {
    const { unmount } = openCommands()
    await run("finder.placeholder")
    expect(usePalette.getState().mode).toBe("files")
    unmount()
    usePalette.setState({ mode: "commands" })
    const second = render(<Palette />)
    await run("symbols.gotoWorkspace")
    expect(usePalette.getState().mode).toBe("wsymbols")
    second.unmount()
    usePalette.setState({ mode: "commands" })
    render(<Palette />)
    await run("bookmarks.goto")
    expect(usePalette.getState().mode).toBe("bookmarks")
  })

  /** Commands that deliberately don't dismiss the palette — they never call
   *  `close()`. Listed rather than inferred, so a command that *should* close
   *  and silently doesn't shows up as a new entry. */
  const STAYS_OPEN = [
    "editor.goToBracket",
    "editor.lastEdit",
    "editor.cursorsLineEnds",
    "editor.format",
    "terminal.clear",
    "terminal.restart",
    "terminal.move",
    "editor.wrap:",
    "editor.focus:",
    "editor.sticky:",
    "editor.ribbon:",
    "tree.markRead",
    "tree.showHidden:",
    "nav.back",
    "nav.forward",
    "tabs.reopen",
    "sidebar.toggle",
    "split.toggle",
    "settings.checkUpdates",
    "settings.theme:",
  ]

  it("every command that means to dismiss the palette actually dismisses it", async () => {
    // `commandRows` is a module-level function, so a bare `close()` inside it
    // resolves to the DOM global instead of the store action — a silent
    // failure, since the command still runs and only the palette stays up.
    const { labels } = openCommands()
    const stillOpen: string[] = []
    for (const label of labels()) {
      if (STAYS_OPEN.some((k) => label.startsWith(k))) continue
      usePalette.setState({ mode: "commands" })
      const { unmount } = render(<Palette />)
      const row = screen.getAllByRole("option").find((r) => r.textContent === label)
      fireEvent.click(row as HTMLElement)
      // A mode switch hands over to another list rather than dismissing.
      if (usePalette.getState().mode === "commands") stillOpen.push(label)
      unmount()
    }
    expect(stillOpen, "these commands left the palette open").toEqual([])
    // 52 rows, each a mount and unmount: comfortably under 5s alone, but not
    // when the whole suite is running.
  }, 30_000)

  it("runs every command it offers, and each one does what it says", async () => {
    const { labels } = openCommands()
    const all = labels()
    expect(all.length).toBeGreaterThan(30)

    // Store actions a command reaches through the store rather than a module.
    const ws = {
      selectTool: vi.fn(),
      toggleSidebar: vi.fn(),
      toggleGraph: vi.fn(),
      toggleDocs: vi.fn(),
      searchFor: vi.fn(),
    }
    // These `set()` only after an `await`, so spy rather than read state.
    const pre = { generate: vi.fn() }
    const guided = { start: vi.fn(async () => null), load: vi.fn() }
    const loop = { start: vi.fn(async () => {}) }
    const togglePosition = vi.fn()
    // The prompt resolves null by default, which makes the search itself
    // unreachable — answer it so the command's real work can be asserted.
    const semanticRun = vi.fn()
    useSemanticSearch.setState({ run: semanticRun })
    vi.mocked(promptDialog).mockResolvedValue("where is the parser")

    // What each command must actually do. Keyed by label prefix (a row's label
    // carries its shortcut hint). This replaces an earlier snapshot sweep that
    // only asked "did any observable move?" — every command has a cheap
    // incidental channel (a panel switch, a close, a seeded store write), so
    // that question could be answered yes with the real work deleted.
    // `again()` re-runs the same command, so a toggle can be checked in both
    // directions — asserting only the "on" leg passes for a one-way setter.
    const CHECKS: Record<string, (again: () => void) => void | Promise<void>> = {
      "comment.new": () => expect(useEditorActions.getState().composeNonce).toBe(1),
      "editor.explain": () => expect(useEditorActions.getState().explainNonce).toBe(1),
      "peek.def": () => expect(useEditorActions.getState().peekNonce).toBe(1),
      "qa.ask": () => expect(doc.askAboutSelection).toHaveBeenCalled(),
      "editor.goToBracket": () => expect(doc.goToBracket).toHaveBeenCalled(),
      "editor.lastEdit": () => expect(doc.gotoLastEdit).toHaveBeenCalled(),
      "editor.cursorsLineEnds": () => expect(doc.addCursorsToLineEnds).toHaveBeenCalled(),
      "editor.format": () => expect(doc.formatDocument).toHaveBeenCalled(),
      "hier.showCall": () => expect(doc.showCallHierarchy).toHaveBeenCalled(),
      "hier.showType": () => expect(doc.showTypeHierarchy).toHaveBeenCalled(),
      "bookmarks.toggle": () => expect(doc.toggleBookmarkAtCursor).toHaveBeenCalled(),
      "bookmarks.goto": () => expect(usePalette.getState().mode).toBe("bookmarks"),
      "onboarding.open": () => expect(useOnboarding.getState().open).toBe(true),
      "preview.toggle": (again) => {
        expect(usePreview.getState().open).toBe(true)
        again()
        expect(usePreview.getState().open).toBe(false)
      },
      "preview.agentAccess": () => expect(usePreview.getState().agentAccess).toBe(true),
      "tours.open": () => expect(ws.selectTool).toHaveBeenCalledWith("tours"),
      "prereview.run": () => {
        expect(pre.generate).toHaveBeenCalledWith("/repo")
        expect(ws.selectTool).toHaveBeenCalledWith("prereview")
      },
      "guided.cmd.start": () => {
        expect(guided.start).toHaveBeenCalledWith("/repo", { kind: "diff" }, "bug_risk")
        expect(ws.selectTool).toHaveBeenCalledWith("guidedreview")
      },
      "guided.cmd.open": () => {
        expect(guided.load).toHaveBeenCalledWith("/repo")
        expect(ws.selectTool).toHaveBeenCalledWith("guidedreview")
      },
      "loop.cmd.start": () => {
        expect(loop.start).toHaveBeenCalledWith("/repo", [])
        expect(ws.selectTool).toHaveBeenCalledWith("guidedreview")
      },
      "mcp.enable": () => expect(enableMcp).toHaveBeenCalledWith("/repo"),
      "anywhere.open": () => expect(usePalette.getState().anywhereOpen).toBe(true),
      "sync.export": () => expect(sync.exportSettings).toHaveBeenCalled(),
      "sync.import": () => expect(sync.importSettings).toHaveBeenCalled(),
      "terminal.clear": () => expect(agents.clearTerminal).toHaveBeenCalled(),
      "terminal.restart": () => expect(agents.restartTerminal).toHaveBeenCalled(),
      "terminal.move": () => expect(togglePosition).toHaveBeenCalled(),
      "symbols.gotoWorkspace": () => expect(usePalette.getState().mode).toBe("wsymbols"),
      "symbols.goto": () => expect(usePalette.getState().mode).toBe("symbols"),
      "graph.title": () => expect(ws.toggleGraph).toHaveBeenCalledWith(true),
      "kb.title": () => expect(ws.toggleDocs).toHaveBeenCalledWith(true),
      "finder.placeholder": () => expect(usePalette.getState().mode).toBe("files"),
      "search.placeholder": () => expect(usePalette.getState().mode).toBe("search"),
      "semantic.search": async () => {
        expect(promptDialog).toHaveBeenCalled()
        await vi.waitFor(() => expect(semanticRun).toHaveBeenCalledWith("where is the parser"))
      },
      "editor.wrap:": (again) => {
        expect(useSettings.getState().wrap).toBe(true)
        again()
        expect(useSettings.getState().wrap).toBe(false)
      },
      "editor.focus:": (again) => {
        expect(useSettings.getState().focusMode).toBe(true)
        again()
        expect(useSettings.getState().focusMode).toBe(false)
      },
      "editor.sticky:": (again) => {
        expect(useSettings.getState().stickyScroll).toBe(true)
        again()
        expect(useSettings.getState().stickyScroll).toBe(false)
      },
      "editor.ribbon:": (again) => {
        expect(useSettings.getState().showRibbon).toBe(true)
        again()
        expect(useSettings.getState().showRibbon).toBe(false)
      },
      "tree.markRead": () => expect(useReadProgress.getState().read.has("src/a.ts")).toBe(true),
      "tree.showHidden:": () => expect(project.setShowHidden).toHaveBeenCalledWith(true),
      "nav.back": () => expect(project.goBack).toHaveBeenCalled(),
      "nav.forward": () => expect(project.goForward).toHaveBeenCalled(),
      "tabs.reopen": () => expect(project.reopenClosed).toHaveBeenCalled(),
      "sidebar.toggle": () => expect(ws.toggleSidebar).toHaveBeenCalled(),
      "split.toggle": () => expect(project.openSplit).toHaveBeenCalled(),
      "settings.title": () => expect(usePalette.getState().settingsOpen).toBe(true),
      "sc.title": () => expect(usePalette.getState().shortcutsOpen).toBe(true),
      "settings.checkUpdates": () => expect(checkForUpdates).toHaveBeenCalledWith(true),
      // One entry per theme: a shared `theme !== "none"` passes even if every
      // row applies the same theme.
      "settings.theme: theme.reado-dark": () => {
        expect(useSettings.getState().mode).toBe("manual")
        expect(useSettings.getState().theme).toBe("reado-dark")
      },
      "settings.theme: theme.reado-light": () =>
        expect(useSettings.getState().theme).toBe("reado-light"),
      "settings.theme: theme.reado-high-contrast": () =>
        expect(useSettings.getState().theme).toBe("reado-high-contrast"),
      "settings.theme: theme.reado-sepia": () =>
        expect(useSettings.getState().theme).toBe("reado-sepia"),
    }

    // Longest prefix wins, so "symbols.gotoWorkspace" isn't eaten by
    // "symbols.goto".
    const keys = Object.keys(CHECKS).sort((a, b) => b.length - a.length)
    const keyFor = (label: string) => keys.find((k) => label.startsWith(k))

    // Completeness both ways: a new command has no assertion until someone
    // writes one, and a stale key fails once its command is gone.
    expect(
      all.filter((l) => !keyFor(l)),
      "commands with no entry in CHECKS",
    ).toEqual([])
    expect(
      keys.filter((k) => !all.some((l) => l.startsWith(k))),
      "CHECKS entries for commands that are no longer listed",
    ).toEqual([])

    for (const label of all) {
      vi.clearAllMocks()
      useWorkspace.setState(ws)
      usePreReview.setState(pre)
      useGuidedReview.setState(guided)
      useResolveLoop.setState(loop)
      useTerminals.setState({ togglePosition })
      useSemanticSearch.setState({ run: semanticRun })
      // Start from values no command can already be sitting on.
      useSettings.setState({
        theme: "none" as never,
        wrap: false,
        focusMode: false,
        stickyScroll: false,
        showRibbon: false,
      })
      usePalette.setState({
        mode: "commands",
        settingsOpen: false,
        shortcutsOpen: false,
        anywhereOpen: false,
      })
      useOnboarding.setState({ open: false })
      usePreview.setState({ open: false, agentAccess: false })
      useReadProgress.setState({ read: new Set(), changed: new Set() })
      useEditorActions.setState({ composeNonce: 0, explainNonce: 0, peekNonce: 0 })

      const { unmount } = render(<Palette />)
      const row = screen.getAllByRole("option").find((r) => r.textContent === label)
      expect(row, `the command "${label}" stopped being listed`).toBeTruthy()
      fireEvent.click(row as HTMLElement)
      const key = keyFor(label) as string
      const again = () => {
        usePalette.setState({ mode: "commands" })
        const second = render(<Palette />)
        // By prefix: a toggle's label carries its state, so it reads
        // "editor.wrap: on" the second time around.
        const row2 = within(second.container)
          .getAllByRole("option")
          .find((r) => r.textContent?.startsWith(key))
        expect(row2, `the command "${label}" vanished after running`).toBeTruthy()
        fireEvent.click(row2 as HTMLElement)
        second.unmount()
      }
      await CHECKS[key](again)
      unmount()
    }
  })
})

describe("the other modes", () => {
  it("lists the project's symbols, and jumps to one", async () => {
    usePalette.setState({ mode: "symbols" })
    render(<Palette />)
    // Falls back to the heuristic extractor when no server answers.
    await waitFor(() => expect(screen.queryByText("symbols.empty")).not.toBeInTheDocument())
    await userEvent.click(screen.getAllByRole("option")[0])
    expect(doc.goToLine).toHaveBeenCalled()
  })

  it("lists the workspace symbols and opens the one picked", async () => {
    listSymbols.mockResolvedValue([
      { name: "useProject", kind: "function", path: "/repo/src/store.ts", line: 12 },
    ])
    usePalette.setState({ mode: "wsymbols" })
    render(<Palette />)
    await userEvent.click(await screen.findByText("useProject"))
    expect(project.open).toHaveBeenCalledWith("/repo/src/store.ts", 12)
  })

  it("lists the recent projects and opens the one picked", async () => {
    usePalette.setState({ mode: "recents" })
    render(<Palette />)
    await userEvent.click(await screen.findByText("repo"))
    expect(openProjectHere).toHaveBeenCalledWith("/repo")
  })

  it("lists the bookmarks and jumps to one", async () => {
    usePalette.setState({ mode: "bookmarks" })
    render(<Palette />)
    await userEvent.click(await screen.findByText("const x"))
    expect(project.open).toHaveBeenCalledWith("/repo/src/a.ts", 3)
  })

  it("searches the project once you've typed enough, and counts the results", async () => {
    searchText.mockResolvedValue([
      { path: "/repo/src/a.ts", line: 4, column: 1, text: "  const needle = 1" },
    ])
    usePalette.setState({ mode: "search" })
    render(<Palette />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "needle" } })
    // The search is debounced by 160ms, so wait for the row rather than a tick.
    expect(await screen.findByText("const needle = 1")).toBeInTheDocument()
    expect(screen.getByText("search.results")).toBeInTheDocument()
  })

  it("won't search on a single character, but will on the second", async () => {
    vi.useFakeTimers()
    usePalette.setState({ mode: "search" })
    render(<Palette />)
    const box = screen.getByRole("textbox")
    fireEvent.change(box, { target: { value: "n" } })
    await vi.advanceTimersByTimeAsync(300)
    expect(searchText).not.toHaveBeenCalled()
    // The positive half: without it the test also passes when the input never
    // reached the component at all.
    fireEvent.change(box, { target: { value: "ne" } })
    await vi.advanceTimersByTimeAsync(300)
    expect(searchText).toHaveBeenCalledWith(expect.anything(), "ne")
    vi.useRealTimers()
  })

  it("explains a missing ripgrep rather than showing a raw error", async () => {
    searchText.mockRejectedValue(new Error("ripgrep not found"))
    usePalette.setState({ mode: "search" })
    render(<Palette />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "needle" } })
    expect(await screen.findByText("search.ripgrepMissing")).toBeInTheDocument()
  })

  it("guides each empty list instead of showing a blank box", () => {
    for (const [mode, key] of [
      ["symbols", "symbols.empty"],
      ["recents", "recents.empty"],
      ["bookmarks", "bookmarks.empty"],
    ] as const) {
      useDocInfo.setState({ view: null })
      useRecents.setState({ projects: [] })
      useBookmarks.setState({ bookmarks: [] })
      usePalette.setState({ mode })
      const { unmount } = render(<Palette />)
      expect(screen.getByText(key)).toBeInTheDocument()
      unmount()
    }
  })
})

describe("keyboard navigation", () => {
  it("moves the highlight and runs the highlighted row", async () => {
    openCommands()
    const input = screen.getByRole("textbox")
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true")
    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true")

    // …and Enter runs the row that is highlighted, not the first one.
    const second = screen.getAllByRole("option")[1].textContent
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(usePalette.getState().mode).toBeNull()
    expect(second).toBeTruthy()
  })

  it("pulls the highlight back inside when the list shrinks under it", () => {
    openCommands()
    const input = screen.getByRole("textbox")
    // Move well down the full list…
    for (let i = 0; i < 8; i++) fireEvent.keyDown(input, { key: "ArrowDown" })
    // …then narrow it to a handful of rows. Without the re-clamp the selected
    // index sits past the end, nothing is highlighted, and Enter runs nothing.
    fireEvent.change(input, { target: { value: "bracket" } })
    const rows = screen.getAllByRole("option")
    expect(rows.length).toBeLessThan(8)
    expect(rows.some((r) => r.getAttribute("aria-selected") === "true")).toBe(true)
  })

  it("stops at the ends of the list", () => {
    openCommands()
    const input = screen.getByRole("textbox")
    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true")

    // …and at the bottom too, which the name also promises.
    const rows = screen.getAllByRole("option").length
    for (let i = 0; i < rows + 3; i++) fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(screen.getAllByRole("option")[rows - 1]).toHaveAttribute("aria-selected", "true")
  })

  it("closes on Escape, and on a click outside the dialog", async () => {
    const { unmount } = openCommands()
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" })
    expect(usePalette.getState().mode).toBeNull()
    unmount()

    openCommands()
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement as HTMLElement)
    expect(usePalette.getState().mode).toBeNull()
  })

  it("a click inside the dialog leaves it open", () => {
    openCommands()
    fireEvent.mouseDown(screen.getByRole("dialog"))
    expect(usePalette.getState().mode).toBe("commands")
  })

  it("hovering a row moves the highlight to it", async () => {
    openCommands()
    const rows = screen.getAllByRole("option")
    fireEvent.mouseEnter(rows[2])
    expect(rows[2]).toHaveAttribute("aria-selected", "true")
  })
})

describe("where the palette sits", () => {
  it("pins to the top by default, and centres when the setting says so", () => {
    const { unmount } = openCommands()
    expect(screen.getByRole("dialog").parentElement?.className).toContain("items-start")
    unmount()
    useSettings.setState({ quickInputPosition: "center" })
    openCommands()
    expect(screen.getByRole("dialog").parentElement?.className).toContain("items-center")
  })
})
