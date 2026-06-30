/**
 * Dev-only UI automation bridge.
 *
 * Runs *inside* the real Tauri webview, so it can drive the live app (real
 * `invoke` -> Rust backend) without any external WebDriver — which is what
 * makes this possible on macOS, where WKWebView can't be attached from
 * outside. It long-polls the local relay (scripts/uidriver/relay.mjs) for
 * commands, executes them against the DOM, and posts back results.
 *
 * Loaded only when `import.meta.env.DEV` (see main.tsx). Never ships.
 */
// Same-origin (the Vite dev server, see scripts/uidriver/vite-plugin.mjs) so the
// app's CSP `connect-src 'self'` permits it.
const RELAY = `${location.origin}/__uidriver`;

// Test hook: expose the app's Zustand stores + a CodeMirror edit helper on
// window.__reado, so the driver can read state and edit the buffer reliably
// (synthetic input events don't reach CM6). Dev only, same as this whole module.
import * as store from "./store";
import * as api from "./api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDocInfo } from "./docInfo";
import { useComments } from "./comments";
import { useGuidedReview } from "./guidedReview";
import { useTerminals } from "./terminals";
import { useQa } from "./qa";
import { useForge } from "./forge";
import { useDiagnostics } from "./diagnostics";
import { useBookmarks } from "./bookmarks";
import { useReadProgress } from "./readProgress";
import { useSemanticSearch } from "./semanticSearch";
import { useSpecs } from "./specs";
import { useTests } from "./tests";
import { useTours } from "./tours";
import { usePreReview } from "./preReview";
import { useHierarchy } from "./hierarchy";
import { useOnboarding } from "./onboarding";
import { useUpdate } from "./update";
import { useExtensions } from "./extensions";
import { useTourGuide } from "./tour";
(window as Window & { __reado?: unknown }).__reado = {
  ...store,
  api,
  win: getCurrentWindow(),
  useTourGuide,
  useDocInfo, useComments, useGuidedReview, useTerminals, useQa, useForge,
  useDiagnostics, useBookmarks, useReadProgress, useSemanticSearch, useSpecs,
  useTests, useTours, usePreReview, useHierarchy, useOnboarding, useUpdate, useExtensions,
  /** Insert text at the current selection in the focused editor. */
  editInsert(text: string) {
    const v = useDocInfo.getState().view;
    if (!v) return false;
    v.dispatch(v.state.replaceSelection(text));
    return true;
  },
  /** Replace the whole buffer. */
  setDoc(text: string) {
    const v = useDocInfo.getState().view;
    if (!v) return false;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
    return true;
  },
};

// Ring buffer of anything that looks like a bug: uncaught errors, rejections,
// and console.error/warn. The agent drains this after each interaction.
const errorLog: { kind: string; message: string; at: number }[] = [];
function record(kind: string, message: string) {
  errorLog.push({ kind, message, at: Date.now() });
  if (errorLog.length > 200) errorLog.shift();
}
window.addEventListener("error", (e) => record("error", `${e.message}`));
window.addEventListener("unhandledrejection", (e) => {
  // Skip rejections an earlier handler already claimed (preventDefault) — they
  // are handled, not escaping. Registered after main.tsx's handler, so it sees
  // the flag.
  if (e.defaultPrevented) return;
  record("unhandledrejection", String((e.reason as { message?: string })?.message ?? e.reason));
});
for (const level of ["error", "warn"] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    record(`console.${level}`, args.map((a) => safe(a)).join(" "));
    orig(...args);
  };
}

// ref -> element, rebuilt on every snapshot so refs always reflect the live DOM.
let refs = new Map<string, Element>();

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
}

function accName(el: Element): string {
  const a =
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.getAttribute("placeholder") ||
    (el as HTMLInputElement).value ||
    el.getAttribute("alt") ||
    (el.textContent || "").trim();
  return a.replace(/\s+/g, " ").slice(0, 80);
}

function role(el: Element): string {
  return el.getAttribute("role") || el.tagName.toLowerCase();
}

const SELECTOR =
  "button, a, input, textarea, select, summary, [role], [aria-label], [data-testid], [contenteditable], [tabindex], h1, h2, h3, h4";

function snapshot(): string {
  refs = new Map();
  const seen = new Set<Element>();
  const out: string[] = [];
  let n = 0;
  for (const el of Array.from(document.querySelectorAll(SELECTOR))) {
    if (seen.has(el) || !isVisible(el)) continue;
    seen.add(el);
    const ref = `e${++n}`;
    refs.set(ref, el);
    const flags: string[] = [];
    if ((el as HTMLButtonElement).disabled) flags.push("disabled");
    const aria = (k: string) => el.getAttribute(k);
    if (aria("aria-expanded")) flags.push(`expanded=${aria("aria-expanded")}`);
    if (aria("aria-selected") === "true") flags.push("selected");
    if (aria("aria-checked")) flags.push(`checked=${aria("aria-checked")}`);
    if ((el as HTMLInputElement).type) flags.push(`type=${(el as HTMLInputElement).type}`);
    const nm = accName(el);
    out.push(`${ref} ${role(el)}${nm ? ` "${nm}"` : ""}${flags.length ? ` [${flags.join(",")}]` : ""}`);
    if (n >= 500) {
      out.push("… (truncated at 500 elements)");
      break;
    }
  }
  return out.join("\n");
}

function resolve(cmd: { ref?: string; selector?: string }): Element {
  if (cmd.ref) {
    const el = refs.get(cmd.ref);
    if (!el) throw new Error(`stale ref ${cmd.ref} — re-snapshot`);
    return el;
  }
  if (cmd.selector) {
    const el = document.querySelector(cmd.selector);
    if (!el) throw new Error(`no element for selector ${cmd.selector}`);
    return el;
  }
  throw new Error("need ref or selector");
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const KEYCODES: Record<string, number> = {
  Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, " ": 32,
  ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
};

function fireKey(target: EventTarget, key: string, mods: Record<string, boolean> = {}) {
  const init: KeyboardEventInit = {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    keyCode: KEYCODES[key] ?? key.toUpperCase().charCodeAt(0),
    which: KEYCODES[key] ?? key.toUpperCase().charCodeAt(0),
    bubbles: true,
    cancelable: true,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
  };
  target.dispatchEvent(new KeyboardEvent("keydown", init));
  target.dispatchEvent(new KeyboardEvent("keyup", init));
}

function safe(v: unknown): string {
  try {
    if (v instanceof Node) return `<${(v as Element).tagName?.toLowerCase?.() ?? v.nodeName}>`;
    if (typeof v === "function") return "[fn]";
    return JSON.stringify(v, (_k, val) => {
      if (val instanceof Node) return `<${(val as Element).tagName?.toLowerCase?.() ?? "node"}>`;
      return val;
    });
  } catch {
    return String(v);
  }
}

async function handle(cmd: any): Promise<{ ok: boolean; value?: unknown; error?: string }> {
  try {
    switch (cmd.action) {
      case "snapshot":
        return { ok: true, value: snapshot() };
      case "click": {
        const el = resolve(cmd) as HTMLElement;
        el.scrollIntoView({ block: "center" });
        el.click();
        return { ok: true, value: "clicked" };
      }
      case "type": {
        const el = resolve(cmd) as HTMLInputElement;
        el.focus();
        if (el.isContentEditable) {
          el.textContent = cmd.text;
          el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        } else {
          if (cmd.clear !== false) setNativeValue(el, "");
          setNativeValue(el, cmd.text);
        }
        if (cmd.submit) fireKey(el, "Enter");
        return { ok: true, value: "typed" };
      }
      case "press": {
        const target = cmd.ref || cmd.selector ? resolve(cmd) : document.activeElement || document.body;
        fireKey(target, cmd.key, cmd.mods || {});
        return { ok: true, value: "pressed" };
      }
      case "text": {
        return { ok: true, value: (resolve(cmd).textContent || "").trim().slice(0, 4000) };
      }
      case "exists":
        return { ok: true, value: !!document.querySelector(cmd.selector) };
      case "count":
        return { ok: true, value: document.querySelectorAll(cmd.selector).length };
      case "getByText": {
        const all = Array.from(document.querySelectorAll(cmd.tag || "*"));
        const hit = all.find(
          (e) => isVisible(e) && (e.textContent || "").trim().includes(cmd.text) && e.children.length === 0,
        );
        if (!hit) return { ok: false, error: `no visible element containing "${cmd.text}"` };
        const ref = `t${refs.size + 1}`;
        refs.set(ref, hit);
        return { ok: true, value: ref };
      }
      case "nav":
        location.hash = cmd.hash;
        return { ok: true, value: location.hash };
      case "errors": {
        const v = errorLog.slice();
        if (cmd.clear) errorLog.length = 0;
        return { ok: true, value: v };
      }
      case "waitFor": {
        const deadline = Date.now() + (cmd.timeoutMs || 5000);
        while (Date.now() < deadline) {
          if (document.querySelector(cmd.selector)) return { ok: true, value: "found" };
          await new Promise((r) => setTimeout(r, 100));
        }
        return { ok: false, error: `timeout waiting for ${cmd.selector}` };
      }
      case "eval": {
        const fn = new Function(`return (async () => { ${cmd.js} })()`);
        const v = await fn();
        return { ok: true, value: JSON.parse(safe(v) || "null") };
      }
      case "noop":
        return { ok: true };
      default:
        return { ok: false, error: `unknown action ${cmd.action}` };
    }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

async function loop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await fetch(`${RELAY}/poll`);
      const { id, cmd } = await r.json();
      if (!cmd || cmd.action === "noop") continue;
      const out = await handle(cmd);
      await fetch(`${RELAY}/result`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...out }),
      });
    } catch {
      await new Promise((r) => setTimeout(r, 800)); // relay not up yet
    }
  }
}

console.log("[uidriver] automation bridge active");
void loop();

export {};
