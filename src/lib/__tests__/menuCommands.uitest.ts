// The native-menu dispatcher: every menu id must reach the same action the
// palette and the keyboard shortcut use. The gating itself is covered in
// menu.uitest.ts against the real stores; here every dependency is a double, so
// what's asserted is the wiring — which id runs what.
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => {
  /** An object of vi.fn()s, one per named export a module contributes. */
  const fns = (...names: string[]) =>
    Object.fromEntries(names.map((n) => [n, vi.fn()])) as Record<string, ReturnType<typeof vi.fn>>
  return {
    fns,
    docInfo: fns(
      "addCursorAbove",
      "addCursorBelow",
      "addCursorsToLineEnds",
      "addNextOccurrence",
      "askAboutSelection",
      "copyLineDownCmd",
      "copyLineUpCmd",
      "duplicateSelection",
      "expandSelectionCmd",
      "findReferencesAtCursor",
      "formatDocument",
      "goToBracket",
      "goToDefinitionAtCursor",
      "goToImplementationAtCursor",
      "goToTypeDefinitionAtCursor",
      "gotoLastEdit",
      "moveLineDownCmd",
      "moveLineUpCmd",
      "newFile",
      "nextProblem",
      "openFind",
      "openGotoLine",
      "openReplace",
      "prevProblem",
      "revertFile",
      "saveAs",
      "saveDocument",
      "selectAllOccurrences",
      "showCallHierarchy",
      "showTypeHierarchy",
      "shrinkSelectionCmd",
      "toggleBlockCommentCmd",
      "toggleLineComment",
    ),
    agents: fns("clearTerminal", "dispatchToAgent", "launchAgent", "restartTerminal"),
    window: fns("closeProject", "openFileDialog", "openInNewWindow", "pickFolderAndOpen"),
    opener: fns("openUrl", "revealItemInDir"),
    notify: vi.fn(),
    checkForUpdates: vi.fn(),
    logPath: vi.fn<() => Promise<string | null>>(async () => "/tmp/reado.log"),
    openCount: vi.fn(() => 3),
    palette: {
      open: vi.fn(),
      toggleSettings: vi.fn(),
      toggleShortcuts: vi.fn(),
    },
    project: {
      active: "/root/a.ts" as string | null,
      splitPath: null as string | null,
      // Mid-history, so both Back and Forward are available.
      navIndex: 1,
      navStack: ["a", "b", "c"],
      closedTabs: ["c"],
      close: vi.fn(),
      reopenClosed: vi.fn(),
      cycleTab: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      openSplit: vi.fn(),
    },
    workspace: {
      searchFor: vi.fn(),
      toggleSidebar: vi.fn(),
      selectTool: vi.fn(),
      toggleGraph: vi.fn(),
      toggleDocs: vi.fn(),
    },
    settings: {
      zoom: 1,
      wrap: false,
      renderWhitespace: false,
      showRibbon: true,
      focusMode: false,
      showActivityBar: true,
      showStatusBar: true,
      showBreadcrumbs: true,
      set: vi.fn(),
    },
    terminals: {
      sessions: [{ id: "t1" }],
      toggle: vi.fn(),
      add: vi.fn(),
      split: vi.fn(),
    },
    editorActions: { requestExplain: vi.fn(), requestPeek: vi.fn() },
  }
})

vi.mock("../docInfo", () => ({ ...h.docInfo, useDocInfo: { getState: () => ({ view: null }) } }))
vi.mock("../agents", () => h.agents)
vi.mock("../window", () => h.window)
vi.mock("@tauri-apps/plugin-opener", () => h.opener)
const listen = vi.hoisted(() =>
  vi.fn<(event: string, cb: (e: { payload: string }) => void) => Promise<() => void>>(
    async () => () => {},
  ),
)
vi.mock("@tauri-apps/api/event", () => ({ listen }))
vi.mock("../notice", () => ({ notify: h.notify }))
vi.mock("../updater", () => ({ checkForUpdates: h.checkForUpdates }))
vi.mock("../logger", () => ({ logPath: h.logPath }))
vi.mock("../review", () => ({ composeReviewPrompt: (n: number) => `review ${n}` }))
vi.mock("../comments", () => ({
  openCount: h.openCount,
  useComments: { getState: () => ({ comments: [] }) },
}))
vi.mock("../diagnostics", () => ({ useDiagnostics: { getState: () => ({ byFile: { a: [1] } }) } }))
vi.mock("../terminals", () => ({ useTerminals: { getState: () => h.terminals } }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))
vi.mock("../store", () => ({
  usePalette: { getState: () => h.palette },
  useProject: { getState: () => h.project },
  useWorkspace: { getState: () => h.workspace },
  useSettings: { getState: () => h.settings },
  useEditorActions: { getState: () => h.editorActions },
}))

import { listenForMenu, runMenuCommand } from "@/lib/menu"

const { agents, docInfo, editorActions, opener, palette, project, settings, terminals, workspace } =
  h

beforeEach(() => {
  vi.clearAllMocks()
  h.logPath.mockResolvedValue("/tmp/reado.log")
  h.openCount.mockReturnValue(3)
  Object.assign(h.settings, { zoom: 1, wrap: false, focusMode: false })
  Object.assign(h.project, { active: "/root/a.ts", splitPath: null })
})

describe("submenus addressed by id prefix", () => {
  it("picks a theme and pins the mode to manual", () => {
    runMenuCommand("theme:reado-dark")
    expect(settings.set).toHaveBeenCalledWith({ theme: "reado-dark", mode: "manual" })
  })

  it("sets the auto-save policy", () => {
    runMenuCommand("autosave:afterDelay")
    expect(settings.set).toHaveBeenCalledWith({ autoSave: "afterDelay" })
  })
})

describe("file commands", () => {
  const cases: Array<[string, () => unknown]> = [
    ["window:new", () => h.window.openInNewWindow],
    ["openFile", () => h.window.openFileDialog],
    ["openFolder", () => h.window.pickFolderAndOpen],
    ["closeProject", () => h.window.closeProject],
    ["newFile", () => docInfo.newFile],
    ["saveAs", () => docInfo.saveAs],
    ["save", () => docInfo.saveDocument],
    ["format", () => docInfo.formatDocument],
    ["revert", () => docInfo.revertFile],
  ]
  for (const [id, fn] of cases) {
    it(`${id} runs its action`, () => {
      runMenuCommand(id)
      expect(fn()).toHaveBeenCalled()
    })
  }

  it("closeEditor closes the active file", () => {
    runMenuCommand("closeEditor")
    expect(project.close).toHaveBeenCalledWith("/root/a.ts")
  })

  it("openRecent opens the recents palette", () => {
    runMenuCommand("openRecent")
    expect(palette.open).toHaveBeenCalledWith("recents")
  })
})

describe("edit and selection commands", () => {
  const cases: Array<[string, () => unknown]> = [
    ["find", () => docInfo.openFind],
    ["edit:replace", () => docInfo.openReplace],
    ["edit:toggleComment", () => docInfo.toggleLineComment],
    ["edit:toggleBlockComment", () => docInfo.toggleBlockCommentCmd],
    ["gotoLine", () => docInfo.openGotoLine],
    ["sel:expand", () => docInfo.expandSelectionCmd],
    ["sel:shrink", () => docInfo.shrinkSelectionCmd],
    ["sel:addNext", () => docInfo.addNextOccurrence],
    ["sel:allOccurrences", () => docInfo.selectAllOccurrences],
    ["sel:cursorAbove", () => docInfo.addCursorAbove],
    ["sel:cursorBelow", () => docInfo.addCursorBelow],
    ["sel:lineEnds", () => docInfo.addCursorsToLineEnds],
    ["sel:duplicate", () => docInfo.duplicateSelection],
    ["sel:copyUp", () => docInfo.copyLineUpCmd],
    ["sel:copyDown", () => docInfo.copyLineDownCmd],
    ["sel:moveUp", () => docInfo.moveLineUpCmd],
    ["sel:moveDown", () => docInfo.moveLineDownCmd],
  ]
  for (const [id, fn] of cases) {
    it(`${id} runs its editor command`, () => {
      runMenuCommand(id)
      expect(fn()).toHaveBeenCalled()
    })
  }

  it("both find-in-files entries open the workspace search", () => {
    runMenuCommand("edit:findInFiles")
    runMenuCommand("edit:replaceInFiles")
    expect(workspace.searchFor).toHaveBeenCalledTimes(2)
    expect(workspace.searchFor).toHaveBeenCalledWith("")
  })

  it("sel:explain and sel:ask need a selection, so they're gated, not run", () => {
    runMenuCommand("sel:explain")
    expect(editorActions.requestExplain).not.toHaveBeenCalled()
    runMenuCommand("sel:ask")
    expect(docInfo.askAboutSelection).not.toHaveBeenCalled()
    // Each gated command says why it did nothing, rather than failing silently.
    expect(h.notify).toHaveBeenCalledTimes(2)
    expect(h.notify).toHaveBeenLastCalledWith("info", "menu.needSelection")
  })
})

describe("go commands", () => {
  it("opens each palette mode", () => {
    for (const [id, mode] of [
      ["palette:files", "files"],
      ["palette:commands", "commands"],
      ["palette:search", "search"],
      ["palette:symbols", "symbols"],
      ["palette:wsymbols", "wsymbols"],
    ]) {
      runMenuCommand(id)
      expect(palette.open).toHaveBeenLastCalledWith(mode)
    }
  })

  const cases: Array<[string, () => unknown]> = [
    ["gotodef", () => docInfo.goToDefinitionAtCursor],
    ["go:typedef", () => docInfo.goToTypeDefinitionAtCursor],
    ["go:impl", () => docInfo.goToImplementationAtCursor],
    ["go:references", () => docInfo.findReferencesAtCursor],
    ["go:callHierarchy", () => docInfo.showCallHierarchy],
    ["go:typeHierarchy", () => docInfo.showTypeHierarchy],
    ["go:bracket", () => docInfo.goToBracket],
    ["go:lastEdit", () => docInfo.gotoLastEdit],
    ["go:nextProblem", () => docInfo.nextProblem],
    ["go:prevProblem", () => docInfo.prevProblem],
  ]
  for (const [id, fn] of cases) {
    it(`${id} runs its navigation command`, () => {
      runMenuCommand(id)
      expect(fn()).toHaveBeenCalled()
    })
  }

  it("go:peek asks the editor for an inline peek", () => {
    runMenuCommand("go:peek")
    expect(editorActions.requestPeek).toHaveBeenCalled()
  })

  it("cycles tabs and walks the history", () => {
    runMenuCommand("go:nextTab")
    expect(project.cycleTab).toHaveBeenCalledWith(1)
    runMenuCommand("go:prevTab")
    expect(project.cycleTab).toHaveBeenCalledWith(-1)
    runMenuCommand("go:back")
    expect(project.goBack).toHaveBeenCalled()
    runMenuCommand("go:forward")
    expect(project.goForward).toHaveBeenCalled()
  })
})

describe("view commands", () => {
  it("toggles each boolean setting off its current value", () => {
    for (const [id, key] of [
      ["view:wrap", "wrap"],
      ["view:whitespace", "renderWhitespace"],
      ["view:ribbon", "showRibbon"],
      ["view:focus", "focusMode"],
      ["view:activityBar", "showActivityBar"],
      ["view:statusBar", "showStatusBar"],
      ["view:breadcrumbs", "showBreadcrumbs"],
    ] as const) {
      runMenuCommand(id)
      expect(settings.set).toHaveBeenLastCalledWith({
        [key]: !h.settings[key as keyof typeof h.settings],
      })
    }
  })

  it("reveals each sidebar tool", () => {
    for (const tool of ["files", "search", "comments", "outline", "git", "extensions"]) {
      runMenuCommand(`view:open:${tool}`)
      expect(workspace.selectTool).toHaveBeenLastCalledWith(tool)
    }
  })

  it("toggles the sidebar, the graph and the docs", () => {
    runMenuCommand("view:sidebar")
    expect(workspace.toggleSidebar).toHaveBeenCalled()
    runMenuCommand("graph")
    expect(workspace.toggleGraph).toHaveBeenCalledWith(true)
    runMenuCommand("docs")
    expect(workspace.toggleDocs).toHaveBeenCalledWith(true)
  })

  it("opens the split editor", () => {
    runMenuCommand("view:split")
    expect(project.openSplit).toHaveBeenCalled()
  })

  it("zooms in and out in tenths, and resets to 1", () => {
    runMenuCommand("zoom:in")
    expect(settings.set).toHaveBeenCalledWith({ zoom: 1.1 })
    runMenuCommand("zoom:out")
    expect(settings.set).toHaveBeenCalledWith({ zoom: 0.9 })
    runMenuCommand("zoom:reset")
    expect(settings.set).toHaveBeenCalledWith({ zoom: 1 })
  })

  it("clamps the zoom at both ends", () => {
    h.settings.zoom = 2
    runMenuCommand("zoom:in")
    expect(settings.set).toHaveBeenLastCalledWith({ zoom: 2 })
    h.settings.zoom = 0.6
    runMenuCommand("zoom:out")
    expect(settings.set).toHaveBeenLastCalledWith({ zoom: 0.6 })
  })
})

describe("terminal commands", () => {
  it("opens, adds and splits panes", () => {
    runMenuCommand("terminal")
    expect(terminals.toggle).toHaveBeenCalled()
    runMenuCommand("terminal:new")
    expect(terminals.add).toHaveBeenCalled()
    runMenuCommand("terminal:split")
    expect(terminals.split).toHaveBeenCalled()
  })

  it("clears and restarts the active pane", () => {
    runMenuCommand("terminal:clear")
    expect(agents.clearTerminal).toHaveBeenCalled()
    runMenuCommand("terminal:restart")
    expect(agents.restartTerminal).toHaveBeenCalled()
  })

  it("launches each agent with its own binary", () => {
    for (const [id, agent, bin] of [
      ["terminal:launch:claude", "claude-code", "claude"],
      ["terminal:launch:codex", "codex", "codex"],
      ["terminal:launch:copilot", "copilot", "copilot"],
      ["terminal:launch:gemini", "gemini", "gemini"],
      ["terminal:launch:opencode", "opencode", "opencode"],
    ]) {
      runMenuCommand(id)
      expect(agents.launchAgent).toHaveBeenLastCalledWith(agent, bin)
    }
  })

  it("sends a review prompt carrying the open-task count", () => {
    runMenuCommand("terminal:sendReview")
    expect(agents.dispatchToAgent).toHaveBeenCalledWith("review 3")
  })

  it("refuses to send a review with no open tasks", () => {
    h.openCount.mockReturnValue(0)
    runMenuCommand("terminal:sendReview")
    expect(agents.dispatchToAgent).not.toHaveBeenCalled()
    expect(h.notify).toHaveBeenCalledWith("info", "terminal.noTasks")
  })
})

describe("app and help commands", () => {
  it("opens settings, shortcuts and the update check", () => {
    runMenuCommand("settings")
    expect(palette.toggleSettings).toHaveBeenCalledWith(true)
    runMenuCommand("help:shortcuts")
    expect(palette.toggleShortcuts).toHaveBeenCalledWith(true)
    runMenuCommand("checkUpdates")
    expect(h.checkForUpdates).toHaveBeenCalledWith(true)
  })

  it("opens each external link", () => {
    for (const [id, host] of [
      ["help:website", "reado.watermelon-studio.it"],
      ["help:discord", "discord.gg"],
      ["help:report", "github.com/WatermelonBros/reado/issues"],
      ["help:releases", "github.com/WatermelonBros/reado/releases"],
    ]) {
      runMenuCommand(id)
      expect(vi.mocked(opener.openUrl).mock.lastCall?.[0]).toContain(host)
    }
  })

  it("reveals the log file in the OS file manager", async () => {
    runMenuCommand("help:revealLog")
    await vi.waitFor(() => expect(opener.revealItemInDir).toHaveBeenCalledWith("/tmp/reado.log"))
  })

  it("copies the log path to the clipboard", async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
    runMenuCommand("help:copyLogPath")
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("/tmp/reado.log"))
    vi.unstubAllGlobals()
  })

  it("does nothing when there is no log file to reveal", async () => {
    h.logPath.mockResolvedValue(null)
    runMenuCommand("help:revealLog")
    // A single microtask leaves the chain mid-flight, so the absence below
    // would hold even for a working reveal.
    await new Promise((r) => setTimeout(r, 0))
    expect(h.logPath).toHaveBeenCalled()
    expect(opener.revealItemInDir).not.toHaveBeenCalled()
  })
})

describe("unknown ids", () => {
  it("are ignored rather than throwing", () => {
    expect(() => runMenuCommand("nope:does-not-exist")).not.toThrow()
  })
})

describe("listenForMenu", () => {
  it("routes a native-menu click to its command, and unsubscribes on request", async () => {
    const off = vi.fn()
    vi.mocked(listen).mockResolvedValue(off)
    const unlisten = await listenForMenu()
    expect(listen).toHaveBeenCalledWith("menu", expect.any(Function))
    // The backend forwards the clicked item's id; it must reach the dispatcher.
    const forward = vi.mocked(listen).mock.calls[0][1]
    forward({ payload: "save" })
    expect(docInfo.saveDocument).toHaveBeenCalled()
    // …and the returned function really is the backend's unsubscribe.
    unlisten()
    expect(off).toHaveBeenCalled()
  })
})
