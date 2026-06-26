/**
 * Frontend logging.
 *
 * Every record is forwarded to the Rust backend's `log_record` command, which
 * writes it to the same rolling file as backend records (so the two interleave)
 * and applies redaction in one place. This module is the single import the rest
 * of the frontend uses for logging; it never touches the filesystem itself.
 *
 * It also provides {@link tracedInvoke}, the wrapper that `lib/api.ts` routes
 * every IPC call through, so the command name, duration and outcome are logged
 * at the boundary without changing any call site.
 *
 * TODO(dev-phase): tracing *every* IPC call is intentionally verbose — it's the
 * richest signal while we're actively developing, so it stays on for now. It is
 * more than a shipped product should emit by default; before a stable release,
 * demote IPC tracing to `trace` (or sample it) so the default `info` log stays
 * readable. Kept loud on purpose for now.
 *
 * Logging is best-effort: a failed forward is swallowed so callers are never
 * affected, and a local enabled/level mirror short-circuits work (and the IPC
 * round-trip) when logging is off or below the threshold.
 */
import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

const ORDER: Record<LogLevel, number> = {
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

// Local mirror of the user's setting so we can skip disabled/below-threshold
// records before paying for an IPC call. The backend enforces the same gate.
let enabled = true;
let threshold = ORDER.info;

/** Apply the user's logging preference locally and push it to the backend. */
export function applyLogConfig(on: boolean, level: LogLevel): void {
  enabled = on;
  threshold = ORDER[level] ?? ORDER.info;
  invoke("log_set_config", { enabled: on, level }).catch(() => {});
}

/** Emit one record (after the local gate) to the backend sink. */
function emit(
  level: LogLevel,
  target: string,
  msg: string,
  fields?: Record<string, unknown>,
): void {
  if (!enabled || ORDER[level] > threshold) return;
  // Raw `invoke` (not the traced wrapper) so logging never logs itself.
  invoke("log_record", { level, target, msg, fields: fields ?? null }).catch(
    () => {},
  );
}

export interface Logger {
  error: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  info: (msg: string, fields?: Record<string, unknown>) => void;
  debug: (msg: string, fields?: Record<string, unknown>) => void;
  trace: (msg: string, fields?: Record<string, unknown>) => void;
}

/** A logger bound to a `target` (the subsystem name shown in each record). */
export function createLogger(target: string): Logger {
  return {
    error: (msg, fields) => emit("error", target, msg, fields),
    warn: (msg, fields) => emit("warn", target, msg, fields),
    info: (msg, fields) => emit("info", target, msg, fields),
    debug: (msg, fields) => emit("debug", target, msg, fields),
    trace: (msg, fields) => emit("trace", target, msg, fields),
  };
}

/** Default app-wide logger (target `app`). */
export const log = createLogger("app");

/**
 * `invoke` wrapper that traces the IPC boundary: every command logs its name and
 * duration (at `debug`), and failures at `error`. Argument *keys* are logged as a
 * summary — never values — so contents and secrets stay out of the log.
 * `lib/api.ts` imports this as `invoke`, so all call sites are instrumented.
 */
export async function tracedInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  // Never trace the logging commands themselves (avoids recursion / noise).
  if (cmd.startsWith("log_")) {
    return invoke<T>(cmd, args);
  }
  const start = performance.now();
  try {
    const result = await invoke<T>(cmd, args);
    emit("debug", "ipc", cmd, {
      ms: Math.round(performance.now() - start),
      args: args ? Object.keys(args) : [],
    });
    return result;
  } catch (e) {
    emit("error", "ipc", `${cmd} failed`, {
      ms: Math.round(performance.now() - start),
      args: args ? Object.keys(args) : [],
      error: String(e),
    });
    throw e;
  }
}

/** Absolute path of the active log file (for "copy path" / settings display). */
export function logPath(): Promise<string | null> {
  return invoke<string | null>("log_path").catch(() => null);
}
