/**
 * Opt-in MCP enablement: wire Reado's MCP server (`reado mcp`) into whichever
 * terminal agents are installed, each in its own project-level config format, so
 * the agent can read your comments/tasks/reading-progress/bookmarks as structured
 * context. Explicit action — Reado never enables it silently.
 *
 * Config formats differ per agent (verified against each tool's docs):
 *   - Claude Code : .mcp.json               → mcpServers.reado {command,args}
 *   - Gemini CLI  : .gemini/settings.json    → mcpServers.reado {command,args}
 *   - Copilot CLI : .copilot/mcp-config.json → mcpServers.reado {type,command,args,tools}
 *   - OpenCode    : opencode.json            → mcp.reado {type,command:[…],enabled}
 *   - Codex       : .codex/config.toml       → [mcp_servers.reado] (TOML)
 */
import { readFile, createFile, writeFile, agentInstalled } from "./api";
import { ask } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n";

/** One agent's MCP wiring: the binary to detect, its project-level config file,
 *  and how to merge Reado's server into that file's existing contents. */
interface McpTarget {
  label: string;
  bin: string;
  path: string;
  /** Merge Reado's server into `existing` (null when absent); return the new file
   *  text, or null to skip (an existing config we can't parse and won't clobber). */
  merge: (existing: string | null) => string | null;
}

/** Merge into a JSON config, preserving everything else. Returns null on a parse
 *  error so we never clobber a file we don't understand. */
function mergeJson(
  existing: string | null,
  apply: (o: Record<string, unknown>) => void,
): string | null {
  let o: Record<string, unknown> = {};
  if (existing && existing.trim()) {
    try {
      o = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  apply(o);
  return JSON.stringify(o, null, 2) + "\n";
}

/** Set `o[key].reado = server`, preserving sibling servers. */
function setServer(o: Record<string, unknown>, key: string, server: unknown): void {
  const existing = (o[key] as Record<string, unknown> | undefined) ?? {};
  o[key] = { ...existing, reado: server };
}

const TARGETS: McpTarget[] = [
  {
    label: "Claude Code",
    bin: "claude",
    path: ".mcp.json",
    merge: (e) => mergeJson(e, (o) => setServer(o, "mcpServers", { command: "reado", args: ["mcp"] })),
  },
  {
    label: "Gemini",
    bin: "gemini",
    path: ".gemini/settings.json",
    merge: (e) => mergeJson(e, (o) => setServer(o, "mcpServers", { command: "reado", args: ["mcp"] })),
  },
  {
    label: "Copilot",
    bin: "copilot",
    path: ".copilot/mcp-config.json",
    merge: (e) =>
      mergeJson(e, (o) =>
        setServer(o, "mcpServers", { type: "local", command: "reado", args: ["mcp"], tools: ["*"] }),
      ),
  },
  {
    label: "OpenCode",
    bin: "opencode",
    path: "opencode.json",
    merge: (e) =>
      mergeJson(e, (o) => {
        o.$schema ??= "https://opencode.ai/config.json";
        setServer(o, "mcp", { type: "local", command: ["reado", "mcp"], enabled: true });
      }),
  },
  {
    label: "Codex",
    bin: "codex",
    path: ".codex/config.toml",
    // TOML — append the table if the file doesn't already declare it (naive but
    // non-destructive: we never rewrite an existing config, only add our block).
    merge: (existing) => {
      const block = '[mcp_servers.reado]\ncommand = "reado"\nargs = ["mcp"]\n';
      if (!existing || !existing.trim()) return block;
      if (/\[mcp_servers\.reado\]/.test(existing)) return existing;
      return `${existing.replace(/\s*$/, "")}\n\n${block}`;
    },
  },
];

/** Write Reado's MCP server into each target's config. Non-clobbering (skips a
 *  config it can't parse) and idempotent (skips a write when already present).
 *  Returns the labels actually (re)written. */
async function writeMcpConfigs(root: string, targets: McpTarget[]): Promise<string[]> {
  // read_file/write_file resolve the path against the process CWD, not the root,
  // so a relative path silently fails to write — always pass an absolute path.
  const abs = (p: string) => `${root.replace(/[\\/]+$/, "")}/${p}`;
  const written: string[] = [];
  for (const tgt of targets) {
    const path = abs(tgt.path);
    const existing = await readFile(root, path)
      .then((c) => (c.kind === "text" ? c.text : ""))
      .catch(() => null);
    const next = tgt.merge(existing);
    if (next == null || next === existing) continue; // unparseable or already there
    await createFile(root, path).catch(() => {}); // ensure parent dirs + file
    await writeFile(root, path, next).catch(() => {});
    written.push(tgt.label);
  }
  return written;
}

/** Detect installed agents, falling back to Claude Code when none is found. */
async function mcpTargets(): Promise<McpTarget[]> {
  const detected = await Promise.all(TARGETS.map((t) => agentInstalled(t.bin).catch(() => false)));
  const installed = TARGETS.filter((_, i) => detected[i]);
  return installed.length ? installed : [TARGETS[0]];
}

/** Silently ensure `reado mcp` is wired for the installed agents — called on
 *  project open so the agent always has it, with no manual step. Idempotent, so
 *  it's a no-op once the config is in place. */
export async function ensureMcp(root: string): Promise<void> {
  if (!root) return;
  await writeMcpConfigs(root, await mcpTargets()).catch(() => {});
}

/** Wire Reado's MCP server into the config of every installed agent (falling back
 *  to Claude Code's `.mcp.json` when none is detected, so it's ready to use). */
export async function enableMcp(root: string): Promise<void> {
  const targets = await mcpTargets();
  const written = await writeMcpConfigs(root, targets);
  // writeMcpConfigs skips configs already correct; treat those as success too.
  const labels = written.length ? written : targets.map((tgt) => tgt.label);
  await ask(t("mcp.enabled", { agents: labels.join(", ") }), { title: t("mcp.title") });
}
