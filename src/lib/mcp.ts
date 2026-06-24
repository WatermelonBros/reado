/**
 * Opt-in MCP enablement: write a project-level `.mcp.json` so the terminal agent
 * (Claude Code reads `.mcp.json` at the project root) connects to Reado's MCP
 * server (`reado mcp`) and can read your comments/tasks/reading-progress/bookmarks
 * as structured context. Explicit action — Reado never enables it silently.
 */
import { readFile, createFile, writeFile } from "./api";
import { ask } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n";

const CONFIG = ".mcp.json";

/** Add Reado's MCP server to the project's `.mcp.json` (merging any existing). */
export async function enableMcp(root: string): Promise<void> {
  let config: { mcpServers?: Record<string, unknown> } = {};
  const existing = await readFile(root, CONFIG).catch(() => null);
  if (existing && existing.kind === "text" && existing.text.trim()) {
    try {
      config = JSON.parse(existing.text);
    } catch {
      // Don't clobber a file we can't parse — bail with a message.
      await ask(t("mcp.parseError"), { title: t("mcp.title"), kind: "error" });
      return;
    }
  }
  config.mcpServers = {
    ...(config.mcpServers ?? {}),
    reado: { command: "reado", args: ["mcp"] },
  };
  await createFile(root, CONFIG).catch(() => {});
  await writeFile(root, CONFIG, JSON.stringify(config, null, 2)).catch(() => {});
  await ask(t("mcp.enabled"), { title: t("mcp.title") });
}
