/**
 * Best-effort self-healing run once at app launch. Each check fixes a thing the
 * user would otherwise have to notice and repair by hand. Everything here is
 * idempotent and non-fatal — a failure must never block the app from opening.
 *
 * Add more checks as they come up (the place to put "if X is broken, fix X").
 */
import { cliInstalled, installCli } from "./api"
import { useMarketplace } from "./marketplace"

/** Ensure the bundled `reado` CLI is on PATH so the agent can call it — without
 *  the user having to find the Settings button. The install dir is chosen to be
 *  on PATH on every OS (see Rust `install_dir`). */
async function ensureCliInstalled(): Promise<void> {
  try {
    if (!(await cliInstalled())) await installCli()
  } catch {
    /* non-fatal: Settings still offers a manual install */
  }
}

/** Read the installed extensions before anything asks for a contributed theme.
 *  The theme is applied from settings at first paint, and it can only resolve to
 *  a contributed one if that extension is already known. */
async function loadExtensions(): Promise<void> {
  try {
    await useMarketplace.getState().refresh()
  } catch {
    /* non-fatal: the editor works with no extensions at all */
  }
}

let ran = false

/** Run the startup checks exactly once per process. */
export function runStartupChecks(): void {
  if (ran) return
  ran = true
  void ensureCliInstalled()
  void loadExtensions()
}
