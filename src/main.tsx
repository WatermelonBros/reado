import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { log } from "./lib/logger"
import { guardNavigationKeys } from "./lib/navGuard"
import "./i18n" // initialize i18next before any component renders
import "./lib/fonts" // ships the code faces the picker offers
import "@xterm/xterm/css/xterm.css"
import "./styles/app.css"

// Dev-only UI automation bridge (drives the live webview for testing). Stripped
// from production builds by the DEV guard. A failure here used to be swallowed
// by `void`: the bridge simply never came up, with nothing anywhere to say why.
if (import.meta.env.DEV)
  void import("./lib/automation").catch((e: unknown) => {
    log.error("automation bridge failed to load", { message: String((e as Error)?.message ?? e) })
  })

// Backspace outside a text field is "go back" to a webview — and back from
// Reado's only page throws the whole session away. Cancelled before anything else
// can see it.
guardNavigationKeys()

// Capture anything that escapes a component so a crash leaves a trail in the log
// file the user can send back to us.
window.addEventListener("error", (e) => {
  log.error("uncaught error", { message: e.message, stack: e.error?.stack })
})
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason as { message?: string; stack?: string } | undefined
  const message = reason?.message ?? String(e.reason)
  // Tauri's event dispatcher throws when an event arrives for a listener that
  // was just torn down (a fast unmount race in its own message handling, not
  // ours — `listeners[eventId]` is already gone). It's benign teardown noise;
  // swallow it so it doesn't bury real errors in the log the user sends back.
  if (/listeners\[eventId\]/.test(message)) {
    e.preventDefault()
    return
  }
  log.error("unhandled rejection", { message, stack: reason?.stack })
})

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
