import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { MascotWindow } from "./components/pages/MascotWindow"
import { log } from "./lib/logger"
import { guardNavigationKeys } from "./lib/navGuard"
import "./i18n" // initialize i18next before any component renders
import "./lib/fonts" // ships the code faces the picker offers
import "@xterm/xterm/css/xterm.css"
import "./styles/app.css"

// The companion is a second webview on this same bundle, told apart by its
// hash. It shares no JavaScript with the main window — only broadcasts.
const isMascot = window.location.hash.startsWith("#mascot")

// That window is a transparent sheet with a character on it. The theme paints a
// background on the document, which in a normal window is the point and here is
// a filled rectangle floating over the user's screen — so this one keeps none.
if (isMascot) {
  document.documentElement.style.background = "transparent"
  document.body.style.background = "transparent"
  document.documentElement.style.colorScheme = "normal"
}

// Dev-only UI automation bridge (drives the live webview for testing). Stripped
// from production builds by the DEV guard. A failure here used to be swallowed
// by `void`: the bridge simply never came up, with nothing anywhere to say why.
// Never in the companion: it would take the relay away from the window that is
// actually the app.
if (import.meta.env.DEV && !isMascot)
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
    <ErrorBoundary>{isMascot ? <MascotWindow /> : <App />}</ErrorBoundary>
  </React.StrictMode>,
)
