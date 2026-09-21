// Core Zustand stores — pure state logic (tabs, history, workspace, palette,
// editor actions, recents). No backend, no mocks. Runs on all 3 OSes.
import { beforeEach, describe, expect, it } from "vitest"
import { defaultLayout, useLayout } from "@/lib/layout"
import {
  clampRange,
  FONT_SIZE_RANGE,
  LINE_HEIGHT_RANGE,
  migrateSettings,
  toggleZenMode,
  useCursor,
  useEditorActions,
  usePalette,
  useProject,
  useRecents,
  useSessions,
  useSettings,
  useWorkspace,
} from "@/lib/store"

beforeEach(() => {
  useProject.setState({
    root: "",
    tabs: [],
    active: null,
    navStack: [],
    navIndex: -1,
    closedTabs: [],
    splitPath: null,
    showHidden: false,
    landing: null,
  })
  useWorkspace.setState({
    tool: "files",
    lastTool: "files",
    graphOpen: false,
    docsOpen: false,
    pendingSearch: null,
  })
  usePalette.setState({
    mode: null,
    settingsOpen: false,
    shortcutsOpen: false,
    anywhereOpen: false,
  })
  useRecents.setState({ projects: [] })
  useSessions.setState({ byRoot: {} } as never)
})

describe("useProject — tabs", () => {
  const P = () => useProject.getState()
  it("open adds a tab, sets it active, and records history", () => {
    P().open("a.ts")
    expect(P().tabs).toEqual(["a.ts"])
    expect(P().active).toBe("a.ts")
    expect(P().navStack).toHaveLength(1)
    expect(P().navIndex).toBe(0)
  })
  it("opening a second file appends and advances history", () => {
    P().open("a.ts")
    P().open("b.ts")
    expect(P().tabs).toEqual(["a.ts", "b.ts"])
    expect(P().active).toBe("b.ts")
    expect(P().navStack).toHaveLength(2)
  })
  it("re-opening the active file does not duplicate the tab or history", () => {
    P().open("a.ts", 1)
    P().open("a.ts", 5) // same path, new line → collapses
    expect(P().tabs).toEqual(["a.ts"])
    expect(P().navStack).toHaveLength(1)
    expect(P().landing?.line).toBe(5)
  })
  it("open with a line sets landing", () => {
    P().open("a.ts", 42)
    expect(P().landing).toMatchObject({ path: "a.ts", line: 42 })
  })
  it("close removes the tab and activates the last remaining when the active closed", () => {
    P().open("a.ts")
    P().open("b.ts")
    P().close("b.ts")
    expect(P().tabs).toEqual(["a.ts"])
    expect(P().active).toBe("a.ts")
    expect(P().closedTabs).toContain("b.ts")
  })
  it("closing a non-active tab keeps the active", () => {
    P().open("a.ts")
    P().open("b.ts")
    P().close("a.ts")
    expect(P().active).toBe("b.ts")
  })
  it("moveTab reorders: before a target, to the end, and ignores no-ops", () => {
    P().open("a.ts")
    P().open("b.ts")
    P().open("c.ts")
    // Move c before a.
    P().moveTab("c.ts", "a.ts")
    expect(P().tabs).toEqual(["c.ts", "a.ts", "b.ts"])
    // Move c to the end (beforePath null).
    P().moveTab("c.ts", null)
    expect(P().tabs).toEqual(["a.ts", "b.ts", "c.ts"])
    // No-op and unknown path leave the order unchanged.
    P().moveTab("a.ts", "a.ts")
    P().moveTab("zzz.ts", "a.ts")
    expect(P().tabs).toEqual(["a.ts", "b.ts", "c.ts"])
  })
  it("reopenClosed restores the last closed tab", () => {
    P().open("a.ts")
    P().close("a.ts")
    P().reopenClosed()
    expect(P().tabs).toContain("a.ts")
    expect(P().active).toBe("a.ts")
  })
  it("reopenClosed is a no-op with nothing closed", () => {
    const before = P().tabs
    P().reopenClosed()
    expect(P().tabs).toBe(before)
  })
  it("cycleTab wraps forward and backward; no-op under 2 tabs", () => {
    P().open("a.ts")
    P().cycleTab(1)
    expect(P().active).toBe("a.ts") // <2 tabs
    P().open("b.ts")
    P().open("c.ts")
    useProject.setState({ active: "a.ts" })
    P().cycleTab(1)
    expect(P().active).toBe("b.ts")
    P().cycleTab(-1)
    expect(P().active).toBe("a.ts")
    P().cycleTab(-1)
    expect(P().active).toBe("c.ts") // wraps
  })
  it("closeOthers keeps only the given tab", () => {
    P().open("a.ts")
    P().open("b.ts")
    P().closeOthers("a.ts")
    expect(P().tabs).toEqual(["a.ts"])
    expect(P().active).toBe("a.ts")
  })
  it("closeToRight trims tabs after the given one", () => {
    for (const p of ["a.ts", "b.ts", "c.ts"]) P().open(p)
    P().closeToRight("a.ts")
    expect(P().tabs).toEqual(["a.ts"])
  })
  it("closeAll empties tabs", () => {
    P().open("a.ts")
    P().closeAll()
    expect(P().tabs).toEqual([])
    expect(P().active).toBeNull()
  })
  it("renamePath repoints an open tab and the active path", () => {
    P().open("old.ts")
    P().renamePath("old.ts", "new.ts")
    expect(P().tabs).toEqual(["new.ts"])
    expect(P().active).toBe("new.ts")
  })
  it("setActive / setShowHidden / bumpTree / collapseTree", () => {
    P().open("a.ts")
    P().open("b.ts")
    P().setActive("a.ts")
    expect(P().active).toBe("a.ts")
    P().setShowHidden(true)
    expect(P().showHidden).toBe(true)
    // It mirrors into settings, which is what survives a restart.
    expect(useSettings.getState().showHidden).toBe(true)
    const t = P().treeNonce
    P().bumpTree()
    expect(P().treeNonce).toBe(t + 1)
    const c = P().collapseNonce
    useProject.setState({ expandedDirs: ["src", "src/lib"] })
    P().collapseTree()
    expect(P().collapseNonce).toBe(c + 1)
    // The nonce only asks the tree to redraw — the collapse itself is the list.
    expect(P().expandedDirs).toEqual([])
  })
})

describe("useProject — history & split", () => {
  const P = () => useProject.getState()
  it("goBack / goForward walk the nav stack within bounds", () => {
    P().open("a.ts")
    P().open("b.ts")
    P().goBack()
    expect(P().active).toBe("a.ts")
    P().goForward()
    expect(P().active).toBe("b.ts")
    P().goForward() // at the end → no-op
    expect(P().active).toBe("b.ts")
  })
  it("opening after a goBack drops the forward branch", () => {
    P().open("a.ts")
    P().open("b.ts")
    P().open("c.ts")
    P().goBack()
    P().goBack()
    P().open("d.ts")
    // Without the truncation, Forward would walk on to b/c — a history that
    // never happened.
    expect(P().navStack.map((e) => e.path)).toEqual(["a.ts", "d.ts"])
    P().goForward()
    expect(P().active).toBe("d.ts")
  })

  it("goBack is a no-op at the start", () => {
    P().open("a.ts")
    P().goBack()
    expect(P().active).toBe("a.ts")
  })
  it("closing the active tab falls back to the last tab, not the leftmost", () => {
    P().open("a.ts")
    P().open("b.ts")
    P().open("c.ts")
    P().open("d.ts")
    P().setActive("b.ts")
    P().close("b.ts")
    // Four tabs, closing the second: "the last one" and "the one to the right"
    // are different answers here, and the product picks the last.
    expect(P().active).toBe("d.ts")
  })

  it("reopenClosed brings back the most recently closed tab, not the oldest", () => {
    P().open("a.ts")
    P().open("b.ts")
    P().close("a.ts")
    P().close("b.ts")
    P().reopenClosed()
    expect(P().active).toBe("b.ts")
    P().reopenClosed()
    expect(P().active).toBe("a.ts")
  })

  it("openSplit uses the active path by default; swap/close work", () => {
    P().open("a.ts")
    P().openSplit()
    expect(P().splitPath).toBe("a.ts")
    P().open("b.ts")
    P().swapSplit()
    expect(P().active).toBe("a.ts")
    expect(P().splitPath).toBe("b.ts")
    P().closeSplit()
    expect(P().splitPath).toBeNull()
  })
  it("init seeds tabs/active/history from a session", () => {
    P().init(
      "/root",
      {
        isRepo: true,
        branch: "main",
        ahead: 0,
        behind: 0,
        hasRemote: false,
        hasUpstream: false,
        changedFiles: 0,
      },
      { id: "s", tabs: ["x.ts"], active: "x.ts" } as never,
    )
    expect(P().root).toBe("/root")
    expect(P().git.branch).toBe("main")
    expect(P().tabs).toEqual(["x.ts"])
    expect(P().navIndex).toBe(0)
  })
})

describe("useWorkspace", () => {
  const W = () => useWorkspace.getState()
  it("openTool shows a tool and keeps showing it", () => {
    // "Open View ▸ Files" and ⌘⇧E used to route through `selectTool`, so using
    // them while that view was already up collapsed the sidebar — a menu item
    // called *Open* that closed, and VS Code's shortcuts doing the opposite of
    // what they do there.
    W().openTool("git")
    expect(W().tool).toBe("git")
    W().openTool("git")
    expect(W().tool).toBe("git")
  })

  it("openTool switches between tools without a detour through closed", () => {
    W().openTool("git")
    W().openTool("search")
    expect(W().tool).toBe("search")
    expect(W().lastTool).toBe("search")
  })

  it("selectTool toggles the same tool off", () => {
    W().selectTool("git")
    expect(W().tool).toBe("git")
    W().selectTool("git")
    expect(W().tool).toBeNull()
  })
  it("brings a docked tool forward instead of copying it into the sidebar", () => {
    // Problems ships as a tab beside the terminal, and the region may be hidden.
    useLayout.setState({
      layout: defaultLayout(),
      hidden: { left: false, right: false, bottom: true },
    })
    W().selectTool("problems")
    // Not in the sidebar — it is already on screen, in its dock group.
    expect(W().tool).not.toBe("problems")
    const bottom = useLayout.getState().layout.areas.bottom.groups[0]
    expect(bottom.active).toBe("problems")
    // The region is shown (a dead-looking button was the whole bug) and the
    // neighbours are still there: a tab switch closes nothing.
    expect(useLayout.getState().hidden.bottom).toBe(false)
    expect(bottom.tabs).toEqual(["terminal", "output", "problems"])
  })

  it("toggleSidebar hides then restores the last tool", () => {
    W().selectTool("search")
    W().toggleSidebar()
    expect(W().tool).toBeNull()
    W().toggleSidebar()
    expect(W().tool).toBe("search")
  })
  it("searchFor opens search with a pending query; clearPendingSearch clears it", () => {
    W().searchFor("needle")
    expect(W().tool).toBe("search")
    expect(W().pendingSearch).toBe("needle")
    W().clearPendingSearch()
    expect(W().pendingSearch).toBeNull()
  })
  it("toggleGraph / toggleDocs flip and accept an explicit value", () => {
    W().toggleGraph()
    expect(W().graphOpen).toBe(true)
    W().toggleGraph(false)
    expect(W().graphOpen).toBe(false)
    W().toggleDocs(true)
    expect(W().docsOpen).toBe(true)
  })
  it("setSidebarWidth clamps to [180, innerWidth-360]", () => {
    W().setSidebarWidth(10)
    expect(W().sidebarWidth).toBe(180)
    W().setSidebarWidth(99999)
    expect(W().sidebarWidth).toBe(window.innerWidth - 360)
  })
})

describe("clampRange — editor reading controls", () => {
  it("clamps below/above the range to its bounds", () => {
    expect(clampRange(4, FONT_SIZE_RANGE)).toBe(FONT_SIZE_RANGE.min)
    expect(clampRange(999, FONT_SIZE_RANGE)).toBe(FONT_SIZE_RANGE.max)
    expect(clampRange(0.5, LINE_HEIGHT_RANGE)).toBe(LINE_HEIGHT_RANGE.min)
    expect(clampRange(9, LINE_HEIGHT_RANGE)).toBe(LINE_HEIGHT_RANGE.max)
  })
  it("passes an in-range value through", () => {
    expect(clampRange(14, FONT_SIZE_RANGE)).toBe(14)
    expect(clampRange(1.6, LINE_HEIGHT_RANGE)).toBe(1.6)
  })
  it("falls back to the range default for a non-finite value", () => {
    expect(clampRange(NaN, FONT_SIZE_RANGE)).toBe(FONT_SIZE_RANGE.default)
    expect(clampRange(Infinity, LINE_HEIGHT_RANGE)).toBe(LINE_HEIGHT_RANGE.default)
  })
})

describe("usePalette", () => {
  const Q = () => usePalette.getState()
  it("open/close set the mode", () => {
    Q().open("files")
    expect(Q().mode).toBe("files")
    Q().close()
    expect(Q().mode).toBeNull()
  })
  it("toggleSettings/Shortcuts/Anywhere flip and clear the palette mode", () => {
    Q().open("commands")
    Q().toggleSettings()
    expect(Q().settingsOpen).toBe(true)
    expect(Q().mode).toBeNull()
    Q().toggleShortcuts(true)
    expect(Q().shortcutsOpen).toBe(true)
    Q().toggleAnywhere(true)
    expect(Q().anywhereOpen).toBe(true)
  })
})

describe("useEditorActions", () => {
  const E = () => useEditorActions.getState()
  it("request* bump their nonces", () => {
    const c = E().composeNonce
    E().requestCompose()
    expect(E().composeNonce).toBe(c + 1)
    const x = E().explainNonce
    E().requestExplain()
    expect(E().explainNonce).toBe(x + 1)
    const p = E().peekNonce
    E().requestPeek()
    expect(E().peekNonce).toBe(p + 1)
  })
  it("boolean/state setters", () => {
    E().setEditing(true)
    expect(E().editing).toBe(true)
    E().setDirty("src/a.ts", true)
    expect(E().isDirty("src/a.ts")).toBe(true)
    E().setDiffing(true)
    expect(E().diffing).toBe(true)
    E().setDiffBase("HEAD~1")
    expect(E().diffBase).toBe("HEAD~1")
    E().setBlame(true)
    expect(E().blame).toBe(true)
  })
})

describe("useCursor / useRecents / useSessions", () => {
  it("useCursor.set updates line and column", () => {
    useCursor.getState().set(12, 3)
    expect(useCursor.getState()).toMatchObject({ line: 12, col: 3 })
  })
  it("useRecents.touch adds + moves to front; remove drops it", () => {
    useRecents.getState().touch("/a")
    useRecents.getState().touch("/b")
    useRecents.getState().touch("/a") // bump to front
    expect(useRecents.getState().projects[0].path).toBe("/a")
    useRecents.getState().remove("/a")
    expect(useRecents.getState().projects.find((p) => p.path === "/a")).toBeUndefined()
  })
  it("useRecents keeps at most 30 projects", () => {
    for (let i = 0; i < 35; i++) useRecents.getState().touch(`/p${i}`)
    // The list is persisted — uncapped it grows for the life of the install.
    expect(useRecents.getState().projects).toHaveLength(30)
    expect(useRecents.getState().projects[0].path).toBe("/p34")
  })
})

describe("useSessions — save preserves per-file state", () => {
  const S = () => useSessions.getState()
  it("save (tabs/active) does NOT wipe scroll/cursor/expanded/split", () => {
    // Seed a session that already carries scroll + cursor + drill-down + split.
    useSessions.setState({
      byRoot: {
        "/root": {
          tabs: ["a.ts"],
          active: "a.ts",
          scroll: { "a.ts": 120 },
          cursor: { "a.ts": { line: 4, col: 2 } },
          expanded: ["src"],
          split: "b.ts",
        },
      },
    } as never)
    // A plain tab save (no scroll/cursor/expanded/split on the payload).
    S().save("/root", { tabs: ["a.ts", "b.ts"], active: "b.ts" })
    const sess = S().byRoot["/root"]
    // Tabs/active updated…
    expect(sess.tabs).toEqual(["a.ts", "b.ts"])
    expect(sess.active).toBe("b.ts")
    // …but the preserved-via-`?? prev` fields survive (regression guard).
    expect(sess.scroll).toEqual({ "a.ts": 120 })
    expect(sess.cursor).toEqual({ "a.ts": { line: 4, col: 2 } })
    expect(sess.expanded).toEqual(["src"])
    expect(sess.split).toBe("b.ts")
  })

  it("saveScroll updates only scroll and keeps tabs/active/cursor", () => {
    useSessions.setState({
      byRoot: {
        "/root": {
          tabs: ["a.ts"],
          active: "a.ts",
          scroll: { "a.ts": 10 },
          cursor: { "a.ts": { line: 1, col: 1 } },
        },
      },
    } as never)
    S().saveScroll("/root", "b.ts", 250)
    const sess = S().byRoot["/root"]
    // New scroll entry merged in, existing one kept.
    expect(sess.scroll).toEqual({ "a.ts": 10, "b.ts": 250 })
    // Everything else untouched.
    expect(sess.tabs).toEqual(["a.ts"])
    expect(sess.active).toBe("a.ts")
    expect(sess.cursor).toEqual({ "a.ts": { line: 1, col: 1 } })
  })

  it("saveCursor merges a cursor without touching scroll", () => {
    useSessions.setState({
      byRoot: { "/root": { tabs: ["a.ts"], active: "a.ts", scroll: { "a.ts": 10 } } },
    } as never)
    S().saveCursor("/root", "a.ts", 7, 3)
    const sess = S().byRoot["/root"]
    expect(sess.cursor).toEqual({ "a.ts": { line: 7, col: 3 } })
    expect(sess.scroll).toEqual({ "a.ts": 10 })
  })
})

describe("useWorkspace — setCommentFilter (partial patch)", () => {
  const W = () => useWorkspace.getState()
  it("patches one field and leaves the others intact", () => {
    useWorkspace.setState({
      commentFilter: { view: "open", type: "all", state: "all", thisFile: false },
    })
    W().setCommentFilter({ type: "bug" })
    expect(W().commentFilter).toEqual({
      view: "open",
      type: "bug",
      state: "all",
      thisFile: false,
    })
    // A second patch on a different field composes without resetting the first.
    W().setCommentFilter({ thisFile: true })
    expect(W().commentFilter).toEqual({
      view: "open",
      type: "bug",
      state: "all",
      thisFile: true,
    })
  })
})

describe("useProject — toggleDir (tree drill-down)", () => {
  const P = () => useProject.getState()
  beforeEach(() => useProject.setState({ expandedDirs: [] }))
  it("toggling adds then removes a dir from expandedDirs", () => {
    P().toggleDir("src")
    expect(P().expandedDirs).toEqual(["src"])
    P().toggleDir("src")
    expect(P().expandedDirs).toEqual([])
  })
  it("explicit open flag is idempotent (no-op when already in that state)", () => {
    P().toggleDir("src", true)
    const first = P().expandedDirs
    P().toggleDir("src", true) // already open → no state change
    expect(P().expandedDirs).toBe(first)
    P().toggleDir("src", false)
    expect(P().expandedDirs).toEqual([])
  })
})

describe("the view a file opens in", () => {
  beforeEach(() => {
    useEditorActions.setState({ pendingView: null, diffing: false, resolvingConflict: false })
  })

  it("hands the request over exactly once", () => {
    // The editor consumes it when the file opens; the file after that must get
    // the plain view, not inherit this one.
    useEditorActions.getState().requestView("diff")
    expect(useEditorActions.getState().takePendingView()).toBe("diff")
    expect(useEditorActions.getState().takePendingView()).toBeNull()
  })

  it("carries a conflict request as distinct from a diff", () => {
    useEditorActions.getState().requestView("conflict")
    expect(useEditorActions.getState().takePendingView()).toBe("conflict")
  })

  it("a later request replaces an unconsumed one", () => {
    // Two clicks before a render: the second is what the user meant.
    useEditorActions.getState().requestView("diff")
    useEditorActions.getState().requestView("conflict")
    expect(useEditorActions.getState().takePendingView()).toBe("conflict")
  })
})

// Zen mode has to be reversible: it moves four chrome switches and the sidebar
// at once, and a reader who runs without a status bar must not be handed one
// back on the way out.
describe("zen mode", () => {
  beforeEach(() => {
    useSettings.getState().set({
      zenMode: false,
      zenRestore: null,
      showActivityBar: true,
      showStatusBar: false,
      showBreadcrumbs: true,
      centeredLayout: false,
    })
    useWorkspace.setState({ tool: "files", lastTool: "files" })
  })

  it("puts the chrome away and gives back exactly what it took", () => {
    toggleZenMode(true)
    const inZen = useSettings.getState()
    expect(inZen.zenMode).toBe(true)
    expect(inZen.showActivityBar).toBe(false)
    expect(inZen.showBreadcrumbs).toBe(false)
    expect(inZen.centeredLayout).toBe(true)
    expect(useWorkspace.getState().tool).toBeNull()

    toggleZenMode(false)
    const out = useSettings.getState()
    expect(out.zenMode).toBe(false)
    expect(out.showActivityBar).toBe(true)
    // Off before zen, so off after it — not "restored" to a default it never had.
    expect(out.showStatusBar).toBe(false)
    expect(out.showBreadcrumbs).toBe(true)
    expect(out.centeredLayout).toBe(false)
    expect(useWorkspace.getState().tool).toBe("files")
    expect(out.zenRestore).toBeNull()
  })

  it("entering twice doesn't overwrite the restore point", () => {
    toggleZenMode(true)
    const snapshot = useSettings.getState().zenRestore
    toggleZenMode(true)
    expect(useSettings.getState().zenRestore).toEqual(snapshot)
  })

  it("leaving without a restore point leaves the chrome alone", () => {
    // A zen flag persisted by an older build, with nothing recorded to go back to.
    useSettings.getState().set({ zenMode: true, zenRestore: null, showActivityBar: false })
    toggleZenMode(false)
    expect(useSettings.getState().zenMode).toBe(false)
    expect(useSettings.getState().showActivityBar).toBe(false)
  })
})

describe("the navigation history", () => {
  const project = () => useProject.getState()

  beforeEach(() => {
    useProject.setState({
      root: "/repo",
      tabs: [],
      active: null,
      navStack: [],
      navIndex: -1,
      closedTabs: [],
      landing: null,
      splitPath: null,
    })
  })

  it("records each open, and walks back and forward through them", () => {
    project().open("/repo/a.ts")
    project().open("/repo/b.ts")
    project().goBack()
    expect(project().active).toBe("/repo/a.ts")
    project().goForward()
    expect(project().active).toBe("/repo/b.ts")
  })

  it("stops at both ends rather than falling off", () => {
    project().open("/repo/a.ts")
    project().goBack()
    project().goBack()
    expect(project().active).toBe("/repo/a.ts")
    project().goForward()
    project().goForward()
    expect(project().active).toBe("/repo/a.ts")
  })

  it("re-opens a tab that was closed while it sat in the history", () => {
    project().open("/repo/a.ts")
    project().open("/repo/b.ts")
    project().close("/repo/a.ts")
    project().goBack()
    expect(project().tabs).toContain("/repo/a.ts")
  })

  it("carries the line to land on, bumping the nonce so a repeat jump still fires", () => {
    project().open("/repo/a.ts", 12)
    const first = project().landing?.nonce ?? 0
    project().open("/repo/b.ts", 3)
    project().goBack()
    expect(project().landing).toMatchObject({ path: "/repo/a.ts", line: 12 })
    expect(project().landing?.nonce).toBeGreaterThan(first)
  })

  it("keeps the previous landing when a history entry has no line", () => {
    project().open("/repo/a.ts", 12)
    project().open("/repo/b.ts")
    project().goBack()
    project().goForward()
    expect(project().landing?.path).toBe("/repo/a.ts")
  })

  it("re-opening the same file at a new line updates the entry instead of adding one", () => {
    project().open("/repo/a.ts", 1)
    const depth = project().navStack.length
    project().open("/repo/a.ts", 40)
    expect(project().navStack).toHaveLength(depth)
    expect(project().landing).toMatchObject({ line: 40 })
  })
})

describe("the tab strip", () => {
  const project = () => useProject.getState()

  beforeEach(() => {
    useProject.setState({
      root: "/repo",
      tabs: ["/a.ts", "/b.ts", "/c.ts"],
      active: "/b.ts",
      closedTabs: [],
      navStack: [],
      navIndex: -1,
    })
  })

  it("cycles forward and backward, wrapping at both ends", () => {
    project().cycleTab(1)
    expect(project().active).toBe("/c.ts")
    project().cycleTab(1)
    expect(project().active).toBe("/a.ts")
    project().cycleTab(-1)
    expect(project().active).toBe("/c.ts")
  })

  it("won't cycle a single tab", () => {
    useProject.setState({ tabs: ["/a.ts"], active: "/a.ts" })
    project().cycleTab(1)
    expect(project().active).toBe("/a.ts")
  })

  it("closes the others, and the ones to the right", () => {
    project().closeOthers("/b.ts")
    expect(project().tabs).toEqual(["/b.ts"])
    useProject.setState({ tabs: ["/a.ts", "/b.ts", "/c.ts"], active: "/c.ts" })
    project().closeToRight("/a.ts")
    expect(project().tabs).toEqual(["/a.ts"])
    expect(project().active).toBe("/a.ts")
  })

  it("ignores a close-others or close-to-right for a file that isn't open", () => {
    project().closeOthers("/nope.ts")
    expect(project().tabs).toHaveLength(3)
    project().closeToRight("/nope.ts")
    expect(project().tabs).toHaveLength(3)
  })

  it("keeps the active tab when closing to the right of it", () => {
    useProject.setState({ tabs: ["/a.ts", "/b.ts", "/c.ts"], active: "/a.ts" })
    project().closeToRight("/b.ts")
    expect(project().active).toBe("/a.ts")
  })

  it("reopens the most recently closed tab, once", () => {
    project().close("/b.ts")
    project().reopenClosed()
    expect(project().tabs).toContain("/b.ts")
    project().reopenClosed()
    expect(project().tabs.filter((t) => t === "/b.ts")).toHaveLength(1)
  })

  it("moves a tab before another, or to the end", () => {
    project().moveTab("/a.ts", "/c.ts")
    expect(project().tabs).toEqual(["/b.ts", "/a.ts", "/c.ts"])
    project().moveTab("/b.ts", null)
    expect(project().tabs).toEqual(["/a.ts", "/c.ts", "/b.ts"])
  })

  it("ignores a move of a tab that isn't open, or onto itself", () => {
    const before = project().tabs
    project().moveTab("/a.ts", "/a.ts")
    project().moveTab("/nope.ts", "/a.ts")
    expect(project().tabs).toEqual(before)
  })

  it("re-points a tab after its file moved on disk", () => {
    project().renamePath("/b.ts", "/moved/b.ts")
    expect(project().tabs).toContain("/moved/b.ts")
    expect(project().active).toBe("/moved/b.ts")
  })

  it("closes them all", () => {
    project().closeAll()
    expect(project().tabs).toEqual([])
    expect(project().active).toBeNull()
  })
})

describe("the split editor", () => {
  const project = () => useProject.getState()

  it("opens on the active file, and swaps sides", () => {
    useProject.setState({ tabs: ["/a.ts"], active: "/a.ts", splitPath: null })
    project().openSplit()
    expect(project().splitPath).toBe("/a.ts")
    useProject.setState({ active: "/a.ts", splitPath: "/b.ts" })
    project().swapSplit()
    expect(project().active).toBe("/b.ts")
    expect(project().splitPath).toBe("/a.ts")
  })

  it("swaps nothing when there is no split", () => {
    useProject.setState({ active: "/a.ts", splitPath: null })
    project().swapSplit()
    expect(project().active).toBe("/a.ts")
  })
})

describe("zen mode", () => {
  it("records the chrome it hides, and gives it back on the way out", () => {
    useSettings.setState({
      zenMode: false,
      showActivityBar: true,
      showStatusBar: true,
      showBreadcrumbs: true,
    })
    toggleZenMode(true)
    expect(useSettings.getState().zenMode).toBe(true)
    expect(useSettings.getState().showActivityBar).toBe(false)
    toggleZenMode(false)
    expect(useSettings.getState().showActivityBar).toBe(true)
    expect(useSettings.getState().showStatusBar).toBe(true)
  })

  it("is a no-op when it is already in the state asked for", () => {
    // A restore *is* pending: without the early return this would spend it and
    // put the chrome back to what it was before zen.
    useSettings.setState({
      zenMode: false,
      zenRestore: {
        showActivityBar: false,
        showStatusBar: false,
        showBreadcrumbs: false,
        centeredLayout: true,
        tool: null,
      },
      showActivityBar: true,
    })
    toggleZenMode(false)
    expect(useSettings.getState().showActivityBar).toBe(true)
    expect(useSettings.getState().zenRestore).not.toBeNull()
  })

  it("toggles when told nothing", () => {
    useSettings.setState({ zenMode: false })
    toggleZenMode()
    expect(useSettings.getState().zenMode).toBe(true)
    toggleZenMode()
    expect(useSettings.getState().zenMode).toBe(false)
  })
})

describe("resetting the settings", () => {
  it("puts preferences back to how Reado ships", () => {
    useSettings.setState({ fontSize: 22, theme: "reado-sepia", wrap: false })
    useSettings.getState().reset()
    const s = useSettings.getState()
    expect(s.fontSize).toBe(12)
    expect(s.theme).toBe("reado-dark")
    expect(s.wrap).toBe(true)
  })

  it("keeps the answers the user already gave", () => {
    // Resetting these would re-ask a dismissed question, or throw away where
    // the user was rather than how they like things.
    useSettings.setState({
      defaultAppsDismissed: true,
      gitignoreDontAsk: true,
      reviewObjective: "perf",
      fontSize: 22,
    })
    useSettings.getState().reset()
    const s = useSettings.getState()
    expect(s.defaultAppsDismissed).toBe(true)
    expect(s.gitignoreDontAsk).toBe(true)
    expect(s.reviewObjective).toBe("perf")
    expect(s.fontSize).toBe(12)
  })
})

describe("preview and pinned tabs", () => {
  const P = () => useProject.getState()

  beforeEach(() => {
    useProject.setState({ tabs: [], active: null, previewPath: null, pinnedTabs: [] })
    useSettings.setState({ previewTabs: true })
  })

  it("replaces the outgoing preview in place, instead of adding a tab", () => {
    // The whole point: a session of reading leaves one tab behind, not forty.
    P().openPreview("/a.ts")
    P().openPreview("/b.ts")
    expect(P().tabs).toEqual(["/b.ts"])
    expect(P().previewPath).toBe("/b.ts")
  })

  it("leaves an already-open tab exactly where it is", () => {
    P().open("/kept.ts")
    P().openPreview("/a.ts")
    P().openPreview("/kept.ts")
    // `kept.ts` was already open and stays open; the preview is untouched.
    expect(P().tabs).toEqual(["/kept.ts", "/a.ts"])
    expect(P().previewPath).toBe("/a.ts")
  })

  it("opening a file outright promotes it out of preview", () => {
    P().openPreview("/a.ts")
    P().open("/a.ts")
    expect(P().previewPath).toBeNull()
    expect(P().tabs).toEqual(["/a.ts"])
  })

  it("falls back to an ordinary open when previews are switched off", () => {
    useSettings.setState({ previewTabs: false })
    P().openPreview("/a.ts")
    P().openPreview("/b.ts")
    expect(P().tabs).toEqual(["/a.ts", "/b.ts"])
    expect(P().previewPath).toBeNull()
  })

  it("keeps pinned tabs through every bulk close", () => {
    P().open("/pin.ts")
    P().open("/a.ts")
    P().open("/b.ts")
    P().togglePinned("/pin.ts")
    P().closeOthers("/a.ts")
    expect(P().tabs.sort()).toEqual(["/a.ts", "/pin.ts"])
    P().closeAll()
    expect(P().tabs).toEqual(["/pin.ts"])
  })

  it("forgets a pin when its tab is closed for real", () => {
    P().open("/pin.ts")
    P().togglePinned("/pin.ts")
    P().close("/pin.ts")
    expect(P().pinnedTabs).toEqual([])
  })

  it("pinning a preview keeps it", () => {
    P().openPreview("/a.ts")
    P().togglePinned("/a.ts")
    expect(P().previewPath).toBeNull()
  })
})

describe("migrating persisted settings", () => {
  it("turns on suggestions-as-you-type for an install that predates the default", () => {
    // The stored `false` was never a choice: it was what the editor shipped as,
    // and it would have outlived the new default forever — an editor that
    // suggests nothing while you type, with a setting that says it should.
    const s = migrateSettings({ suggestOnTyping: false }, 2)
    expect(s.suggestOnTyping).toBe(true)
  })

  it("leaves a v3 blob alone, so switching it back off sticks", () => {
    const s = migrateSettings({ suggestOnTyping: false }, 3)
    expect(s.suggestOnTyping).toBe(false)
  })

  it("still repairs the older shapes on the way through", () => {
    const s = migrateSettings({ fileIcons: "plain", fontSize: 9999, lineHeight: 0 }, 0)
    expect(s.fileIcons).toBe("mono")
    expect(s.fontSize).toBe(FONT_SIZE_RANGE.max)
    expect(s.lineHeight).toBe(LINE_HEIGHT_RANGE.min)
  })
})
