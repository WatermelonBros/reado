import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { log } from "./lib/logger";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./i18n"; // initialize i18next before any component renders
import "@xterm/xterm/css/xterm.css";
import "./styles/app.css";

// Dev-only UI automation bridge (drives the live webview for testing). Stripped
// from production builds by the DEV guard.
if (import.meta.env.DEV) void import("./lib/automation");

// Capture anything that escapes a component so a crash leaves a trail in the log
// file the user can send back to us.
window.addEventListener("error", (e) => {
  log.error("uncaught error", { message: e.message, stack: e.error?.stack });
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason as { message?: string; stack?: string } | undefined;
  const message = reason?.message ?? String(e.reason);
  // Tauri's event dispatcher throws when an event arrives for a listener that
  // was just torn down (a fast unmount race in its own message handling, not
  // ours — `listeners[eventId]` is already gone). It's benign teardown noise;
  // swallow it so it doesn't bury real errors in the log the user sends back.
  if (/listeners\[eventId\]/.test(message)) {
    e.preventDefault();
    return;
  }
  log.error("unhandled rejection", { message, stack: reason?.stack });
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
