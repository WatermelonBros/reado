// UI test: one terminal pane — the PTY lifecycle, output streaming, the search
// box, the keyboard handler (copy/paste/search/Shift+Enter) and dropped files.
// xterm.js is real (it mounts fine in happy-dom); the backend is mocked.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Handler = (e: { payload: unknown }) => void
const listeners = new Map<string, Handler>()
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Handler) => {
    listeners.set(event, cb)
    return () => listeners.delete(event)
  }),
}))

let onDrop: Handler | null = null
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (cb: Handler) => {
      onDrop = cb
      return Promise.resolve(() => {})
    },
  }),
}))

const clipboardRead = vi.fn<() => Promise<string>>(async () => "")
const clipboardWrite = vi.fn<(s: string) => Promise<void>>(async () => {})
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: () => clipboardRead(),
  writeText: (s: string) => clipboardWrite(s),
}))
const openUrl = vi.fn<(u: string) => Promise<void>>(async () => {})
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (u: string) => openUrl(u) }))

// The search addon is xterm's; stub it so "what did the search box ask for" is
// observable, and the theme builder so a re-theme can be counted.
const search = vi.hoisted(() => ({ findNext: vi.fn(), findPrevious: vi.fn(), clear: vi.fn() }))
vi.mock("@xterm/addon-search", () => ({
  SearchAddon: class {
    findNext = search.findNext
    findPrevious = search.findPrevious
    clearDecorations = search.clear
    activate() {}
    dispose() {}
  },
}))
const xtermTheme = vi.hoisted(() => vi.fn(() => ({ background: "#000" })))
vi.mock("../../../lib/xtermTheme", async (orig) => ({
  ...(await orig<typeof import("../../../lib/xtermTheme")>()),
  xtermTheme,
}))

const ptySpawn = vi.fn(async (..._a: unknown[]) => {})
const ptyKill = vi.fn(async (_id: string) => {})
const ptyWrite = vi.fn(async (_id: string, _d: string) => {})
const ptyResize = vi.fn(async (..._a: unknown[]) => {})
const anywherePublishAgent = vi.fn(async (_id: string, _text: string) => {})
const clipboardImageToTemp = vi.fn<() => Promise<string | null>>(async () => null)
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  ptySpawn: (...a: unknown[]) => ptySpawn(...a),
  ptyKill: (id: string) => ptyKill(id),
  ptyWrite: (id: string, d: string) => ptyWrite(id, d),
  ptyResize: (...a: unknown[]) => ptyResize(...a),
  anywherePublishAgent: (id: string, text: string) => anywherePublishAgent(id, text),
  clipboardImageToTemp: () => clipboardImageToTemp(),
  resolvePath: vi.fn(async () => "/repo/src/a.ts"),
}))

import { Terminal as XTerm } from "@xterm/xterm"
import { Terminal } from "@/components/organisms/Terminal"
import { useSettings } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

/** Base64 of a UTF-8 string — the shape PTY output arrives in. */
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))

/** Mount a pane and wait for its PTY to be requested. */
async function mount(id = "t1", active = true) {
  const utils = render(<Terminal id={id} cwd="/repo" active={active} />)
  await waitFor(() => expect(ptySpawn).toHaveBeenCalled())
  return utils
}

/** The hidden textarea xterm routes keystrokes through. */
const helper = () => document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  onDrop = null
  ptySpawn.mockResolvedValue(undefined)
  clipboardRead.mockResolvedValue("")
  clipboardImageToTemp.mockResolvedValue(null)
  useTerminals.setState({ agentTerminals: [] })
})

describe("the PTY lifecycle", () => {
  it("spawns one for the pane, in the project directory", async () => {
    await mount("t1")
    expect(ptySpawn).toHaveBeenCalledWith("t1", "/repo", expect.any(Number), expect.any(Number))
  })

  it("kills it when the pane closes", async () => {
    const { unmount } = await mount("t1")
    unmount()
    expect(ptyKill).toHaveBeenCalledWith("t1")
  })

  it("says so when the shell can't start, and wires no input to it", async () => {
    ptySpawn.mockRejectedValue(new Error("bad $SHELL"))
    const { container } = await mount("t1")
    await waitFor(() => expect(container.textContent).toContain("[failed to start terminal]"))
    expect(listeners.has("pty-output-t1")).toBe(false)
  })

  it("notes when the process exits", async () => {
    const { container } = await mount("t1")
    await waitFor(() => expect(listeners.has("pty-exit-t1")).toBe(true))
    listeners.get("pty-exit-t1")?.({ payload: null })
    await waitFor(() => expect(container.textContent).toContain("[process exited]"))
  })

  it("sends what you type to the PTY", async () => {
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    await userEvent.type(helper(), "ls")
    expect(ptyWrite).toHaveBeenCalledWith("t1", "l")
    expect(ptyWrite).toHaveBeenCalledWith("t1", "s")
  })
})

describe("output", () => {
  it("writes it into the terminal", async () => {
    const { container } = await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    listeners.get("pty-output-t1")?.({ payload: b64("hello from the shell") })
    await waitFor(() => expect(container.textContent).toContain("hello from the shell"))
  })

  it("mirrors an agent pane to a paired phone, coalesced", async () => {
    vi.useFakeTimers()
    useTerminals.setState({ agentTerminals: ["t1"] })
    render(<Terminal id="t1" cwd="/repo" active />)
    await vi.waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    listeners.get("pty-output-t1")?.({ payload: b64("thinking…") })
    listeners.get("pty-output-t1")?.({ payload: b64(" done") })
    expect(anywherePublishAgent).not.toHaveBeenCalled() // still coalescing
    await vi.advanceTimersByTimeAsync(500)
    expect(anywherePublishAgent).toHaveBeenCalledTimes(1)
    expect(vi.mocked(anywherePublishAgent).mock.lastCall?.[1]).toContain("thinking… done")
    vi.useRealTimers()
  })

  it("keeps only the tail of a long agent run in the mirror", async () => {
    vi.useFakeTimers()
    useTerminals.setState({ agentTerminals: ["t1"] })
    render(<Terminal id="t1" cwd="/repo" active />)
    await vi.waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    // Untruncated, this buffer grows for the life of the session *and* the
    // whole of it is re-sent to the phone on every burst.
    listeners.get("pty-output-t1")?.({ payload: b64("A".repeat(7000)) })
    listeners.get("pty-output-t1")?.({ payload: b64("B".repeat(3000)) })
    await vi.advanceTimersByTimeAsync(500)
    const sent = vi.mocked(anywherePublishAgent).mock.lastCall?.[1] ?? ""
    expect(sent).toHaveLength(8000)
    // …and it is the *recent* output that survives, not the oldest.
    expect(sent.endsWith("B".repeat(3000))).toBe(true)
    vi.useRealTimers()
  })

  it("doesn't mirror a plain shell pane", async () => {
    vi.useFakeTimers()
    render(<Terminal id="t1" cwd="/repo" active />)
    await vi.waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    listeners.get("pty-output-t1")?.({ payload: b64("ls -la") })
    await vi.advanceTimersByTimeAsync(500)
    expect(anywherePublishAgent).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe("the keyboard handler", () => {
  /** Fire a keydown the way xterm's custom handler receives it. */
  const key = (init: KeyboardEventInit) =>
    fireEvent.keyDown(helper(), { bubbles: true, cancelable: true, ...init })

  it("opens the search box on Cmd+F", async () => {
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    key({ key: "f", metaKey: true })
    expect(await screen.findByPlaceholderText("terminal.search")).toBeInTheDocument()
  })

  it("leaves plain Ctrl+F to readline", async () => {
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    key({ key: "f", ctrlKey: true })
    expect(screen.queryByPlaceholderText("terminal.search")).not.toBeInTheDocument()
  })

  it("sends ESC+CR for Shift+Enter, so a TUI agent gets a newline not a submit", async () => {
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    key({ key: "Enter", shiftKey: true })
    expect(ptyWrite).toHaveBeenCalledWith("t1", "\x1b\r")
  })

  it("pastes the clipboard on Cmd+V, into the shell", async () => {
    clipboardRead.mockResolvedValue("echo hi")
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    key({ key: "v", metaKey: true })
    await waitFor(() => expect(ptyWrite).toHaveBeenCalledWith("t1", "echo hi"))
  })

  it("types the quoted path of a clipboard image when there is no text", async () => {
    clipboardRead.mockResolvedValue("")
    clipboardImageToTemp.mockResolvedValue("/tmp/shot 1.png")
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    key({ key: "v", metaKey: true })
    // A PTY can't carry the bytes, so the agent gets a path it can open — and it
    // has a space in it, which is why it arrives quoted.
    await waitFor(() => expect(ptyWrite).toHaveBeenCalledWith("t1", "'/tmp/shot 1.png' "))
  })

  it("copies the selection on Cmd+C and swallows the key", async () => {
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    vi.spyOn(XTerm.prototype, "hasSelection").mockReturnValue(true)
    vi.spyOn(XTerm.prototype, "getSelection").mockReturnValue("picked text")
    const copy = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "c",
      metaKey: true,
    })
    helper().dispatchEvent(copy)
    expect(clipboardWrite).toHaveBeenCalledWith("picked text")
    expect(copy.defaultPrevented).toBe(true)
    vi.restoreAllMocks()
  })

  it("copies on bare Ctrl+C when there is a selection", async () => {
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    vi.spyOn(XTerm.prototype, "hasSelection").mockReturnValue(true)
    vi.spyOn(XTerm.prototype, "getSelection").mockReturnValue("picked text")
    const e = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "c",
      ctrlKey: true,
    })
    helper().dispatchEvent(e)
    expect(clipboardWrite).toHaveBeenCalledWith("picked text")
    expect(e.defaultPrevented).toBe(true)
    vi.restoreAllMocks()
  })

  it("leaves a bare Ctrl+C alone when nothing is selected", async () => {
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    const interrupt = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "c",
      ctrlKey: true,
    })
    helper().dispatchEvent(interrupt)
    // Not swallowed: an intercepted Ctrl+C would be preventDefault'ed for the
    // copy, and a shell would never see the interrupt.
    expect(interrupt.defaultPrevented).toBe(false)
    expect(clipboardWrite).not.toHaveBeenCalled()
  })
})

describe("the search box", () => {
  const open = async () => {
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
    fireEvent.keyDown(helper(), { key: "f", metaKey: true, bubbles: true, cancelable: true })
    return await screen.findByPlaceholderText("terminal.search")
  }

  it("searches as you type, and offers both directions", async () => {
    const input = await open()
    await userEvent.type(input, "err")
    expect(search.findNext).toHaveBeenLastCalledWith("err")

    search.findNext.mockClear()
    await userEvent.click(screen.getByLabelText("terminal.searchNext"))
    expect(search.findNext).toHaveBeenCalledWith("err")
    await userEvent.click(screen.getByLabelText("terminal.searchPrev"))
    expect(search.findPrevious).toHaveBeenCalledWith("err")
  })

  it("closes on Escape and on the close button", async () => {
    let input = await open()
    fireEvent.keyDown(input, { key: "Escape" })
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("terminal.search")).not.toBeInTheDocument(),
    )
    input = await open()
    await userEvent.click(screen.getByLabelText("common.cancel"))
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("terminal.search")).not.toBeInTheDocument(),
    )
  })
})

describe("dropping files on it", () => {
  it("types their quoted paths at the cursor", async () => {
    const { container } = await mount("t1")
    const host = container.querySelector("[data-terminal-id]") as HTMLElement
    vi.spyOn(document, "elementFromPoint").mockReturnValue(host)
    onDrop?.({
      payload: { type: "drop", position: { x: 5, y: 5 }, paths: ["/tmp/a b.ts", "/tmp/c.ts"] },
    })
    // Quoted, space-separated, with a trailing space so the next word is separate.
    await waitFor(() => expect(ptyWrite).toHaveBeenCalled())
    const written = vi
      .mocked(ptyWrite)
      .mock.calls.map(([, d]) => d)
      .join("")
    expect(written).toContain("c.ts")
    expect(written).toContain("a b.ts")
    vi.restoreAllMocks()
  })

  it("ignores a drop on another pane", async () => {
    await mount("t1")
    vi.spyOn(document, "elementFromPoint").mockReturnValue(document.createElement("div"))
    ptyWrite.mockClear()
    expect(onDrop, "the drop bridge was never wired").toBeTruthy()
    onDrop?.({ payload: { type: "drop", position: { x: 0, y: 0 }, paths: ["/tmp/a.ts"] } })
    expect(ptyWrite).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it("ignores an empty drop", async () => {
    await mount("t1")
    ptyWrite.mockClear()
    expect(onDrop, "the drop bridge was never wired").toBeTruthy()
    onDrop?.({ payload: { type: "drop", position: { x: 0, y: 0 }, paths: [] } })
    expect(ptyWrite).not.toHaveBeenCalled()
  })
})

describe("more of the keyboard handler", () => {
  const key = (init: KeyboardEventInit) =>
    fireEvent.keyDown(helper(), { bubbles: true, cancelable: true, ...init })

  const ready = async () => {
    await mount("t1")
    await waitFor(() => expect(listeners.has("pty-output-t1")).toBe(true))
  }

  it("leaves a keyup alone — the handler is about keydown", async () => {
    await ready()
    fireEvent.keyUp(helper(), { key: "v", metaKey: true })
    expect(clipboardRead).not.toHaveBeenCalled()
  })

  it("copies nothing — and swallows nothing — when there is no selection", async () => {
    await ready()
    const e = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "c",
      ctrlKey: true,
      shiftKey: true,
    })
    helper().dispatchEvent(e)
    // An empty selection must not put an empty string on the clipboard — and
    // the key must fall through to the shell rather than being eaten.
    expect(clipboardWrite).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
  })

  it("opens search on Ctrl+Shift+F as well as Cmd+F", async () => {
    await ready()
    key({ key: "f", ctrlKey: true, shiftKey: true })
    expect(await screen.findByPlaceholderText("terminal.search")).toBeInTheDocument()
  })

  it("pastes on Ctrl+Shift+V too", async () => {
    clipboardRead.mockResolvedValue("echo hi")
    await ready()
    key({ key: "v", ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(ptyWrite).toHaveBeenCalledWith("t1", "echo hi"))
  })

  it("survives a clipboard that can't be read", async () => {
    clipboardRead.mockRejectedValue(new Error("no permission"))
    clipboardImageToTemp.mockResolvedValue(null)
    await ready()
    key({ key: "v", metaKey: true })
    await waitFor(() => expect(clipboardImageToTemp).toHaveBeenCalled())
  })

  it("leaves a plain Enter to the shell", async () => {
    await ready()
    ptyWrite.mockClear()
    await userEvent.type(helper(), "{Enter}")
    // It reaches the shell as a plain CR — the negative alone also passes if
    // Enter did nothing at all.
    expect(ptyWrite).toHaveBeenCalledWith("t1", "\r")
    expect(ptyWrite).not.toHaveBeenCalledWith("t1", "\x1b\r")
  })
})

describe("the terminal's appearance", () => {
  // Re-fitting on a font or zoom change isn't asserted here: `syncSize` only
  // acts when the fit reports new rows/cols, and happy-dom measures the host at
  // 0×0, so there is nothing to observe that isn't the harness. The other half
  // of the same zoom behaviour — the counter-scale wrapper — is plain DOM:

  it("counter-scales the host so the terminal carries no net zoom transform", async () => {
    useSettings.setState({ zoom: 2 })
    await mount("t1")
    const wrap = (document.querySelector("[data-terminal-id]") as HTMLElement)
      .parentElement as HTMLElement
    // Scaled by 1/zoom and sized at zoom×, so xterm maps mouse coordinates in
    // an untransformed space while still filling the panel.
    expect(wrap.style.transform).toBe("scale(0.5)")
    expect(wrap.style.width).toBe("200%")
    expect(wrap.style.height).toBe("200%")
  })

  it("re-themes when the app theme changes under it", async () => {
    await mount("t1")
    expect(xtermTheme).toHaveBeenCalledTimes(1)
    document.documentElement.dataset.theme = "reado-dark"
    // The observer re-resolves the tokens rather than leaving the terminal in
    // the old palette — white text on a light surface is the failure mode.
    await waitFor(() => expect(xtermTheme).toHaveBeenCalledTimes(2))
    document.documentElement.removeAttribute("data-theme")
  })
})

describe("an inactive pane", () => {
  it("stays mounted without taking focus", async () => {
    const { container } = render(<Terminal id="t2" cwd="/repo" active={false} />)
    await waitFor(() =>
      expect(ptySpawn).toHaveBeenCalledWith("t2", "/repo", expect.any(Number), expect.any(Number)),
    )
    expect(container.querySelector(".xterm")).toBeTruthy()
    // The pane keeps its PTY, but the caret belongs to the focused one.
    expect(document.activeElement).not.toBe(container.querySelector(".xterm-helper-textarea"))
  })
})
