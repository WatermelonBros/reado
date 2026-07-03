/**
 * Launching AI agents in the integrated terminal. The launch command sets
 * `READO_AGENT` using the syntax of the active shell (cmd / PowerShell / POSIX),
 * so it works on every platform. Shared by the terminal toolbar and the menu.
 */
import { listen } from "@tauri-apps/api/event";
import { agentInstalled, ptyDefaultShell, ptyWrite, submitToTerminal } from "./api";
import { useTerminals } from "./terminals";
import { useNotice } from "./notice";

export type Agent = "claude-code" | "codex" | "copilot" | "gemini" | "opencode";
type ShellFamily = "cmd" | "powershell" | "posix";

/** The binary that runs each agent. */
const AGENT_BIN: Record<Agent, string> = {
  "claude-code": "claude",
  codex: "codex",
  copilot: "copilot",
  gemini: "gemini",
  opencode: "opencode",
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

/** Whether `bin` is installed; if not, surface a notice and return false so the
 *  caller can bail instead of dispatching a prompt into a bare "command not
 *  found" shell (where its backticks would run as shell commands). Fails open if
 *  the probe itself errors, so a hiccup never blocks a working agent. */
async function ensureAgentInstalled(bin: string): Promise<boolean> {
  const ok = await agentInstalled(bin).catch(() => true);
  if (!ok) {
    // Imported lazily so this module doesn't pull in the i18n bootstrap at load.
    const { t } = await import("../i18n");
    useNotice.getState().show("error", t("agent.notInstalled", { name: bin }));
  }
  return ok;
}

/** Launch an agent in the active terminal (resolving the shell first), and
 *  remember it so later prompts go to it (and re-launch the same one by default). */
export async function launchAgent(agent: Agent, bin: string): Promise<void> {
  if (!(await ensureAgentInstalled(bin))) return;
  const term = useTerminals.getState();
  const id = term.activeId ?? term.add();
  const shell = await ptyDefaultShell().catch(() => null);
  submitToTerminal(id, agentLaunchCommand(shellFamily(shell), agent, bin), 0);
  useTerminals.getState().markAgent(id, agent);
}

/** Default agent when the user has never launched one. */
const DEFAULT_AGENT: Agent = "claude-code";

/** Preference order when auto-picking an agent for the first-ever dispatch. */
const AGENT_ORDER: Agent[] = ["claude-code", "codex", "copilot", "gemini", "opencode"];

/** The first installed agent (probed on PATH), so a dev who only has codex or
 *  copilot isn't dead-ended by the Claude default on their first AI action. */
async function firstInstalledAgent(): Promise<Agent> {
  for (const a of AGENT_ORDER) {
    if (await agentInstalled(AGENT_BIN[a]).catch(() => false)) return a;
  }
  return DEFAULT_AGENT;
}

/** Brief "handed off to the agent" confirmation, so a fire-and-forget dispatch
 *  (explain, review, single task) has visible feedback without watching the PTY. */
async function noticeSent(): Promise<void> {
  const { t } = await import("../i18n");
  useNotice.getState().show("info", t("agent.sent"));
}

/** How long after the agent's output goes quiet we treat it as ready for input. */
const AGENT_IDLE_MS = 1200;
/** Hard cap so we send even if the agent never goes quiet (or produces nothing). */
const AGENT_READY_CAP_MS = 15000;

/** Resolve once a terminal's PTY output has been quiet for `idleMs` (with a hard
 *  `capMs` fallback if it never settles). The building block for "is the agent at
 *  its prompt yet?" — both for boot readiness and for knowing a pasted prompt has
 *  finished rendering before we press Enter. */
function waitForQuiet(id: string, idleMs: number, capMs: number): Promise<void> {
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
    const cap = setTimeout(finish, capMs);
    void listen<string>(`pty-output-${id}`, () => {
      if (quiet) clearTimeout(quiet);
      quiet = setTimeout(finish, idleMs);
    }).then((u) => {
      unlisten = u;
      if (done) u(); // resolved via the cap before the listener attached
    });
  });
}

/** Resolve once a freshly-launched agent looks ready: its PTY produced output and
 *  then went quiet (it's sitting at its input prompt). Far more reliable than a
 *  fixed boot delay — a cold Claude Code start can take many seconds. */
function waitForAgentReady(id: string): Promise<void> {
  return waitForQuiet(id, AGENT_IDLE_MS, AGENT_READY_CAP_MS);
}

/** Paste a prompt into an agent and submit it. The Enter must be a *separate*
 *  write, and it must land only once the agent has finished ingesting the paste —
 *  with a long prompt a fixed short delay drops the Enter mid-paste, so it's read
 *  as a newline in the text and the prompt just sits there unsubmitted (the exact
 *  "I have to press Enter myself" symptom). So: write, wait for output to settle,
 *  then Enter. */
async function pasteAndSubmit(id: string, prompt: string): Promise<void> {
  await ptyWrite(id, prompt);
  await waitForQuiet(id, 250, 4000);
  await ptyWrite(id, "\r");
}

/** Send an AI prompt to the agent. If the active terminal already has an agent,
 *  send it there; otherwise launch one first — the last-used agent, or Claude
 *  Code by default — and send the prompt once it has actually booted. We never
 *  write an AI prompt to a bare shell: it would just be run as a (broken) command. */
export async function dispatchToAgent(prompt: string): Promise<void> {
  const term = useTerminals.getState();
  const id = term.activeId ?? term.add();
  if (term.agentTerminals.includes(id)) {
    await pasteAndSubmit(id, prompt);
    void noticeSent();
    return;
  }
  // Reuse the last agent, else auto-pick the first one actually installed.
  const agent = (term.lastAgent as Agent | null) ?? (await firstInstalledAgent());
  // Never launch-and-paste into a shell where the agent binary is missing.
  if (!(await ensureAgentInstalled(AGENT_BIN[agent]))) return;
  const shell = await ptyDefaultShell().catch(() => null);
  submitToTerminal(id, agentLaunchCommand(shellFamily(shell), agent, AGENT_BIN[agent]), 0);
  useTerminals.getState().markAgent(id, agent);
  // Wait until the agent is booted and idle at its prompt, then send.
  await waitForAgentReady(id);
  await pasteAndSubmit(id, prompt);
  void noticeSent();
}
