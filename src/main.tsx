import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { log } from "./lib/logger";
import "./i18n"; // initialize i18next before any component renders
import "@xterm/xterm/css/xterm.css";
import "./styles/app.css";

// Capture anything that escapes a component so a crash leaves a trail in the log
// file the user can send back to us.
window.addEventListener("error", (e) => {
  log.error("uncaught error", { message: e.message, stack: e.error?.stack });
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason as { message?: string; stack?: string } | undefined;
  log.error("unhandled rejection", {
    message: reason?.message ?? String(e.reason),
    stack: reason?.stack,
  });
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
