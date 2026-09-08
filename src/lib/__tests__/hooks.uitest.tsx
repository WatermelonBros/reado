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
      // The real stores are settable; a test that needs to change one (say, to
      // rebind a key) would otherwise have to reach into the fixture object.
      setState: (patch: Partial<T>) => Object.assign(state as object, patch),
      ...extra,
    })
  return {
    fakeStore,
    setTheme: vi.fn(async () => {}),
    rehydrateSettings: vi.fn(),
    rehydrateExtensions: vi.fn(),
    undo: vi.fn(),
    toggleZenMode: vi.fn(),
    terminals: { toggle: vi.fn() },
    workspace: { toggleSidebar: vi.fn(), selectTool: vi.fn() },
    editorActions: { requestCompose: vi.fn() },
    readState: { read: new Set<string>(), mark: vi.fn() },
    settings: {
      mode: "manual",
      theme: "reado-dark",
      lightTheme: "reado-light",
      darkTheme: "reado-dark",
      colorVision: "normal",
      reduceMotion: "off",
      wrap: true,
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
const doc = vi.hoisted(() => ({
  formatDocument: vi.fn(),
  nextProblem: vi.fn(),
  prevProblem: vi.fn(),
  focusPane: vi.fn(() => true),
  foldAllCmd: vi.fn(),
  foldLevel: vi.fn(),
  unfoldAllCmd: vi.fn(),
  newFile: vi.fn(),
  saveAll: vi.fn(),
  saveDocument: vi.fn(),
}))
vi.mock("../docInfo", () => doc)
vi.mock("../panels", () => ({ toggleDockArea: vi.fn() }))
const { runMenuCommand } = vi.hoisted(() => ({ runMenuCommand: vi.fn() }))
vi.mock("../menu", () => ({ runMenuCommand }))
vi.mock("../updater", () => ({ checkForUpdates: vi.fn() }))
vi.mock("../window", () => ({ toggleFullscreen: vi.fn() }))
// The theme hooks read the disabled list as a hook now, so the mock has to be
// callable as one — not just a bag of statics.
vi.mock("../extensions", () => ({
  useExtensions: Object.assign(
    (sel: (s: { disabled: string[] }) => unknown) => sel({ disabled: [] }),
    {
      persist: { rehydrate: h.rehydrateExtensions },
      getState: () => ({ disabled: [], isEnabled: () => true }),
    },
  ),
}))
vi.mock("../fileUndo", () => ({ useFileUndo: { getState: () => ({ undo: h.undo }) } }))
vi.mock("../readProgress", () => ({ useReadProgress: { getState: () => h.readState } }))
vi.mock("../terminals", () => ({ useTerminals: { getState: () => h.terminals } }))
vi.mock("../store", () => ({
  toggleZenMode: () => h.toggleZenMode(),
  isExtTheme: (t: string) => t.startsWith("ext:"),
  useSettings: h.fakeStore(h.settings, { persist: { rehydrate: h.rehydrateSettings } }),
  usePalette: h.fakeStore(h.palette),
  useProject: h.fakeStore(h.project),
  useWorkspace: h.fakeStore(h.workspace),
  useEditorActions: h.fakeStore(h.editorActions),
}))

// Only what the assertions read. The rest of `h` is consumed by the `vi.mock`
// factories above, which reference it directly.
const { palette, project, readState, rehydrateExtensions, rehydrateSettings, settings, setTheme } =
  h

import { useChords } from "@/lib/chords"
import {
  useApplyColorVision,
  useApplyReduceMotion,
  useApplyTheme,
  useApplyZoom,
  useAutoUpdateCheck,
  useCrossWindowSync,
  useGlobalShortcuts,
} from "@/lib/hooks"
import { useSettings } from "@/lib/store"
import { checkForUpdates } from "@/lib/updater"

// These tests drive the macOS bindings: the command modifier is Cmd there, and
// the ⌃⌘F / ⌥⌘Z combos only exist there. The non-macOS half of the split — Ctrl
// as the command modifier, and Ctrl *not* being one on macOS — is asserted
// separately below.
vi.mock("@/lib/shortcuts", async (orig) => ({
  ...(await orig<typeof import("@/lib/shortcuts")>()),
  isMacUA: true,
}))

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
  beforeEach(() => {
    renderHook(() => useGlobalShortcuts())
    useSettings.setState({ keybindings: [] })
  })

  /** The command id a keystroke dispatched, or undefined. */
  const dispatched = (init: KeyboardEventInit) => {
    runMenuCommand.mockClear()
    press(init)
    return runMenuCommand.mock.calls[0]?.[0]
  }

  it("dispatches through the same command registry the menu uses", () => {
    // The point of the table: a rebound key and a menu click can't diverge,
    // because they are the same call.
    expect(dispatched({ key: "p", metaKey: true })).toBe("palette:files")
    expect(dispatched({ key: "P", metaKey: true, shiftKey: true })).toBe("palette:commands")
    expect(dispatched({ key: "s", metaKey: true, code: "KeyS" })).toBe("save")
    expect(dispatched({ key: "F8" })).toBe("go:nextProblem")
    expect(dispatched({ key: "F8", shiftKey: true })).toBe("go:prevProblem")
  })

  it("ignores unmodified keys", () => {
    expect(dispatched({ key: "p", code: "KeyP" })).toBeUndefined()
  })

  it("leaves the Ctrl keys alone on macOS — they belong to the editor and the shell", () => {
    // Ctrl+P/K/B are readline motion in the editor and tmux/shell keys in the
    // terminal. Treating Ctrl as a second command modifier stole all of them.
    expect(dispatched({ key: "p", ctrlKey: true, code: "KeyP" })).toBeUndefined()
    expect(dispatched({ key: "b", ctrlKey: true, code: "KeyB" })).toBeUndefined()
  })

  it("reads the physical key, so a composed character still matches", () => {
    // ⌥Z is "Ω" on macOS; matching on `e.key` lost the binding entirely.
    expect(dispatched({ key: "Ω", altKey: true, code: "KeyZ" })).toBe("view:wrap")
  })

  it("honours a rebound key, and forgets the one it replaced", () => {
    useSettings.setState({ keybindings: ["Mod+Alt+P = palette:files", "Mod+P ="] })
    expect(dispatched({ key: "p", metaKey: true, altKey: true, code: "KeyP" })).toBe(
      "palette:files",
    )
    expect(dispatched({ key: "p", metaKey: true, code: "KeyP" })).toBeUndefined()
  })

  it("leaves ⌘Z to the editor and every text field", () => {
    // Undo means the file operation only *outside* something with its own
    // history; inside one, taking the key would eat a real undo.
    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()
    expect(dispatched({ key: "z", metaKey: true, code: "KeyZ" })).toBeUndefined()
    input.remove()
    expect(dispatched({ key: "z", metaKey: true, code: "KeyZ" })).toBe("edit:undoFile")
  })

  it("stands aside for a key the editor already handled", () => {
    // ⌘S is bound inside CodeMirror too; running it twice would save twice.
    runMenuCommand.mockClear()
    const e = new KeyboardEvent("keydown", {
      key: "s",
      code: "KeyS",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    e.preventDefault()
    window.dispatchEvent(e)
    expect(runMenuCommand).not.toHaveBeenCalled()
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

describe("the ⌘K chord", () => {
  beforeEach(() => {
    renderHook(() => useGlobalShortcuts())
    useChords.getState().cancel()
  })

  it("arms on ⌘K instead of firing a command", () => {
    press({ key: "k", metaKey: true })
    expect(useChords.getState().pending).toBe(true)
    expect(palette.open).not.toHaveBeenCalled()
  })

  it("⌘K ⌘K still opens the palette — the habit keeps working", () => {
    // Through the same registry as everything else, so a chord and a menu click
    // cannot do different things.
    runMenuCommand.mockClear()
    press({ key: "k", metaKey: true })
    press({ key: "k", metaKey: true })
    expect(runMenuCommand).toHaveBeenCalledWith("palette:commands")
    expect(useChords.getState().pending).toBe(false)
  })

  it("runs a plain second key, and one held with the modifier, as different chords", () => {
    // ⌘K Z is zen; ⌘K ⌘0 is fold all. Same position, different chord.
    runMenuCommand.mockClear()
    press({ key: "k", metaKey: true })
    press({ key: "z" })
    expect(runMenuCommand).toHaveBeenCalledWith("view:zen")

    runMenuCommand.mockClear()
    press({ key: "k", metaKey: true })
    press({ key: "0", metaKey: true })
    expect(runMenuCommand).toHaveBeenCalledWith("view:foldAll")
  })

  it("folds to a numbered level", () => {
    runMenuCommand.mockClear()
    press({ key: "k", metaKey: true })
    press({ key: "3", metaKey: true })
    expect(runMenuCommand).toHaveBeenCalledWith("view:foldLevel:3")
  })

  it("cancels on Escape without running anything", () => {
    press({ key: "k", metaKey: true })
    press({ key: "Escape" })
    expect(useChords.getState().pending).toBe(false)
    expect(palette.open).not.toHaveBeenCalled()
  })

  it("waits through the modifier key itself on the way to the second stroke", () => {
    // Holding ⌘ for ⌘K ⌘S fires a keydown for Meta first; treating that as the
    // second key would cancel every modified chord.
    press({ key: "k", metaKey: true })
    press({ key: "Meta", metaKey: true })
    expect(useChords.getState().pending).toBe(true)
  })

  it("cancels quietly on a key that isn't a chord, rather than eating the next one", () => {
    press({ key: "k", metaKey: true })
    press({ key: "q" })
    expect(useChords.getState().pending).toBe(false)
    // And the keystroke after it reaches its own shortcut again.
    runMenuCommand.mockClear()
    press({ key: "p", metaKey: true, code: "KeyP" })
    expect(runMenuCommand).toHaveBeenCalledWith("palette:files")
  })
})
