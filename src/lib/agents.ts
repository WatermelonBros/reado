/**
 * Launching AI agents in the integrated terminal. The launch command sets
 * `READO_AGENT` using the syntax of the active shell (cmd / PowerShell / POSIX),
 * so it works on every platform. Shared by the terminal toolbar and the menu.
 */
import { ptyDefaultShell, ptyWrite, submitToTerminal } from "./api";
import { useTerminals } from "./terminals";

export type Agent = "claude-code" | "codex" | "copilot";
type ShellFamily = "cmd" | "powershell" | "posix";

/** The binary that runs each agent. */
const AGENT_BIN: Record<Agent, string> = {
  "claude-code": "claude",
  codex: "codex",
  copilot: "copilot",
};

/** How long to let a freshly-launched agent boot before sending it the prompt. */
const AGENT_BOOT_MS = 4000;

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

/** Neutralize free-text the user types into an AI prompt before it's sent to the
 *  terminal. Reado's model is that an agent reads the prompt, but if a bare shell
 *  is focused instead, backticks / `$` / backslashes would trigger command
 *  substitution even inside quotes — strip them (and collapse newlines, cap length)
 *  so user input can never become a shell command. */
export const sanitizePromptText = (s: string): string =>
  s.replace(/[`$\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);

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

/** Launch an agent in the active terminal (resolving the shell first), and
 *  remember it so later prompts go to it (and re-launch the same one by default). */
export async function launchAgent(agent: Agent, bin: string): Promise<void> {
  const term = useTerminals.getState();
  const id = term.activeId ?? term.add();
  const shell = await ptyDefaultShell().catch(() => null);
  submitToTerminal(id, agentLaunchCommand(shellFamily(shell), agent, bin), 0);
  useTerminals.getState().markAgent(id, agent);
}

/** Send an AI prompt to the agent. If the active terminal already has an agent,
 *  send it there; otherwise launch the last-used agent first (the default), then
 *  send the prompt once it has booted. With no agent ever used, fall back to
 *  writing the prompt to the terminal directly (today's behaviour). */
export async function dispatchToAgent(prompt: string): Promise<void> {
  const term = useTerminals.getState();
  const id = term.activeId ?? term.add();
  if (term.agentTerminals.includes(id)) {
    submitToTerminal(id, prompt, id === useTerminals.getState().activeId ? 0 : 400);
    return;
  }
  const agent = term.lastAgent as Agent | null;
  if (agent && AGENT_BIN[agent]) {
    const shell = await ptyDefaultShell().catch(() => null);
    submitToTerminal(id, agentLaunchCommand(shellFamily(shell), agent, AGENT_BIN[agent]), 0);
    useTerminals.getState().markAgent(id, agent);
    submitToTerminal(id, prompt, AGENT_BOOT_MS); // wait for the agent to boot
    return;
  }
  // No agent known → write directly (the user can start one and re-run).
  submitToTerminal(id, prompt, 0);
}
