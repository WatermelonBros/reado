// Cross-cutting hooks: theme/zoom/motion application, cross-window sync, and the
// global keyboard + mouse shortcuts.
import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Everything the module factories below reach for must exist before they run,
// and vi.mock is hoisted above the file body — so the doubles live in vi.hoisted.
const h = vi.hoisted(() => {
  /** A zustand-shaped double: callable as a hook (with or without a selector),
   *  plus getState() for the imperative reads the shortcut handler does. */
  const fakeStore = <T extends object>(state: T, extra: object = {}) =>
    Object.assign((sel?: (s: T) => unknown) => (sel ? sel(state) : state), {
      getState: () => state,
      ...extra,
    })
  return {
    fakeStore,
    setTheme: vi.fn(async () => {}),
    rehydrateSettings: vi.fn(),
    rehydrateExtensions: vi.fn(),
    undo: vi.fn(),
    toggleZenMode: vi.fn(),
    readState: { read: new Set<string>(), mark: vi.fn() },
    terminals: { toggle: vi.fn() },
    settings: {
      mode: "manual",
      theme: "reado-dark",
      lightTheme: "reado-light",
      darkTheme: "reado-dark",
      colorVision: "normal",
      reduceMotion: "off",
      zoom: 1,
      set: vi.fn(),
    },
    palette: { open: vi.fn(), toggleSettings: vi.fn() },
    project: {
      root: "/root",
      active: "/root/src/a.ts" as string | null,
      splitPath: null as string | null,
      cycleTab: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reopenClosed: vi.fn(),
      openSplit: vi.fn(),
      closeSplit: vi.fn(),
    },
    workspace: { toggleSidebar: vi.fn(), selectTool: vi.fn() },
    editorActions: { requestCompose: vi.fn() },
  }
})

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ setTheme: h.setTheme }) }))
vi.mock("../colorVision", () => ({
  OVERRIDDEN_TOKENS: ["marker", "accent"],
  tokensFor: (mode: string) => (mode === "normal" ? {} : { marker: "blue" }),
}))
vi.mock("../comments", () => ({
  toRelative: (root: string, p: string) => p.slice(root.length + 1),
}))
vi.mock("../docInfo", () => ({
  formatDocument: vi.fn(),
  nextProblem: vi.fn(),
  prevProblem: vi.fn(),
}))
vi.mock("../panels", () => ({ toggleDockArea: vi.fn() }))
vi.mock("../updater", () => ({ checkForUpdates: vi.fn() }))
vi.mock("../window", () => ({ toggleFullscreen: vi.fn() }))
vi.mock("../extensions", () => ({
  useExtensions: { persist: { rehydrate: h.rehydrateExtensions } },
}))
vi.mock("../fileUndo", () => ({ useFileUndo: { getState: () => ({ undo: h.undo }) } }))
vi.mock("../readProgress", () => ({ useReadProgress: { getState: () => h.readState } }))
vi.mock("../terminals", () => ({ useTerminals: { getState: () => h.terminals } }))
vi.mock("../store", () => ({
  toggleZenMode: () => h.toggleZenMode(),
  useSettings: h.fakeStore(h.settings, { persist: { rehydrate: h.rehydrateSettings } }),
  usePalette: h.fakeStore(h.palette),
  useProject: h.fakeStore(h.project),
  useWorkspace: h.fakeStore(h.workspace),
  useEditorActions: h.fakeStore(h.editorActions),
}))

const {
  editorActions,
  palette,
  project,
  readState,
  rehydrateExtensions,
  rehydrateSettings,
  settings,
  setTheme,
  terminals,
  toggleZenMode,
  undo,
  workspace,
} = h

import { formatDocument, nextProblem, prevProblem } from "@/lib/docInfo"
import {
  useApplyColorVision,
  useApplyReduceMotion,
  useApplyTheme,
  useApplyZoom,
  useAutoUpdateCheck,
  useCrossWindowSync,
  useGlobalShortcuts,
} from "@/lib/hooks"
import { toggleDockArea } from "@/lib/panels"
import { checkForUpdates } from "@/lib/updater"
import { toggleFullscreen } from "@/lib/window"

/** Fire a keydown on window, as the app's global listener sees it. */
function press(init: KeyboardEventInit) {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  window.dispatchEvent(e)
  return e
}

/** happy-dom has no real matchMedia; drive `matches` from the test. */
let mqMatches = false
const listeners = new Set<() => void>()
beforeEach(() => {
  vi.clearAllMocks()
  mqMatches = false
  listeners.clear()
  Object.assign(settings, { mode: "manual", colorVision: "normal", reduceMotion: "off", zoom: 1 })
  project.splitPath = null
  project.active = "/root/src/a.ts"
  readState.read = new Set()
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.removeAttribute("data-reduce-motion")
  document.documentElement.removeAttribute("data-color-vision")
  document.documentElement.style.cssText = ""
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return mqMatches
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("useApplyTheme", () => {
  it("applies the chosen theme in manual mode and matches the native chrome", () => {
    renderHook(() => useApplyTheme())
    expect(document.documentElement.dataset.theme).toBe("reado-dark")
    expect(setTheme).toHaveBeenCalledWith("dark")
  })

  it("follows the OS preference in system mode", () => {
    settings.mode = "system"
    mqMatches = true
    renderHook(() => useApplyTheme())
    expect(document.documentElement.dataset.theme).toBe("reado-dark")
    mqMatches = false
    renderHook(() => useApplyTheme())
    expect(document.documentElement.dataset.theme).toBe("reado-light")
    expect(setTheme).toHaveBeenLastCalledWith("light")
  })

  it("re-applies when the OS preference changes under it", () => {
    settings.mode = "system"
    renderHook(() => useApplyTheme())
    expect(document.documentElement.dataset.theme).toBe("reado-light")
    mqMatches = true
    for (const fn of listeners) fn()
    expect(document.documentElement.dataset.theme).toBe("reado-dark")
  })

  it("goes light by day and dark by night in auto mode", () => {
    settings.mode = "auto"
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0))
    renderHook(() => useApplyTheme()).unmount()
    expect(document.documentElement.dataset.theme).toBe("reado-light")
    vi.setSystemTime(new Date(2026, 0, 1, 22, 0, 0))
    renderHook(() => useApplyTheme())
    expect(document.documentElement.dataset.theme).toBe("reado-dark")
  })

  it("keeps re-checking the clock in auto mode", () => {
    settings.mode = "auto"
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 18, 59, 0))
    renderHook(() => useApplyTheme())
    expect(document.documentElement.dataset.theme).toBe("reado-light")
    vi.setSystemTime(new Date(2026, 0, 1, 19, 1, 0))
    vi.advanceTimersByTime(60_000)
    expect(document.documentElement.dataset.theme).toBe("reado-dark")
  })

  it("stops listening on unmount", () => {
    renderHook(() => useApplyTheme()).unmount()
    expect(listeners.size).toBe(0)
  })
})

describe("useApplyColorVision", () => {
  it("leaves the theme's own palette alone in normal mode", () => {
    renderHook(() => useApplyColorVision())
    expect(document.documentElement.hasAttribute("data-color-vision")).toBe(false)
    expect(document.documentElement.style.getPropertyValue("--marker")).toBe("")
  })

  it("overrides the meaning-carrying tokens and flags the mode for CSS", () => {
    settings.colorVision = "deuteranopia"
    renderHook(() => useApplyColorVision())
    expect(document.documentElement.dataset.colorVision).toBe("deuteranopia")
    expect(document.documentElement.style.getPropertyValue("--marker")).toBe("blue")
  })
})

describe("useApplyZoom", () => {
  it("zooms the content area, not the document root", () => {
    settings.zoom = 1.4
    renderHook(() => useApplyZoom())
    expect(document.documentElement.style.getPropertyValue("--app-zoom")).toBe("1.4")
  })
})

describe("useApplyReduceMotion", () => {
  it("damps motion when explicitly on", () => {
    settings.reduceMotion = "on"
    renderHook(() => useApplyReduceMotion())
    expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(true)
  })

  it("follows the OS in system mode", () => {
    settings.reduceMotion = "system"
    mqMatches = true
    renderHook(() => useApplyReduceMotion())
    expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(true)
  })

  it("ignores the OS when explicitly off", () => {
    settings.reduceMotion = "off"
    mqMatches = true
    renderHook(() => useApplyReduceMotion())
    expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(false)
  })
})

describe("useCrossWindowSync", () => {
  it("rehydrates the store another window just wrote", () => {
    renderHook(() => useCrossWindowSync())
    window.dispatchEvent(new StorageEvent("storage", { key: "reado.settings" }))
    expect(rehydrateSettings).toHaveBeenCalled()
    window.dispatchEvent(new StorageEvent("storage", { key: "reado.extensions" }))
    expect(rehydrateExtensions).toHaveBeenCalled()
  })

  it("ignores per-window keys", () => {
    renderHook(() => useCrossWindowSync())
    window.dispatchEvent(new StorageEvent("storage", { key: "reado.terminals" }))
    expect(rehydrateSettings).not.toHaveBeenCalled()
  })
})

describe("useAutoUpdateCheck", () => {
  it("checks shortly after launch, then throttles the refocus churn", () => {
    vi.useFakeTimers()
    renderHook(() => useAutoUpdateCheck())
    expect(checkForUpdates).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4000)
    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event("focus"))
    window.dispatchEvent(new Event("focus"))
    expect(checkForUpdates).toHaveBeenCalledTimes(1) // still inside the 30 min window
    vi.advanceTimersByTime(31 * 60 * 1000)
    window.dispatchEvent(new Event("focus"))
    expect(checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it("stops checking once unmounted", () => {
    vi.useFakeTimers()
    renderHook(() => useAutoUpdateCheck()).unmount()
    vi.advanceTimersByTime(10_000)
    window.dispatchEvent(new Event("focus"))
    expect(checkForUpdates).not.toHaveBeenCalled()
  })
})

describe("useGlobalShortcuts", () => {
  beforeEach(() => renderHook(() => useGlobalShortcuts()))

  it("opens the palettes", () => {
    press({ key: "p", metaKey: true })
    expect(palette.open).toHaveBeenCalledWith("files")
    press({ key: "k", metaKey: true })
    expect(palette.open).toHaveBeenCalledWith("commands")
    press({ key: "F", metaKey: true, shiftKey: true })
    expect(palette.open).toHaveBeenCalledWith("search")
    press({ key: "O", metaKey: true, shiftKey: true })
    expect(palette.open).toHaveBeenCalledWith("symbols")
    press({ key: "t", metaKey: true })
    expect(palette.open).toHaveBeenCalledWith("wsymbols")
  })

  it("ignores unmodified keys", () => {
    press({ key: "p" })
    expect(palette.open).not.toHaveBeenCalled()
  })

  it("formats the document on Shift+Alt+F, without a Cmd/Ctrl", () => {
    press({ key: "F", shiftKey: true, altKey: true })
    expect(formatDocument).toHaveBeenCalled()
  })

  it("walks the diagnostics with F8 / Shift+F8", () => {
    press({ key: "F8" })
    expect(nextProblem).toHaveBeenCalled()
    press({ key: "F8", shiftKey: true })
    expect(prevProblem).toHaveBeenCalled()
  })

  it("toggles full screen on F11 and on Ctrl+Cmd+F", () => {
    press({ key: "F11" })
    press({ key: "f", ctrlKey: true, metaKey: true })
    expect(toggleFullscreen).toHaveBeenCalledTimes(2)
  })

  it("reads Zen mode off the physical key — ⌥Z composes to Ω on macOS", () => {
    press({ key: "Ω", code: "KeyZ", altKey: true, metaKey: true })
    expect(toggleZenMode).toHaveBeenCalled()
  })

  it("cycles tabs with Ctrl+Tab in both directions", () => {
    press({ key: "Tab", ctrlKey: true })
    expect(project.cycleTab).toHaveBeenCalledWith(1)
    press({ key: "Tab", ctrlKey: true, shiftKey: true })
    expect(project.cycleTab).toHaveBeenCalledWith(-1)
  })

  it("walks the navigation history", () => {
    press({ key: "ArrowLeft", metaKey: true, altKey: true })
    expect(project.goBack).toHaveBeenCalled()
    press({ key: "ArrowRight", metaKey: true, altKey: true })
    expect(project.goForward).toHaveBeenCalled()
  })

  it("zooms in, out and back to 1, clamped to the bounds", () => {
    press({ key: "=", metaKey: true })
    expect(settings.set).toHaveBeenCalledWith({ zoom: 1.1 })
    press({ key: "-", metaKey: true })
    expect(settings.set).toHaveBeenCalledWith({ zoom: 0.9 })
    press({ key: "0", metaKey: true })
    expect(settings.set).toHaveBeenCalledWith({ zoom: 1 })
    settings.zoom = 2
    press({ key: "+", metaKey: true })
    expect(settings.set).toHaveBeenLastCalledWith({ zoom: 2 })
    settings.zoom = 0.6
    press({ key: "-", metaKey: true })
    expect(settings.set).toHaveBeenLastCalledWith({ zoom: 0.6 })
  })

  it("toggles the panels", () => {
    press({ key: "b", metaKey: true })
    expect(workspace.toggleSidebar).toHaveBeenCalled()
    press({ key: "∫", code: "KeyB", altKey: true, metaKey: true })
    expect(toggleDockArea).toHaveBeenCalledWith("right")
    press({ key: "j", metaKey: true })
    expect(terminals.toggle).toHaveBeenCalled()
    press({ key: ",", metaKey: true })
    expect(palette.toggleSettings).toHaveBeenCalledWith(true)
  })

  it("selects the sidebar tools", () => {
    press({ key: "e", metaKey: true, shiftKey: true })
    expect(workspace.selectTool).toHaveBeenCalledWith("files")
    press({ key: "g", metaKey: true, shiftKey: true })
    expect(workspace.selectTool).toHaveBeenCalledWith("git")
    press({ key: "c", metaKey: true, shiftKey: true })
    expect(workspace.selectTool).toHaveBeenCalledWith("comments")
  })

  it("composes a comment from the selection", () => {
    press({ key: "m", metaKey: true, shiftKey: true })
    expect(editorActions.requestCompose).toHaveBeenCalled()
  })

  it("reopens the last closed tab", () => {
    press({ key: "t", metaKey: true, shiftKey: true })
    expect(project.reopenClosed).toHaveBeenCalled()
    expect(palette.open).not.toHaveBeenCalled()
  })

  it("opens and closes the split editor", () => {
    press({ key: "\\", metaKey: true })
    expect(project.openSplit).toHaveBeenCalled()
    project.splitPath = "/root/b.ts"
    press({ key: "\\", metaKey: true })
    expect(project.closeSplit).toHaveBeenCalled()
  })

  it("toggles read/unread for the active file, by relative path", () => {
    press({ key: "r", metaKey: true, altKey: true })
    expect(readState.mark).toHaveBeenCalledWith("/root", "src/a.ts", true)
    readState.read = new Set(["src/a.ts"])
    press({ key: "r", metaKey: true, altKey: true })
    expect(readState.mark).toHaveBeenLastCalledWith("/root", "src/a.ts", false)
  })

  it("does nothing for read/unread with no file open", () => {
    project.active = null
    press({ key: "r", metaKey: true, altKey: true })
    expect(readState.mark).not.toHaveBeenCalled()
  })

  it("undoes a file operation with Cmd+Z", () => {
    press({ key: "z", metaKey: true })
    expect(undo).toHaveBeenCalled()
  })

  it("defers Cmd+Z to a focused input, which owns its own undo", () => {
    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()
    press({ key: "z", metaKey: true })
    expect(undo).not.toHaveBeenCalled()
    input.remove()
  })

  it("prevents the browser default on a shortcut it handles", () => {
    expect(press({ key: "p", metaKey: true }).defaultPrevented).toBe(true)
    expect(press({ key: "y", metaKey: true }).defaultPrevented).toBe(false)
  })
})

describe("mouse navigation buttons", () => {
  beforeEach(() => renderHook(() => useGlobalShortcuts()))

  it("walks Reado's history instead of the webview's", () => {
    window.dispatchEvent(new MouseEvent("mouseup", { button: 3 }))
    expect(project.goBack).toHaveBeenCalled()
    window.dispatchEvent(new MouseEvent("mouseup", { button: 4 }))
    expect(project.goForward).toHaveBeenCalled()
  })

  it("blocks the webview's own back/forward navigation", () => {
    const e = new MouseEvent("mousedown", { button: 3, cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it("leaves the normal buttons alone", () => {
    window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }))
    expect(project.goBack).not.toHaveBeenCalled()
  })
})
