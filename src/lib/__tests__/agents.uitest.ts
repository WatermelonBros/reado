// Launching and talking to AI agents in the embedded terminal: shell-correct
// launch commands, prompt sanitising, and never writing a prompt into a shell.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock("../api", () => ({
  agentInstalled: vi.fn(async () => true),
  ptyDefaultShell: vi.fn(async () => "/bin/zsh"),
  ptyWrite: vi.fn(async () => {}),
  submitToTerminal: vi.fn(),
}))
vi.mock("../claudeTheme", () => ({ syncClaudeTheme: vi.fn(async () => {}) }))
vi.mock("../store", () => ({ useProject: { getState: () => ({ root: "/root" }) } }))
vi.mock("@/i18n", () => ({ t: (k: string) => k }))

const show = vi.fn()
vi.mock("../notice", () => ({ useNotice: { getState: () => ({ show }) } }))

const term = {
  sessions: [] as Array<{ id: string }>,
  activeId: null as string | null,
  agentTerminals: [] as string[],
  lastAgent: null as string | null,
  // The real store hands out a snapshot, so a caller that captured the state
  // before add() still sees the old activeId — mirror that here.
  add: vi.fn(() => {
    term.sessions.push({ id: "new" })
    return "new"
  }),
  setActive: vi.fn((id: string) => {
    term.activeId = id
  }),
  toggle: vi.fn(),
  markAgent: vi.fn(),
  restart: vi.fn(),
}
vi.mock("../terminals", () => ({ useTerminals: { getState: () => term } }))

import {
  AGENT_BIN,
  AGENT_ORDER,
  agentLaunchCommand,
  clearTerminal,
  dispatchToAgent,
  launchAgent,
  restartTerminal,
  runInShell,
  runInTerminal,
  sanitizePromptText,
} from "@/lib/agents"
import { agentInstalled, ptyWrite, submitToTerminal } from "@/lib/api"

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks keeps implementations, so restore the defaults a test may have
  // swapped out (an agent that isn't installed, a probe that throws).
  vi.mocked(agentInstalled).mockResolvedValue(true)
  term.sessions = []
  term.activeId = null
  term.agentTerminals = []
  term.lastAgent = null
})
afterEach(() => vi.useRealTimers())

describe("AGENT_BIN / AGENT_ORDER", () => {
  it("registers a binary for every offered agent", () => {
    expect(AGENT_ORDER.every((a) => AGENT_BIN[a])).toBe(true)
    expect(AGENT_ORDER).toHaveLength(Object.keys(AGENT_BIN).length)
  })
})

describe("agentLaunchCommand", () => {
  it("sets READO_AGENT the POSIX way", () => {
    // `codex` has no verified system-prompt flag, so it launches bare.
    expect(agentLaunchCommand("posix", "codex", "codex")).toBe("READO_AGENT=codex codex")
  })

  it("tells an agent it can reach that it must sign off each turn", () => {
    const cmd = agentLaunchCommand("posix", "claude-code", "claude")
    expect(cmd.startsWith("READO_AGENT=claude-code claude ")).toBe(true)
    expect(cmd).toContain("--append-system-prompt")
    expect(cmd).toContain("session_done")
    // Single-quoted, and the rule carries no quote of its own to break out with.
    expect(cmd.split("--append-system-prompt ")[1]).toMatch(/^'[^']+'$/)
  })

  it("launches bare when the CLI has no verified flag, rather than guessing one", () => {
    // A wrong flag doesn't degrade — the agent fails to boot. Those still get
    // the rule through the MCP server's own instructions.
    for (const [agent, bin] of [
      ["codex", "codex"],
      ["gemini", "gemini"],
      ["copilot", "copilot"],
      ["opencode", "opencode"],
    ] as const) {
      expect(agentLaunchCommand("posix", agent, bin)).toBe(`READO_AGENT=${agent} ${bin}`)
    }
  })

  it("uses $env: on PowerShell", () => {
    expect(agentLaunchCommand("powershell", "codex", "codex")).toBe(
      '$env:READO_AGENT="codex"; codex',
    )
  })

  it('uses set "…" && on cmd', () => {
    expect(agentLaunchCommand("cmd", "gemini", "gemini")).toBe('set "READO_AGENT=gemini" && gemini')
  })
})

describe("sanitizePromptText", () => {
  it("strips the characters a shell would expand", () => {
    expect(sanitizePromptText("rm `whoami` $HOME \\x")).toBe("rm whoami HOME x")
  })

  it("collapses newlines so the prompt submits as one message", () => {
    expect(sanitizePromptText("a\n\nb\tc  d")).toBe("a b c d")
  })

  it("trims and caps the length", () => {
    expect(sanitizePromptText("  hi  ")).toBe("hi")
    expect(sanitizePromptText("x".repeat(900))).toHaveLength(500)
  })
})

describe("runInTerminal", () => {
  it("uses the focused terminal with no delay", () => {
    term.activeId = "t1"
    runInTerminal("ls")
    expect(submitToTerminal).toHaveBeenCalledWith("t1", "ls", 0)
  })

  it("opens one when nothing is focused, and waits for it to boot", () => {
    runInTerminal("ls")
    expect(term.add).toHaveBeenCalled()
    expect(submitToTerminal).toHaveBeenCalledWith("new", "ls", 400)
  })
})

describe("runInShell", () => {
  it("uses the focused pane when it's a shell", () => {
    term.sessions = [{ id: "t1" }]
    term.activeId = "t1"
    runInShell("cargo test")
    expect(submitToTerminal).toHaveBeenCalledWith("t1", "cargo test", 0)
    expect(term.toggle).toHaveBeenCalledWith(true)
  })

  it("never runs a command in an agent pane — it switches to a shell one", () => {
    term.sessions = [{ id: "agent" }, { id: "shell" }]
    term.activeId = "agent"
    term.agentTerminals = ["agent"]
    runInShell("cargo test")
    expect(term.setActive).toHaveBeenCalledWith("shell")
    expect(submitToTerminal).toHaveBeenCalledWith("shell", "cargo test", 400)
  })

  it("opens a fresh shell when every pane is an agent", () => {
    term.sessions = [{ id: "agent" }]
    term.activeId = "agent"
    term.agentTerminals = ["agent"]
    runInShell("cargo test")
    expect(term.add).toHaveBeenCalled()
    expect(submitToTerminal).toHaveBeenCalledWith("new", "cargo test", 400)
  })
})

describe("clearTerminal / restartTerminal", () => {
  it("sends Ctrl+L to the focused terminal", () => {
    term.activeId = "t1"
    clearTerminal()
    expect(ptyWrite).toHaveBeenCalledWith("t1", "\x0c")
  })

  it("does nothing with no terminal focused", () => {
    clearTerminal()
    restartTerminal()
    expect(ptyWrite).not.toHaveBeenCalled()
    expect(term.restart).not.toHaveBeenCalled()
  })

  it("restarts the focused terminal in place", () => {
    term.activeId = "t1"
    restartTerminal()
    expect(term.restart).toHaveBeenCalledWith("t1")
  })
})

describe("launchAgent", () => {
  it("launches with the shell-correct command and remembers the pane", async () => {
    term.activeId = "t1"
    await launchAgent("codex", "codex")
    expect(submitToTerminal).toHaveBeenCalledWith("t1", "READO_AGENT=codex codex", 0)
    expect(term.markAgent).toHaveBeenCalledWith("t1", "codex")
  })

  it("bails with a notice when the binary isn't installed", async () => {
    vi.mocked(agentInstalled).mockResolvedValue(false)
    await launchAgent("codex", "codex")
    expect(submitToTerminal).not.toHaveBeenCalled()
    expect(show).toHaveBeenCalledWith("error", "agent.notInstalled")
  })

  it("fails open when the install probe itself errors", async () => {
    vi.mocked(agentInstalled).mockRejectedValue(new Error("spawn failed"))
    term.activeId = "t1"
    await launchAgent("codex", "codex")
    expect(submitToTerminal).toHaveBeenCalled()
  })
})

describe("dispatchToAgent", () => {
  it("pastes and submits into a pane that already holds an agent", async () => {
    vi.useFakeTimers()
    term.activeId = "t1"
    term.agentTerminals = ["t1"]
    const done = dispatchToAgent("explain this")
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(done).resolves.toBe(true)
    // The Enter is a separate write, after the paste has rendered.
    expect(vi.mocked(ptyWrite).mock.calls[0]).toEqual(["t1", "explain this"])
    expect(vi.mocked(ptyWrite).mock.calls[1]).toEqual(["t1", "\r"])
    // No output followed the first Enter → press it once more.
    expect(vi.mocked(ptyWrite).mock.calls[2]).toEqual(["t1", "\r"])
    expect(submitToTerminal).not.toHaveBeenCalled() // nothing launched
  })

  it("reports failure — instead of hanging a caller — when no agent is installed", async () => {
    vi.mocked(agentInstalled).mockResolvedValue(false)
    term.activeId = "t1"
    await expect(dispatchToAgent("explain this")).resolves.toBe(false)
    expect(ptyWrite).not.toHaveBeenCalled()
    expect(show).toHaveBeenCalledWith("error", "agent.notInstalled")
  })

  it("launches the last-used agent first when the pane is a bare shell", async () => {
    vi.useFakeTimers()
    term.activeId = "t1"
    term.lastAgent = "codex"
    const done = dispatchToAgent("review this")
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(done).resolves.toBe(true)
    expect(submitToTerminal).toHaveBeenCalledWith("t1", "READO_AGENT=codex codex", 0)
    expect(term.markAgent).toHaveBeenCalledWith("t1", "codex")
    expect(vi.mocked(ptyWrite).mock.calls[0]).toEqual(["t1", "review this"])
  })

  it("auto-picks the first installed agent when none was ever used", async () => {
    vi.useFakeTimers()
    // Only codex is on PATH: claude isn't.
    vi.mocked(agentInstalled).mockImplementation(async (bin: string) => bin === "codex")
    term.activeId = "t1"
    const done = dispatchToAgent("review this")
    await vi.advanceTimersByTimeAsync(30_000)
    await done
    expect(submitToTerminal).toHaveBeenCalledWith("t1", "READO_AGENT=codex codex", 0)
  })
})
