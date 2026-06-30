/**
 * Best-effort self-healing run once at app launch. Each check fixes a thing the
 * user would otherwise have to notice and repair by hand. Everything here is
 * idempotent and non-fatal — a failure must never block the app from opening.
 *
 * Add more checks as they come up (the place to put "if X is broken, fix X").
 */
import { cliInstalled, installCli } from "./api";

/** Ensure the bundled `reado` CLI is on PATH so the agent can call it — without
 *  the user having to find the Settings button. The install dir is chosen to be
 *  on PATH on every OS (see Rust `install_dir`). */
async function ensureCliInstalled(): Promise<void> {
  try {
    if (!(await cliInstalled())) await installCli();
  } catch {
    /* non-fatal: Settings still offers a manual install */
  }
}

let ran = false;

/** Run the startup checks exactly once per process. */
export function runStartupChecks(): void {
  if (ran) return;
  ran = true;
  void ensureCliInstalled();
}
