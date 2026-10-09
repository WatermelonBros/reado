/**
 * Crash reports, the person's choice (Settings › System). The webview can't reach the
 * network (its content security policy), so errors go to the Rust side, which sends
 * them to our error tracker only if they are on and the build is an official one
 * (src-tauri/src/crash.rs). Off by default.
 */
import { invoke } from "@tauri-apps/api/core"
import { useSettings } from "@/lib/store"

/** Whether this build can report at all: false in a build from source. */
export const crashReportsAvailable = () => invoke<boolean>("crash_reports_available")

const apply = (enabled: boolean) =>
  void invoke("set_crash_reports", { enabled }).catch(() => {
    /* the switch is best effort: a failure must never get in the way */
  })

/** Keeps the Rust side in step with the setting, now and whenever it changes. */
export function startCrashReports(): void {
  apply(useSettings.getState().crashReports)
  useSettings.subscribe((now, before) => {
    if (now.crashReports !== before.crashReports) apply(now.crashReports)
  })
}

/** An error the webview caught; dropped when reports are off. */
export function reportCrash(message: string, stack?: string, source?: string): void {
  if (!useSettings.getState().crashReports) return
  void invoke("report_error", { message, stack, source }).catch(() => {})
}
