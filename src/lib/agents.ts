/**
 * Launching AI agents in the integrated terminal. The launch command sets
 * `READO_AGENT` using the syntax of the active shell (cmd / PowerShell / POSIX),
 * so it works on every platform. Shared by the terminal toolbar and the menu.
 */
import { ptyDefaultShell, ptyWrite, submitToTerminal } from "./api";
import { useTerminals } from "./terminals";

export type Agent = "claude-code" | "codex" | "copilot";
type ShellFamily = "cmd" | "powershell" | "posix";

function shellFamily(shell: string | null): ShellFamily {
  const s = shell ?? "";
  if (/(^|[\\/])(powershell|pwsh)(\.exe)?$/i.test(s)) return "powershell";
  if (/(^|[\\/])cmd(\.exe)?$/i.test(s)) return "cmd";
  if (/(^|[\\/])(bash|zsh|sh|fish|dash|ash)(\.exe)?$/i.test(s)) return "posix";
  return navigator.userAgent.includes("Windows") ? "cmd" : "posix";
}

/** The shell-correct command to run `bin` with `READO_AGENT` set. */
export function agentLaunchCommand(family: ShellFamily, agent: Agent, bin: string): string {
  if (family === "powershell") return `$env:READO_AGENT="${agent}"; ${bin}`;
  if (family === "cmd") return `set "READO_AGENT=${agent}" && ${bin}`;
  return `READO_AGENT=${agent} ${bin}`;
}

/** Run `text` in the active terminal, creating one if none is focused. */
export function runInTerminal(text: string): void {
  const term = useTerminals.getState();
  const id = term.activeId ?? term.add();
  submitToTerminal(id, text, id === term.activeId ? 0 : 400);
}

/** Clear the active terminal (Ctrl+L; the shell redraws its prompt). */
// ponytail: Ctrl+L clears the visible screen, not xterm's scrollback. Wire a
// per-pane xterm.clear() if a full wipe is ever needed.
export function clearTerminal(): void {
  const { activeId } = useTerminals.getState();
  if (activeId) void ptyWrite(activeId, "\x0c");
}

/** Restart the active terminal in place (kills the shell, spawns a fresh one). */
export function restartTerminal(): void {
  const { activeId, restart } = useTerminals.getState();
  if (activeId) restart(activeId);
}

/** Launch an agent in the active terminal (resolving the shell first). */
export async function launchAgent(agent: Agent, bin: string): Promise<void> {
  const shell = await ptyDefaultShell().catch(() => null);
  runInTerminal(agentLaunchCommand(shellFamily(shell), agent, bin));
}
