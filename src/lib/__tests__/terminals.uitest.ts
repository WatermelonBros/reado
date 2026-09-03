// Terminal panel state store — sessions, groups (splits), active tracking.
// Pure state (PTY lifecycle lives in the component). Mock only the logger.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
  // `api` routes every command through this; the drop test reaches ptyWrite.
  tracedInvoke: vi.fn(async () => null),
  safeError: String,
}))

import { findPanel, useLayout } from "@/lib/layout"
import { tracedInvoke } from "@/lib/logger"
import { useSettings } from "@/lib/store"
import { dropPathsIntoTerminal, shellQuote, terminalLinks, useTerminals } from "@/lib/terminals"

const T = () => useTerminals.getState()

beforeEach(() => {
  useTerminals.setState({
    sessions: [],
    activeId: null,
    groups: [],
    activeGroupId: null,
    agentTerminals: [],
    lastAgent: null,
    open: false,
  })
})

describe("useTerminals — panel geometry", () => {
  it("clamps height and width", () => {
    T().setHeight(1)
    expect(T().height).toBe(120)
    T().setHeight(999999)
    expect(T().height).toBe(window.innerHeight - 160)
    T().setWidth(1)
    expect(T().width).toBe(240)
  })
  it("togglePosition moves the panel in the layout model", () => {
    // The store keeps no copy of where the terminal sits — dragging it to
    // another dock would have desynced one.
    const area = () => findPanel(useLayout.getState().layout, "terminal")?.area
    useLayout.getState().reset()
    expect(area()).toBe("bottom")
    T().togglePosition()
    expect(area()).toBe("right")
    T().togglePosition()
    expect(area()).toBe("bottom")
  })
})

describe("useTerminals — sessions & groups", () => {
  it("add creates a session in its own group and focuses it", () => {
    const id = T().add()
    expect(T().sessions.map((s) => s.id)).toEqual([id])
    expect(T().groups).toHaveLength(1)
    expect(T().groups[0].paneIds).toEqual([id])
    expect(T().activeId).toBe(id)
    expect(T().open).toBe(true)
  })

  it("split adds a pane to the active group", () => {
    const a = T().add()
    const b = T().split()
    expect(T().sessions).toHaveLength(2)
    expect(T().groups).toHaveLength(1)
    expect(T().groups[0].paneIds).toEqual([a, b])
    expect(T().activeId).toBe(b)
  })

  it("split with no active group falls back to add (new group)", () => {
    const b = T().split()
    expect(T().groups).toHaveLength(1)
    expect(T().activeId).toBe(b)
  })

  it("remove drops the session and prunes an emptied group", () => {
    const a = T().add()
    T().remove(a)
    expect(T().sessions).toHaveLength(0)
    expect(T().groups).toHaveLength(0)
    expect(T().activeId).toBeNull()
  })

  it("remove of one pane keeps the group with the rest", () => {
    const a = T().add()
    const b = T().split()
    T().remove(a)
    expect(T().sessions.map((s) => s.id)).toEqual([b])
    expect(T().groups[0].paneIds).toEqual([b])
  })

  it("restart swaps the id in place and clears its agent flag", () => {
    const a = T().add()
    T().markAgent(a, "claude")
    T().restart(a)
    const nid = T().sessions[0].id
    expect(nid).not.toBe(a)
    expect(T().activeId).toBe(nid)
    expect(T().agentTerminals).not.toContain(a)
  })

  it("restart is a no-op for an unknown id", () => {
    const before = T().sessions
    T().restart("nope")
    expect(T().sessions).toBe(before)
  })

  it("markAgent records the terminal + last agent, idempotently", () => {
    const a = T().add()
    T().markAgent(a, "codex")
    T().markAgent(a, "codex")
    expect(T().agentTerminals).toEqual([a])
    expect(T().lastAgent).toBe("codex")
  })

  it("removeGroup removes the group and all its sessions", () => {
    T().add()
    const g = T().activeGroupId!
    T().split()
    T().removeGroup(g)
    expect(T().groups.find((x) => x.id === g)).toBeUndefined()
    expect(T().sessions).toHaveLength(0)
  })
})

describe("useTerminals — active & layout", () => {
  it("setActive focuses a pane and its owning group", () => {
    const a = T().add()
    T().split()
    T().setActive(a)
    expect(T().activeId).toBe(a)
    expect(T().activeGroupId).toBe(T().groups[0].id)
  })

  it("setActiveGroup focuses the group's first pane", () => {
    const a = T().add()
    const g = T().activeGroupId!
    T().add() // second group
    T().setActiveGroup(g)
    expect(T().activeId).toBe(a)
  })

  it("setGroupDir toggles or sets the split axis", () => {
    T().add()
    const g = T().activeGroupId!
    expect(T().groups[0].dir).toBe("row")
    T().setGroupDir(g)
    expect(T().groups[0].dir).toBe("column")
    T().setGroupDir(g, "row")
    expect(T().groups[0].dir).toBe("row")
  })

  it("setSizes and setTitle update the group / session", () => {
    const a = T().add()
    const g = T().activeGroupId!
    T().setSizes(g, [2, 1])
    expect(T().groups[0].sizes).toEqual([2, 1])
    T().setTitle(a, "build")
    expect(T().sessions[0].title).toBe("build")
  })

  it("toggle opens (creating the first terminal) and closes", () => {
    T().toggle()
    expect(T().open).toBe(true)
    expect(T().sessions).toHaveLength(1)
    T().toggle()
    expect(T().open).toBe(false)
    T().toggle(true)
    expect(T().open).toBe(true)
  })

  it("opening the terminal reveals the dock it lives in", () => {
    const at = findPanel(useLayout.getState().layout, "terminal")
    if (!at) throw new Error("the terminal should be placed in a dock by default")
    useLayout.getState().toggleArea(at.area, true) // hide it
    T().toggle(true)
    // Without this, the panel's visibility switch silently defeats the
    // terminal's: `open` flips on a region nothing is drawing.
    expect(useLayout.getState().hidden[at.area]).toBe(false)
  })
})

// The link matcher decides what in a line of output is clickable: get it wrong
// and either nothing is a link (the bug this replaced) or prose turns blue.
describe("terminalLinks", () => {
  const one = (text: string) => {
    const links = terminalLinks(text)
    expect(links).toHaveLength(1)
    return links[0]
  }

  it("links a dev server and a bare domain, choosing the scheme", () => {
    expect(one("  ➜  Local:   localhost:5173/").url).toBe("http://localhost:5173/")
    expect(one("serving on 127.0.0.1:8080").url).toBe("http://127.0.0.1:8080")
    expect(one("see google.com for details").url).toBe("https://google.com")
    expect(one("docs at reado.watermelon-studio.it/guide").url).toBe(
      "https://reado.watermelon-studio.it/guide",
    )
  })

  it("links a file path, with its line number when printed", () => {
    const l = one("edited src/lib/api.ts:42:7")
    expect([l.path, l.line]).toEqual(["src/lib/api.ts", 42])
    expect(one("at Terminal.tsx(104,3)").line).toBe(104)
    // A bare filename is the common case: agents rarely print root-relative.
    expect(one("look at Terminal.tsx").path).toBe("Terminal.tsx")
  })

  it("leaves alone what only looks like a link", () => {
    // `localhost` with no port, and a TLD that is really a file extension.
    expect(terminalLinks("run it on localhost then")).toEqual([])
    expect(one("bash deploy.sh").path).toBe("deploy.sh")
    // An email is neither a site nor a file — claimed by neither pass.
    expect(terminalLinks("Author: Ada <ada@example.com>")).toEqual([])
    // Scheme-ful URLs belong to WebLinksAddon, which runs first.
    expect(terminalLinks("open https://google.com/a")).toEqual([])
  })

  it("quotes paths only when the shell needs it", () => {
    expect(shellQuote("/tmp/a-b.png")).toBe("/tmp/a-b.png")
    expect(shellQuote("/tmp/my shot.png")).toBe("'/tmp/my shot.png'")
    expect(shellQuote("/tmp/it's.png")).toBe(`'/tmp/it'\\''s.png'`)
  })
})

describe("the panel's own size", () => {
  it("clamps the height to the window, and never below a usable minimum", () => {
    useSettings.setState({ zoom: 1 })
    useTerminals.getState().setHeight(10)
    expect(useTerminals.getState().height).toBe(120)
    useTerminals.getState().setHeight(100_000)
    expect(useTerminals.getState().height).toBe(window.innerHeight - 160)
  })

  it("clamps the width the same way", () => {
    useTerminals.getState().setWidth(10)
    expect(useTerminals.getState().width).toBe(240)
    useTerminals.getState().setWidth(100_000)
    expect(useTerminals.getState().width).toBe(window.innerWidth - 360)
  })

  it("converts the viewport cap by the interface zoom", () => {
    useSettings.setState({ zoom: 2 })
    useTerminals.getState().setHeight(100_000)
    expect(useTerminals.getState().height).toBe(window.innerHeight / 2 - 160)
    useSettings.setState({ zoom: 1 })
  })
})

describe("panes and groups", () => {
  beforeEach(() => {
    useTerminals.setState({
      sessions: [],
      groups: [],
      activeId: null,
      activeGroupId: null,
      agentTerminals: [],
      open: false,
    })
  })

  it("splitting with nothing open just opens a terminal", () => {
    const id = useTerminals.getState().split()
    expect(useTerminals.getState().groups).toHaveLength(1)
    expect(useTerminals.getState().activeId).toBe(id)
  })

  it("splitting an open group adds a pane and re-evens the sizes", () => {
    useTerminals.getState().add()
    useTerminals.getState().split()
    const g = useTerminals.getState().groups[0]
    expect(g.paneIds).toHaveLength(2)
    expect(g.sizes[0]).toBeCloseTo(0.5)
  })

  it("closing a group takes its panes with it, and moves the focus", () => {
    useTerminals.getState().add()
    const second = useTerminals.getState().add()
    const gid = useTerminals.getState().activeGroupId!
    useTerminals.getState().removeGroup(gid)
    expect(useTerminals.getState().sessions.some((s) => s.id === second)).toBe(false)
    expect(useTerminals.getState().activeId).not.toBe(second)
  })

  it("ignores a close for a group that isn't there", () => {
    useTerminals.getState().add()
    const before = useTerminals.getState().groups
    useTerminals.getState().removeGroup("nope")
    expect(useTerminals.getState().groups).toEqual(before)
  })

  it("focusing a pane focuses its group too", () => {
    const first = useTerminals.getState().add()
    useTerminals.getState().add()
    useTerminals.getState().setActive(first)
    const g = useTerminals.getState().groups.find((x) => x.paneIds.includes(first))
    expect(useTerminals.getState().activeGroupId).toBe(g?.id)
  })

  it("focusing a group focuses its first pane", () => {
    const first = useTerminals.getState().add()
    const gid = useTerminals.getState().activeGroupId!
    useTerminals.getState().add()
    useTerminals.getState().setActiveGroup(gid)
    expect(useTerminals.getState().activeId).toBe(first)
  })

  it("keeps the focus where it is for a group that isn't there", () => {
    const id = useTerminals.getState().add()
    useTerminals.getState().setActiveGroup("nope")
    expect(useTerminals.getState().activeId).toBe(id)
  })

  it("flips a group's axis, or sets it outright", () => {
    useTerminals.getState().add()
    const gid = useTerminals.getState().activeGroupId!
    useTerminals.getState().setGroupDir(gid)
    expect(useTerminals.getState().groups[0].dir).toBe("column")
    useTerminals.getState().setGroupDir(gid, "row")
    expect(useTerminals.getState().groups[0].dir).toBe("row")
  })

  it("renames a pane", () => {
    const id = useTerminals.getState().add()
    useTerminals.getState().setTitle(id, "build")
    expect(useTerminals.getState().sessions[0].title).toBe("build")
  })

  it("remembers which pane runs which agent, once", () => {
    const id = useTerminals.getState().add()
    useTerminals.getState().markAgent(id, "codex")
    useTerminals.getState().markAgent(id, "codex")
    expect(useTerminals.getState().agentTerminals).toEqual([id])
    expect(useTerminals.getState().lastAgent).toBe("codex")
  })

  it("restarting a pane mints a fresh id and forgets its agent", () => {
    const id = useTerminals.getState().add()
    useTerminals.getState().markAgent(id, "codex")
    useTerminals.getState().restart(id)
    expect(useTerminals.getState().sessions[0].id).not.toBe(id)
    expect(useTerminals.getState().agentTerminals).toEqual([])
  })

  it("ignores a restart for a pane that isn't there", () => {
    const before = useTerminals.getState().sessions
    useTerminals.getState().restart("nope")
    expect(useTerminals.getState().sessions).toEqual(before)
  })

  it("opening with nothing running starts the first terminal", () => {
    useTerminals.getState().toggle(true)
    expect(useTerminals.getState().sessions).toHaveLength(1)
    expect(useTerminals.getState().open).toBe(true)
  })

  it("opening again reuses what is already running", () => {
    useTerminals.getState().toggle(true)
    useTerminals.getState().toggle(false)
    useTerminals.getState().toggle(true)
    expect(useTerminals.getState().sessions).toHaveLength(1)
  })
})

describe("dropPathsIntoTerminal", () => {
  it("types the quoted paths into the pane under the pointer", () => {
    const host = document.createElement("div")
    host.dataset.terminalId = "t1"
    document.body.appendChild(host)
    vi.spyOn(document, "elementFromPoint").mockReturnValue(host)
    expect(dropPathsIntoTerminal(5, 5, ["/tmp/a b.ts", "/tmp/c.ts"])).toBe(true)
    // Quoted, space-separated, with a trailing space — an agent reading the
    // prompt gets two paths, not one mangled one.
    expect(tracedInvoke).toHaveBeenCalledWith("pty_write", {
      id: "t1",
      data: "'/tmp/a b.ts' /tmp/c.ts ",
    })
    host.remove()
    vi.restoreAllMocks()
  })

  it("reports no pane when the pointer is elsewhere, or nothing was dropped", () => {
    vi.spyOn(document, "elementFromPoint").mockReturnValue(document.createElement("div"))
    vi.mocked(tracedInvoke).mockClear()
    expect(dropPathsIntoTerminal(5, 5, ["/tmp/a.ts"])).toBe(false)
    expect(tracedInvoke).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    const host = document.createElement("div")
    host.dataset.terminalId = "t1"
    document.body.appendChild(host)
    vi.spyOn(document, "elementFromPoint").mockReturnValue(host)
    vi.mocked(tracedInvoke).mockClear()
    expect(dropPathsIntoTerminal(5, 5, [])).toBe(false)
    expect(tracedInvoke).not.toHaveBeenCalled()
    host.remove()
    vi.restoreAllMocks()
  })
})
