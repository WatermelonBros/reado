// One fuzz batch, run inside the webview via `drive eval`. Performs a run of
// randomized, *safe* UI actions across every area, checking after each that the
// app didn't trip the ErrorBoundary. Console errors / unhandled rejections are
// collected out-of-band by the driver (`drive errors`) between batches.
//
// State persists on window.__fuzz across batches (count, per-action tally,
// crashes). Returns a compact summary. Read by scripts/uidriver/fuzz.mjs.
const wait = (ms) => new Promise((s) => setTimeout(s, ms));
const R = window.__reado;
const F = (window.__fuzz = window.__fuzz || { count: 0, tally: {}, crashes: [] });
const BATCH = 120;

const crashed = () => /andato storto|Qualcosa è andato storto/.test(document.body.textContent);
const items = () => Array.from(document.querySelectorAll("[role=treeitem]"));
const findItem = (n) => items().find((t) => t.textContent.trim() === n);
const vis = (els) => Array.from(els).filter((e) => e.offsetParent);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const setVal = (el, v) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const esc = () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

// Each action is safe (no destructive git, no React-node removal). Returns a label.
const FILES = ["main.js", "util.py", "README.md", "big.txt", "blob.bin", "pixel.png"];
const TOOLS = ["File", "Cerca nel progetto…", "Commenti", "Struttura", "Estensioni", "Controllo sorgente", "Cronologia"];
const actions = [
  async () => { const f = pick(TOOLS); document.querySelector(`[aria-label="${f}"]`)?.click(); await wait(40); return "tool:" + f; },
  async () => { if (!items().length) document.querySelector('[aria-label="File"]')?.click(); const it = pick(items()); it?.click(); await wait(40); return "tree-click"; },
  async () => { const s = findItem("src"); s?.click(); await wait(30); return "toggle-src"; },
  async () => { const f = pick(FILES); findItem(f)?.click(); await wait(50); return "open:" + f; },
  async () => { R.usePalette.getState().open("files"); await wait(40); const i = vis(document.querySelectorAll("input"))[0]; if (i) setVal(i, pick(["ut", "main", "re", "xyz"])); await wait(40); esc(); return "palette-files"; },
  async () => { R.usePalette.getState().open("commands"); await wait(40); esc(); return "palette-cmd"; },
  async () => { R.usePalette.getState().toggleShortcuts(); await wait(40); R.usePalette.getState().toggleShortcuts(); return "shortcuts"; },
  async () => { R.usePalette.getState().toggleSettings(); await wait(40); R.usePalette.getState().toggleSettings(); return "settings"; },
  async () => { const m = pick(["manual", "system", "auto"]); R.useSettings.getState().set({ mode: m }); await wait(30); return "theme-mode:" + m; },
  async () => { R.useSettings.getState().set({ theme: pick(R.THEMES) }); await wait(30); return "theme"; },
  async () => { R.useSettings.getState().set({ zoom: 1 + Math.random() }); return "zoom"; },
  async () => { const t = R.useTerminals.getState(); if (!t.open) t.toggle(); await wait(40); return "term-toggle"; },
  async () => { R.useSemanticSearch.setState({ open: true }); await wait(40); R.useSemanticSearch.getState().close?.(); return "semantic"; },
  async () => { const v = R.useDocInfo.getState().view; if (v && v.state.doc.length) { const p = Math.floor(Math.random() * v.state.doc.length); v.dispatch({ selection: { anchor: p } }); } return "cursor-move"; },
  async () => { const cm = document.querySelector(".cm-content"); cm?.dispatchEvent(new KeyboardEvent("keydown", { key: "f", code: "KeyF", metaKey: true, bubbles: true })); await wait(40); esc(); return "find-in-file"; },
  async () => { const root = R.useProject.getState().root; const id = "fuzz_" + F.count; const r = await R.useComments.getState().create({ file: "src/util.py", scope: "range", startLine: 1, endLine: 1, type: pick(["bug", "note", "refactor"]), kind: "note", body: "fuzz " + F.count, context: { snippet: "def square(x):", before: "", after: "    return x * x" } }).catch(() => null); if (r) await R.useComments.getState().remove(r.comment.id).catch(() => {}); return "comment-create-delete"; },
  async () => { R.useWorkspace.getState().toggleSidebar(); await wait(30); R.useWorkspace.getState().toggleSidebar(); return "sidebar"; },
  async () => { R.useWorkspace.getState().toggleDocs?.(); await wait(30); R.useWorkspace.getState().toggleDocs?.(false); return "docs"; },
];

for (let i = 0; i < BATCH; i++) {
  const act = pick(actions);
  let label = "?";
  try {
    label = await act();
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 80);
    label = "throw:" + msg;
    (F.throws = F.throws || {})[msg] = (F.throws[msg] || 0) + 1;
  }
  F.count++;
  F.tally[label.split(":")[0]] = (F.tally[label.split(":")[0]] || 0) + 1;
  if (crashed()) {
    F.crashes.push({ at: F.count, lastAction: label });
    // recover so the run can continue
    const retry = Array.from(document.querySelectorAll("button")).find((b) => /Riprova|Ricarica/.test(b.textContent));
    retry?.click();
    await wait(300);
  }
}
esc();
return { total: F.count, crashes: F.crashes.length, lastCrashes: F.crashes.slice(-3), tally: F.tally, throws: F.throws || {} };
