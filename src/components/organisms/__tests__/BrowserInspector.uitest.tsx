// UI test: Reado's own devtools for the preview — Console, Network, Elements and
// Application. It reads the captured stream from the preview store and talks to
// the page through the single `previewEval` channel, which is mocked here.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const previewEval = vi.fn<(script: string) => Promise<string>>(async () => "null")
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  previewEval: (s: string) => previewEval(s),
}))
const dispatchToAgent = vi.fn<(prompt: string) => Promise<boolean>>(async () => true)
vi.mock("../../../lib/agents", async (orig) => ({
  ...(await orig<typeof import("../../../lib/agents")>()),
  dispatchToAgent: (p: string) => dispatchToAgent(p),
}))

import { BrowserInspector } from "@/components/organisms/BrowserInspector"
import { defaultLayout, useLayout } from "@/lib/layout"
import { type LogEntry, type NetEntry, usePreview } from "@/lib/preview"

const log = (over: Partial<LogEntry> = {}): LogEntry => ({
  level: "log",
  args: ["hello"],
  t: 1,
  ...over,
})
const net = (over: Partial<NetEntry> = {}): NetEntry => ({
  id: 1,
  method: "GET",
  url: "https://api.example/items",
  status: 200,
  ok: true,
  ms: 12,
  t: 1,
  ...over,
})

/** The last script handed to the page. */
const lastScript = () => vi.mocked(previewEval).mock.lastCall?.[0] ?? ""

beforeEach(() => {
  vi.clearAllMocks()
  previewEval.mockResolvedValue("null")
  usePreview.setState({
    logs: [],
    net: [],
    inspector: true,
    inspectorPos: "bottom",
    inspectorDetached: false,
    inspectRequest: null,
  })
  useLayout.setState({ layout: defaultLayout() })
})

describe("the console", () => {
  it("is empty until the page says something", () => {
    render(<BrowserInspector />)
    expect(screen.getByText("inspector.emptyConsole")).toBeInTheDocument()
  })

  it("shows each entry with its source and stack", () => {
    usePreview.setState({
      logs: [log({ level: "error", args: ["boom"], source: "app.js:12", stack: "at f()" })],
    })
    render(<BrowserInspector />)
    expect(screen.getByText("boom")).toBeInTheDocument()
    expect(screen.getByText("app.js:12")).toBeInTheDocument()
    expect(screen.getByText("at f()")).toBeInTheDocument()
  })

  it("formats non-string arguments as JSON", () => {
    usePreview.setState({ logs: [log({ args: [{ a: 1 }, 2] })] })
    render(<BrowserInspector />)
    expect(screen.getByText('{"a":1} 2')).toBeInTheDocument()
  })

  it("filters by text", async () => {
    usePreview.setState({ logs: [log({ args: ["keep me"] }), log({ args: ["drop me"] })] })
    render(<BrowserInspector />)
    await userEvent.type(screen.getByPlaceholderText("inspector.filter"), "keep")
    expect(screen.getByText("keep me")).toBeInTheDocument()
    expect(screen.queryByText("drop me")).not.toBeInTheDocument()
  })

  it("narrows to errors only", async () => {
    usePreview.setState({
      logs: [log({ args: ["chatter"] }), log({ level: "error", args: ["boom"] })],
    })
    render(<BrowserInspector />)
    await userEvent.click(screen.getByLabelText("inspector.errorsOnly"))
    expect(screen.queryByText("chatter")).not.toBeInTheDocument()
    expect(screen.getByText("boom")).toBeInTheDocument()
  })

  it("hands an error to the terminal agent as fix-me context", async () => {
    usePreview.setState({
      logs: [log({ level: "error", args: ["TypeError: x"], source: "app.js:3", stack: "at f" })],
    })
    render(<BrowserInspector />)
    await userEvent.click(screen.getByLabelText("inspector.sendToAgent"))
    const prompt = vi.mocked(dispatchToAgent).mock.lastCall?.[0] ?? ""
    expect(prompt).toContain("TypeError: x")
    expect(prompt).toContain("at app.js:3")
    expect(prompt).toContain("Please find the cause and fix it.")
  })

  it("offers 'send to agent' only on errors", () => {
    usePreview.setState({ logs: [log({ args: ["just a log"] })] })
    render(<BrowserInspector />)
    // The row is there — it just carries no action.
    expect(screen.getByText("just a log")).toBeInTheDocument()
    expect(screen.queryByLabelText("inspector.sendToAgent")).not.toBeInTheDocument()
  })

  it("evaluates an expression in the page and echoes both sides", async () => {
    previewEval.mockResolvedValue('"My page"')
    render(<BrowserInspector />)
    await userEvent.type(screen.getByPlaceholderText("inspector.evaluate"), "document.title{Enter}")
    await waitFor(() => expect(usePreview.getState().logs).toHaveLength(2))
    expect(usePreview.getState().logs[0].args[0]).toBe("› document.title")
    expect(usePreview.getState().logs[1].level).toBe("result")
    expect(lastScript()).toBe("(document.title)")
  })

  it("reports a failed evaluation as an error, not a silent nothing", async () => {
    previewEval.mockRejectedValue(new Error("ReferenceError"))
    render(<BrowserInspector />)
    await userEvent.type(screen.getByPlaceholderText("inspector.evaluate"), "nope{Enter}")
    await waitFor(() => expect(usePreview.getState().logs[1].level).toBe("error"))
  })

  it("ignores an empty expression", async () => {
    render(<BrowserInspector />)
    await userEvent.type(screen.getByPlaceholderText("inspector.evaluate"), "   {Enter}")
    expect(usePreview.getState().logs).toHaveLength(0)
  })

  it("clears both the captured stream and the page's buffer", async () => {
    usePreview.setState({ logs: [log()], net: [net()] })
    render(<BrowserInspector />)
    await userEvent.click(screen.getByLabelText("inspector.clear"))
    expect(usePreview.getState().logs).toEqual([])
    expect(lastScript()).toContain("clear()")
  })
})

describe("the network tab", () => {
  const openNetwork = async () => {
    render(<BrowserInspector />)
    await userEvent.click(screen.getByText(/inspector\.network/))
  }

  it("counts the requests on its tab", () => {
    usePreview.setState({ net: [net(), net({ id: 2 })] })
    render(<BrowserInspector />)
    expect(screen.getByText("(2)")).toBeInTheDocument()
  })

  it("lists method, status, url and timing", async () => {
    usePreview.setState({ net: [net()] })
    await openNetwork()
    expect(screen.getByText("GET")).toBeInTheDocument()
    expect(screen.getByText("200")).toBeInTheDocument()
    expect(screen.getByText("12ms")).toBeInTheDocument()
  })

  it("shows a request still in flight, and one that failed", async () => {
    usePreview.setState({
      net: [net({ id: 1, status: undefined }), net({ id: 2, status: undefined, error: "abort" })],
    })
    await openNetwork()
    expect(screen.getByText("…")).toBeInTheDocument()
    expect(screen.getByText("ERR")).toBeInTheDocument()
  })

  it("counts websocket frames", async () => {
    usePreview.setState({ net: [net({ method: "WS", frames: 7 })] })
    await openNetwork()
    expect(screen.getByText("7▾")).toBeInTheDocument()
  })

  it("opens a detail panel with headers and a pretty-printed body", async () => {
    usePreview.setState({
      net: [
        net({
          reqHeaders: { accept: "application/json" },
          resHeaders: { "content-type": "application/json" },
          resBody: '{"ok":true}',
        }),
      ],
    })
    await openNetwork()
    await userEvent.click(screen.getByText("https://api.example/items"))
    expect(screen.getByText("inspector.general")).toBeInTheDocument()
    expect(screen.getByText("accept")).toBeInTheDocument()
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument()
  })

  it("leaves a non-JSON body alone", async () => {
    usePreview.setState({ net: [net({ resBody: "plain text" })] })
    await openNetwork()
    await userEvent.click(screen.getByText("https://api.example/items"))
    expect(screen.getByText("plain text")).toBeInTheDocument()
  })

  it("closes the detail panel again", async () => {
    usePreview.setState({ net: [net()] })
    await openNetwork()
    await userEvent.click(screen.getByText("https://api.example/items"))
    await userEvent.click(screen.getByLabelText("inspector.close"))
    expect(screen.queryByText("inspector.general")).not.toBeInTheDocument()
  })

  it("filters by URL", async () => {
    usePreview.setState({ net: [net(), net({ id: 2, url: "https://cdn.example/app.js" })] })
    await openNetwork()
    await userEvent.type(screen.getByPlaceholderText("inspector.filter"), "cdn")
    expect(screen.queryByText("https://api.example/items")).not.toBeInTheDocument()
    expect(screen.getByText("https://cdn.example/app.js")).toBeInTheDocument()
  })
})

describe("the elements tab", () => {
  const DOM = {
    tag: "html",
    attrs: [["lang", "en"]],
    text: "",
    n: 1,
    kids: [
      {
        tag: "body",
        attrs: [],
        text: "",
        n: 1,
        kids: [{ tag: "h1", attrs: [["class", "title"]], text: "Hello", n: 0, kids: [] }],
      },
    ],
  }

  const openElements = async () => {
    previewEval.mockImplementation(async (s: string) =>
      s.includes("documentElement") ? JSON.stringify(DOM) : "null",
    )
    render(<BrowserInspector />)
    await userEvent.click(screen.getByText("inspector.elements"))
  }

  it("renders the page's DOM as markup", async () => {
    await openElements()
    // Each tag renders twice: its opening mark and its closing one.
    expect(await screen.findAllByText("html")).toHaveLength(2)
    expect(screen.getAllByText("h1")).toHaveLength(2)
    expect(screen.getByText("Hello")).toBeInTheDocument()
    expect(screen.getByText('"title"')).toBeInTheDocument()
  })

  it("collapses and expands a node", async () => {
    await openElements()
    await screen.findAllByText("html")
    // The tree's own chevron is labelled through `@/i18n` directly (it renders
    // outside a component that takes `t` from the hook), so it carries the real
    // translation rather than the key.
    await userEvent.click(screen.getAllByLabelText("Collapse")[0])
    expect(screen.queryAllByText("h1")).toHaveLength(0)
    await userEvent.click(screen.getAllByLabelText("Expand")[0])
    expect(await screen.findAllByText("h1")).not.toHaveLength(0)
  })

  it("highlights the hovered node in the page", async () => {
    await openElements()
    const tag = (await screen.findAllByText("h1"))[0]
    fireEvent.mouseEnter(tag.closest("div") as HTMLElement)
    expect(lastScript()).toContain(".hi(")
  })

  it("turns element picking on in the page", async () => {
    await openElements()
    await userEvent.click(screen.getByLabelText("inspector.pick"))
    expect(lastScript()).toContain("setPick(true)")
  })

  it("says so when the page isn't ready", async () => {
    previewEval.mockRejectedValue(new Error("no preview"))
    render(<BrowserInspector />)
    await userEvent.click(screen.getByText("inspector.elements"))
    expect(await screen.findByText("inspector.emptyElements")).toBeInTheDocument()
  })

  it("opens on the node a right-click 'inspect' asked for", async () => {
    previewEval.mockImplementation(async (s: string) =>
      s.includes("documentElement") ? JSON.stringify(DOM) : "null",
    )
    render(<BrowserInspector />)
    usePreview.setState({ inspectRequest: [0, 0] })
    expect(await screen.findAllByText("h1")).not.toHaveLength(0)
    // The page is asked to highlight that exact node — [0,0] is body's first
    // child, i.e. the h1 — not merely "the elements tab opened".
    await waitFor(() =>
      expect(vi.mocked(previewEval).mock.calls.some(([s]) => s.includes(".hi([0,0])"))).toBe(true),
    )
    // The request is consumed, so it doesn't re-fire on the next render.
    expect(usePreview.getState().inspectRequest).toBeNull()
  })
})

describe("the application tab", () => {
  const STORAGE = {
    cookies: "session=abc; theme=dark",
    local: [["token", "xyz"]],
    session: [],
  }
  const openApplication = async () => {
    previewEval.mockImplementation(async (s: string) =>
      s.includes("localStorage)") ? JSON.stringify(STORAGE) : "null",
    )
    render(<BrowserInspector />)
    await userEvent.click(screen.getByText("inspector.application"))
  }

  it("lists cookies and storage, parsed into key/value pairs", async () => {
    await openApplication()
    expect(await screen.findByText("session")).toBeInTheDocument()
    expect(screen.getByText("theme")).toBeInTheDocument()
    expect(screen.getByText("token")).toBeInTheDocument()
  })

  it("writes an edited value back through the page", async () => {
    await openApplication()
    await screen.findByText("token")
    const input = screen.getByDisplayValue("xyz")
    await userEvent.clear(input)
    await userEvent.type(input, "new{Enter}")
    await waitFor(() =>
      expect(
        vi.mocked(previewEval).mock.calls.some(([s]) => s.includes('localStorage.setItem("token"')),
      ).toBe(true),
    )
  })

  it("deletes a key", async () => {
    await openApplication()
    await screen.findByText("token")
    await userEvent.click(screen.getAllByLabelText("inspector.deleteKey")[2])
    // Which key matters: "some call mentioned removeItem" passes for a button
    // that deletes the wrong row.
    await waitFor(() =>
      expect(
        vi
          .mocked(previewEval)
          .mock.calls.some(([s]) => s.includes('localStorage.removeItem("token")')),
      ).toBe(true),
    )
  })

  it("adds a new key", async () => {
    await openApplication()
    await screen.findByText("token")
    const keys = screen.getAllByPlaceholderText("inspector.newKey")
    const values = screen.getAllByPlaceholderText("inspector.newValue")
    await userEvent.type(keys[1], "flag")
    await userEvent.type(values[1], "on{Enter}")
    await waitFor(() =>
      expect(
        vi.mocked(previewEval).mock.calls.some(([s]) => s.includes('setItem("flag","on")')),
      ).toBe(true),
    )
  })

  it("won't add a nameless key", async () => {
    await openApplication()
    await screen.findByText("token")
    const values = screen.getAllByPlaceholderText("inspector.newValue")
    previewEval.mockClear()
    await userEvent.type(values[0], "orphan{Enter}")
    expect(previewEval).not.toHaveBeenCalled()
  })
})

describe("where it lives", () => {
  it("flips between docking bottom and right inside the pane", async () => {
    render(<BrowserInspector />)
    await userEvent.click(screen.getByLabelText("inspector.dock"))
    expect(usePreview.getState().inspectorPos).toBe("right")
  })

  it("detaches into the layout, following the side it was on", async () => {
    usePreview.setState({ inspectorPos: "right" })
    render(<BrowserInspector />)
    await userEvent.click(screen.getByLabelText("inspector.detach"))
    expect(usePreview.getState().inspectorDetached).toBe(true)
    expect(
      useLayout.getState().layout.areas.right.groups.some((g) => g.tabs.includes("inspector")),
    ).toBe(true)
  })

  it("offers re-attach — not the position toggle — once docked", async () => {
    render(<BrowserInspector docked />)
    expect(screen.queryByLabelText("inspector.dock")).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText("inspector.attach"))
    expect(usePreview.getState().inspectorDetached).toBe(false)
    expect(
      useLayout.getState().layout.areas.right.groups.some((g) => g.tabs.includes("inspector")),
    ).toBe(false)
  })
})
