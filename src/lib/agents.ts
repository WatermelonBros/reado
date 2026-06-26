/**
 * Launching AI agents in the integrated terminal. The launch command sets
 * `READO_AGENT` using the syntax of the active shell (cmd / PowerShell / POSIX),
 * so it works on every platform. Shared by the terminal toolbar and the menu.
 */
import { listen } from "@tauri-apps/api/event";
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

/** Run `text` in a plain **shell** pane — never an agent pane — so commands like
 *  `cargo test` are executed by a shell, not typed into Claude's prompt. Reuses a
 *  non-agent pane (preferring the focused one) or opens a fresh one. */
export function runInShell(text: string): void {
  const term = useTerminals.getState();
  const agents = new Set(term.agentTerminals);
  // The focused pane if it's a shell; otherwise any other shell pane.
  const wasActive = term.activeId && !agents.has(term.activeId) ? term.activeId : null;
  let id = wasActive ?? term.sessions.map((s) => s.id).find((sid) => !agents.has(sid)) ?? null;
  if (!id) {
    id = term.add(); // all panes are agents (or none exist) → open a shell
  } else if (id !== term.activeId) {
    term.setActive(id);
  }
  term.toggle(true);
  submitToTerminal(id, text, id === wasActive ? 0 : 400);
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

/** Default agent when the user has never launched one. */
const DEFAULT_AGENT: Agent = "claude-code";

/** How long after the agent's output goes quiet we treat it as ready for input. */
const AGENT_IDLE_MS = 1200;
/** Hard cap so we send even if the agent never goes quiet (or produces nothing). */
const AGENT_READY_CAP_MS = 15000;

/** Resolve once a freshly-launched agent looks ready: its PTY produced output and
 *  then went quiet for AGENT_IDLE_MS (it's sitting at its input prompt). Far more
 *  reliable than a fixed boot delay — a cold Claude Code start can take many
 *  seconds, and a fixed timer would type the prompt into the boot screen and lose
 *  it. Falls back to the cap if the agent stays silent. */
function waitForAgentReady(id: string): Promise<void> {
  return new Promise((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | null = null;
    let unlisten: (() => void) | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (quiet) clearTimeout(quiet);
      clearTimeout(cap);
      unlisten?.();
      resolve();
    };
    const cap = setTimeout(finish, AGENT_READY_CAP_MS);
    void listen<string>(`pty-output-${id}`, () => {
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(finish, AGENT_IDLE_MS);
    }).then((u) => {
      unlisten = u;
      if (done) u(); // resolved via the cap before the listener attached
    });
  });
}

/** Send an AI prompt to the agent. If the active terminal already has an agent,
 *  send it there; otherwise launch one first — the last-used agent, or Claude
 *  Code by default — and send the prompt once it has actually booted. We never
 *  write an AI prompt to a bare shell: it would just be run as a (broken) command. */
export async function dispatchToAgent(prompt: string): Promise<void> {
  const term = useTerminals.getState();
  const id = term.activeId ?? term.add();
  if (term.agentTerminals.includes(id)) {
    submitToTerminal(id, prompt, id === useTerminals.getState().activeId ? 0 : 400);
    return;
  }
  const agent = (term.lastAgent as Agent | null) ?? DEFAULT_AGENT;
  const shell = await ptyDefaultShell().catch(() => null);
  submitToTerminal(id, agentLaunchCommand(shellFamily(shell), agent, AGENT_BIN[agent]), 0);
  useTerminals.getState().markAgent(id, agent);
  // Wait until the agent is booted and idle at its prompt, then send.
  await waitForAgentReady(id);
  submitToTerminal(id, prompt, 0);
}
