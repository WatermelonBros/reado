// Wiring `reado mcp` into each installed agent's own config format — merging,
// never clobbering, and idempotent.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(async () => true) }))
vi.mock("../api", () => ({
  agentInstalled: vi.fn(async () => false),
  createFile: vi.fn(async () => {}),
  readFile: vi.fn(async () => ({ kind: "text", text: "" })),
  writeFile: vi.fn(async () => {}),
}))
vi.mock("@/i18n", () => ({ t: (k: string, v?: unknown) => (v ? `${k}:${JSON.stringify(v)}` : k) }))

import { ask } from "@tauri-apps/plugin-dialog"
import { agentInstalled, createFile, readFile, writeFile } from "@/lib/api"
import { enableMcp, ensureMcp } from "@/lib/mcp"

/** What was written to `path`, if anything. */
const writtenTo = (path: string) => vi.mocked(writeFile).mock.calls.find(([, p]) => p === path)?.[2]

/** Pretend only these binaries are on PATH. */
const installed = (...bins: string[]) =>
  vi.mocked(agentInstalled).mockImplementation(async (bin: string) => bins.includes(bin))

/** No config file exists yet. */
const noFiles = () => vi.mocked(readFile).mockRejectedValue(new Error("no such file"))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(agentInstalled).mockResolvedValue(false)
  vi.mocked(readFile).mockResolvedValue({ kind: "text", text: "" })
  vi.mocked(createFile).mockResolvedValue("")
  vi.mocked(writeFile).mockResolvedValue(undefined)
})

describe("ensureMcp", () => {
  it("does nothing without a project", async () => {
    await ensureMcp("")
    expect(agentInstalled).not.toHaveBeenCalled()
  })

  it("falls back to Claude Code's .mcp.json when no agent is detected", async () => {
    noFiles()
    await ensureMcp("/root")
    expect(vi.mocked(writeFile).mock.calls.map(([, p]) => p)).toEqual(["/root/.mcp.json"])
    expect(JSON.parse(writtenTo("/root/.mcp.json") as string)).toEqual({
      mcpServers: { reado: { command: "reado", args: ["mcp"] } },
    })
  })

  it("writes an absolute path — a relative one resolves against the CWD and is lost", async () => {
    noFiles()
    await ensureMcp("/root/")
    expect(writeFile).toHaveBeenCalledWith("/root/", "/root/.mcp.json", expect.any(String))
  })

  it("configures every installed agent in its own format", async () => {
    noFiles()
    installed("gemini", "copilot", "opencode", "codex")
    await ensureMcp("/root")
    const paths = vi.mocked(writeFile).mock.calls.map(([, p]) => p)
    expect(paths).toEqual([
      "/root/.gemini/settings.json",
      "/root/.copilot/mcp-config.json",
      "/root/opencode.json",
      "/root/.codex/config.toml",
    ])
    // Copilot needs the type/tools keys; OpenCode nests under `mcp` with an
    // argv-style command; Codex is TOML.
    expect(
      JSON.parse(writtenTo("/root/.copilot/mcp-config.json") as string).mcpServers.reado,
    ).toEqual({ type: "local", command: "reado", args: ["mcp"], tools: ["*"] })
    const opencode = JSON.parse(writtenTo("/root/opencode.json") as string)
    expect(opencode.mcp.reado).toEqual({
      type: "local",
      command: ["reado", "mcp"],
      enabled: true,
    })
    expect(opencode.$schema).toBe("https://opencode.ai/config.json")
    expect(writtenTo("/root/.codex/config.toml")).toContain("[mcp_servers.reado]")
  })

  it("keeps the other servers already configured", async () => {
    vi.mocked(readFile).mockResolvedValue({
      kind: "text",
      text: JSON.stringify({ mcpServers: { other: { command: "other" } }, extra: 1 }),
    })
    await ensureMcp("/root")
    const cfg = JSON.parse(writtenTo("/root/.mcp.json") as string)
    expect(cfg.mcpServers.other).toEqual({ command: "other" })
    expect(cfg.extra).toBe(1)
    expect(cfg.mcpServers.reado).toBeDefined()
  })

  it("never clobbers a config it can't parse", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "text", text: "{ not json" })
    await ensureMcp("/root")
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("is a no-op when the server is already wired up", async () => {
    vi.mocked(readFile).mockResolvedValue({
      kind: "text",
      text: `${JSON.stringify({ mcpServers: { reado: { command: "reado", args: ["mcp"] } } }, null, 2)}\n`,
    })
    await ensureMcp("/root")
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("appends to an existing Codex TOML instead of rewriting it", async () => {
    installed("codex")
    vi.mocked(readFile).mockResolvedValue({ kind: "text", text: 'model = "o3"\n' })
    await ensureMcp("/root")
    const toml = writtenTo("/root/.codex/config.toml") as string
    expect(toml).toContain('model = "o3"')
    expect(toml).toContain("[mcp_servers.reado]")
  })

  it("leaves a Codex TOML that already declares the server untouched", async () => {
    installed("codex")
    vi.mocked(readFile).mockResolvedValue({
      kind: "text",
      text: '[mcp_servers.reado]\ncommand = "reado"\n',
    })
    await ensureMcp("/root")
    expect(writeFile).not.toHaveBeenCalled()
  })

  it("treats a non-text config as empty rather than failing", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "binary", size: 4 })
    await ensureMcp("/root")
    // "Empty" has to mean a clean config, not a merge against garbage.
    expect(JSON.parse(writtenTo("/root/.mcp.json") as string)).toEqual({
      mcpServers: { reado: { command: "reado", args: ["mcp"] } },
    })
  })

  it("stays silent when a write fails — it runs on every project open", async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error("readonly"))
    await expect(ensureMcp("/root")).resolves.toBeUndefined()
  })
})

describe("enableMcp", () => {
  it("confirms which agents were wired up", async () => {
    noFiles()
    installed("gemini", "codex")
    await enableMcp("/root")
    expect(ask).toHaveBeenCalledWith('mcp.enabled:{"agents":"Gemini, Codex"}', {
      title: "mcp.title",
    })
  })

  it("reports success for configs that were already correct", async () => {
    installed("claude")
    vi.mocked(readFile).mockResolvedValue({
      kind: "text",
      text: `${JSON.stringify({ mcpServers: { reado: { command: "reado", args: ["mcp"] } } }, null, 2)}\n`,
    })
    await enableMcp("/root")
    expect(writeFile).not.toHaveBeenCalled()
    expect(ask).toHaveBeenCalledWith('mcp.enabled:{"agents":"Claude Code"}', expect.anything())
  })
})
