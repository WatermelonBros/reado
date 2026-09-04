// Window routing: the project (and file) live in the URL hash, so a new window
// pointed at `#project=…` boots straight into it.
import { beforeEach, describe, expect, it, vi } from "vitest"

const setTitle = vi.fn(async () => {})
const isFullscreen = vi.fn(async () => false)
const setFullscreen = vi.fn(async () => {})
const getCurrentWindow = vi.fn(() => ({
  setTitle,
  isFullscreen,
  setFullscreen,
  onResized: vi.fn(),
}))
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => getCurrentWindow() }))
const created: Array<[string, Record<string, unknown>]> = []
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    constructor(label: string, opts: Record<string, unknown>) {
      created.push([label, opts])
    }
  },
}))
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(async () => true), open: vi.fn() }))

let os = "mac"
vi.mock("../extensions", () => ({ currentOS: () => os }))

const touch = vi.fn()
const open = vi.fn()
vi.mock("../store", () => ({
  useProject: { getState: () => ({ root: "/root", open }) },
  useRecents: { getState: () => ({ touch }) },
}))

import { ask, open as openDialog } from "@tauri-apps/plugin-dialog"
import {
  clearOpenFile,
  closeProject,
  currentOpenFile,
  currentProjectPath,
  openFileDialog,
  openInNewWindow,
  openPathTarget,
  openProject,
  openProjectHere,
  pickFolderAndOpen,
  setWindowTitle,
  toggleFullscreen,
} from "@/lib/window"

beforeEach(() => {
  vi.clearAllMocks()
  created.length = 0
  os = "mac"
  window.location.hash = ""
})

describe("the URL hash", () => {
  it("round-trips a project path through openProject", async () => {
    await openProject("/Users/me/Projects/app")
    expect(window.location.hash).toBe("#project=%2FUsers%2Fme%2FProjects%2Fapp")
    expect(currentProjectPath()).toBe("/Users/me/Projects/app")
  })

  it("survives spaces, unicode and Windows backslashes", async () => {
    for (const path of ["/tmp/weird name #1", "/проект/café", "C:\\Users\\me\\app"]) {
      await openProject(path)
      expect(currentProjectPath()).toBe(path)
    }
  })

  it("reads the file to open from an OS association", async () => {
    await openPathTarget("/root", "src/a.ts")
    expect(currentProjectPath()).toBe("/root")
    expect(currentOpenFile()).toBe("src/a.ts")
  })

  it("has no project or file on the launcher", () => {
    expect(currentProjectPath()).toBeNull()
    expect(currentOpenFile()).toBeNull()
  })

  it("drops the file param but keeps the project, so a reload doesn't re-open it", async () => {
    await openPathTarget("/root", "src/a.ts")
    clearOpenFile()
    expect(currentOpenFile()).toBeNull()
    expect(currentProjectPath()).toBe("/root")
  })

  it("closeProject returns to the launcher", async () => {
    await openProject("/root")
    await closeProject()
    expect(currentProjectPath()).toBeNull()
  })
})

describe("openInNewWindow", () => {
  it("gives each window a unique project_* label (the capability glob)", () => {
    openInNewWindow("/root")
    openInNewWindow("/root")
    const [a, b] = created.map(([label]) => label)
    expect(a).toMatch(/^project_/)
    expect(a).not.toBe(b)
  })

  it("encodes the project and file in the new window's hash", () => {
    openInNewWindow("/my project", "src/a.ts")
    expect(created[0][1].url).toBe("index.html#project=%2Fmy%20project&open=src%2Fa.ts")
  })

  it("opens the bare launcher with no hash", () => {
    openInNewWindow()
    expect(created[0][1].url).toBe("index.html")
  })

  it("uses macOS overlay chrome only on macOS", () => {
    openInNewWindow()
    expect(created[0][1]).toMatchObject({ titleBarStyle: "overlay", decorations: true })
    os = "windows"
    openInNewWindow()
    expect(created[1][1]).toMatchObject({ titleBarStyle: undefined, decorations: false })
  })
})

describe("openProjectHere", () => {
  it("reuses an empty launcher window without asking", async () => {
    await openProjectHere("/root")
    expect(ask).not.toHaveBeenCalled()
    expect(currentProjectPath()).toBe("/root")
    expect(touch).toHaveBeenCalledWith("/root")
  })

  it("asks when a project is already open, defaulting to this window", async () => {
    await openProject("/old")
    vi.mocked(ask).mockResolvedValue(true)
    await openProjectHere("/new")
    // "This window" is the confirm button, so Enter keeps you where you are.
    expect(vi.mocked(ask).mock.calls[0][1]).toMatchObject({ okLabel: "This window" })
    expect(currentProjectPath()).toBe("/new")
    expect(created).toHaveLength(0)
  })

  it("opens a new window when the user declines", async () => {
    await openProject("/old")
    vi.mocked(ask).mockResolvedValue(false)
    await openProjectHere("/new")
    expect(currentProjectPath()).toBe("/old")
    expect(created).toHaveLength(1)
  })
})

describe("openPathTarget", () => {
  it("opens a dedicated window when this one already holds a project", async () => {
    await openProject("/old")
    await openPathTarget("/root", "a.ts")
    expect(created).toHaveLength(1)
    expect(currentProjectPath()).toBe("/old")
  })
})

describe("the file/folder dialogs", () => {
  it("opens the picked folder", async () => {
    vi.mocked(openDialog).mockResolvedValue("/picked")
    await pickFolderAndOpen()
    expect(currentProjectPath()).toBe("/picked")
  })

  it("takes the first path when the dialog returns a list", async () => {
    vi.mocked(openDialog).mockResolvedValue(["/first", "/second"])
    await pickFolderAndOpen()
    expect(currentProjectPath()).toBe("/first")
  })

  it("does nothing when the folder dialog is cancelled", async () => {
    vi.mocked(openDialog).mockResolvedValue(null)
    await pickFolderAndOpen()
    expect(currentProjectPath()).toBeNull()
  })

  it("defaults the file dialog into the open project", async () => {
    vi.mocked(openDialog).mockResolvedValue("/root/a.ts")
    await openFileDialog()
    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({ directory: false, defaultPath: "/root" }),
    )
    expect(open).toHaveBeenCalledWith("/root/a.ts")
  })

  it("does nothing when the file dialog is cancelled", async () => {
    vi.mocked(openDialog).mockResolvedValue(null)
    await openFileDialog()
    expect(open).not.toHaveBeenCalled()
  })
})

describe("setWindowTitle", () => {
  it("stays empty on macOS, where the title would render over the pill", async () => {
    await setWindowTitle("my project")
    expect(setTitle).toHaveBeenCalledWith("")
  })

  it("names the project elsewhere, for the taskbar", async () => {
    os = "linux"
    await setWindowTitle("my project")
    expect(setTitle).toHaveBeenCalledWith("my project — Reado")
  })

  it("falls back to the app name with no project", async () => {
    os = "windows"
    await setWindowTitle("")
    expect(setTitle).toHaveBeenCalledWith("Reado")
  })

  it("is non-fatal when there's no window API", async () => {
    setTitle.mockRejectedValue(new Error("no window"))
    await expect(setWindowTitle("x")).resolves.toBeUndefined()
  })
})

describe("toggleFullscreen", () => {
  it("flips the current state when called with no argument", async () => {
    isFullscreen.mockResolvedValue(false)
    toggleFullscreen()
    await vi.waitFor(() => expect(setFullscreen).toHaveBeenCalledWith(true))
  })

  it("honours an explicit state", async () => {
    toggleFullscreen(false)
    await vi.waitFor(() => expect(setFullscreen).toHaveBeenCalledWith(false))
  })

  it("does nothing at all when there is no window API", () => {
    getCurrentWindow.mockImplementationOnce(() => {
      throw new Error("no window API")
    })
    expect(() => toggleFullscreen()).not.toThrow()
    expect(setFullscreen).not.toHaveBeenCalled()
  })
})
