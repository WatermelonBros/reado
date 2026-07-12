/**
 * The custom Console + Network inspector for the preview — Reado's own devtools,
 * built on our tokens (never the webview's native panel).
 *
 * It reads the captured console/network from the preview store (BrowserPanel owns
 * the single drain of the page bridge). The evaluate input runs an expression in
 * the page over the CSP-immune eval channel; "send to agent" hands an error to the
 * terminal agent, the same bridge the rest of Reado uses.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { previewEval } from "../../lib/api";
import { usePreview, type LogEntry, type LogLevel, type NetEntry } from "../../lib/preview";
import { dispatchToAgent } from "../../lib/agents";
import { IconButton } from "../atoms/IconButton";
import {
  SendIcon,
  CloseIcon,
  ChevronIcon,
  LayoutIcon,
  FetchIcon,
  TrashIcon,
  CrosshairIcon,
  WarningIcon,
  MoreVerticalIcon,
  DetachIcon,
} from "../atoms/icons";
import { useLayout } from "../../lib/layout";

type StoreKind = "cookie" | "local" | "session";
interface DomNode { tag: string; attrs: [string, string][]; text: string; n: number; kids: DomNode[] }

const LEVEL_TONE: Record<LogLevel, string> = {
  error: "text-[var(--diag-error)]",
  warn: "text-[var(--diag-warn)]",
  info: "text-[var(--diag-info)]",
  debug: "text-faint",
  log: "text-ink",
  result: "text-accent",
};

function fmt(a: unknown): string {
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

/** Hand a console error to the terminal agent as fix-me context. */
function sendErrorToAgent(l: LogEntry): void {
  const parts = [
    "There's a runtime error in the browser preview I'm working on:",
    "",
    l.args.map(fmt).join(" "),
    l.source ? `at ${l.source}` : "",
    l.stack ? `\n${l.stack}` : "",
    "",
    "Please find the cause and fix it.",
  ];
  void dispatchToAgent(parts.filter(Boolean).join("\n"));
}

export function BrowserInspector({ docked = false }: { docked?: boolean } = {}) {
  const { t } = useTranslation();
  const logs = usePreview((s) => s.logs);
  const net = usePreview((s) => s.net);
  const clearCaptured = usePreview((s) => s.clearCaptured);
  const pushLog = usePreview((s) => s.pushLog);
  const inspectRequest = usePreview((s) => s.inspectRequest);
  const setInspectRequest = usePreview((s) => s.setInspectRequest);
  const inspectorPos = usePreview((s) => s.inspectorPos);
  const setInspectorPos = usePreview((s) => s.setInspectorPos);
  // Pop the console out into the layout as its own dock panel (placed beside the
  // terminal), or fold it back into the browser pane.
  const detachInspector = () => {
    usePreview.getState().setInspectorDetached(true);
    useLayout.getState().move("inspector", "bottom", { split: true });
  };
  const attachInspector = () => {
    usePreview.getState().setInspectorDetached(false);
    useLayout.getState().remove("inspector");
  };
  const [tab, setTab] = useState<"console" | "network" | "application" | "elements">("console");
  const [dom, setDom] = useState<DomNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["0", "0.0", "0.1"]));
  const [query, setQuery] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [selectedNet, setSelectedNet] = useState<number | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const setPick = (on: boolean) => {
    setPickMode(on);
    void previewEval(`window.__readoBridge&&window.__readoBridge.setPick(${on})`);
  };
  const headerRef = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 430));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);
  const clearAll = () => {
    clearCaptured();
    setSelectedNet(null);
    void previewEval("window.__readoBridge && window.__readoBridge.clear()");
  };
  const [storage, setStorage] = useState<{ cookies: [string, string][]; local: [string, string][]; session: [string, string][] }>({ cookies: [], local: [], session: [] });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, net, tab]);

  // Application/Storage is a snapshot — load it when the tab opens or on refresh.
  const loadStorage = async () => {
    try {
      const raw = await previewEval(
        "({cookies:document.cookie, local:Object.entries(localStorage), session:Object.entries(sessionStorage)})",
      );
      const d = JSON.parse(raw) as { cookies?: string; local?: [string, string][]; session?: [string, string][] };
      const cookies: [string, string][] = (d.cookies || "")
        .split(";")
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => {
          const i = c.indexOf("=");
          return [c.slice(0, i), c.slice(i + 1)] as [string, string];
        });
      setStorage({ cookies, local: d.local ?? [], session: d.session ?? [] });
    } catch {
      /* page not ready */
    }
  };
  useEffect(() => {
    if (tab === "application") void loadStorage();
    if (tab === "elements") void loadDom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Serialize the previewed page's DOM into a depth/child-capped tree.
  const loadDom = async () => {
    try {
      const raw = await previewEval(
        "(function(){function s(el,d){var k=[];if(d<12)for(var i=0;i<el.children.length&&i<80;i++){var c=s(el.children[i],d+1);if(c)k.push(c);}var at=[];if(el.attributes)for(var j=0;j<el.attributes.length;j++){at.push([el.attributes[j].name,el.attributes[j].value]);}var tx='';if(el.children.length===0){var t=(el.textContent||'').trim();if(t)tx=t.slice(0,200);}return{tag:el.tagName.toLowerCase(),attrs:at,text:tx,n:el.children.length,kids:k};}return s(document.documentElement,0);})()",
      );
      setDom(JSON.parse(raw) as DomNode);
    } catch {
      /* page not ready */
    }
  };
  const toggleNode = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  // Hover a tree node → highlight the element in the page (Chrome-style).
  const idxsOf = (path: string) => path.split(".").slice(1).map(Number);
  const hiNode = (path: string) =>
    void previewEval(`window.__readoBridge&&window.__readoBridge.hi(${JSON.stringify(idxsOf(path))})`);
  const unhiNode = () => void previewEval("window.__readoBridge&&window.__readoBridge.unhi()");

  // A right-click "inspect" on the page → open Elements, expand to the node, flash it.
  useEffect(() => {
    if (!inspectRequest) return;
    setTab("elements");
    void loadDom();
    const treePath = ["0", ...inspectRequest.map(String)];
    const prefixes = treePath.map((_, i) => treePath.slice(0, i + 1).join("."));
    setExpanded((prev) => new Set([...prev, ...prefixes]));
    hiNode(treePath.join("."));
    setPickMode(false); // a pick or right-click just completed
    setInspectRequest(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectRequest]);

  const q1 = (s: string) => JSON.stringify(s);
  const setStorageItem = async (kind: StoreKind, key: string, value: string) => {
    const js =
      kind === "cookie"
        ? `document.cookie=${q1(`${key}=${value}; path=/`)}`
        : `${kind === "local" ? "localStorage" : "sessionStorage"}.setItem(${q1(key)},${q1(value)})`;
    try {
      await previewEval(js);
    } finally {
      await loadStorage();
    }
  };
  const removeStorageItem = async (kind: StoreKind, key: string) => {
    const js =
      kind === "cookie"
        ? `document.cookie=${q1(`${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`)}`
        : `${kind === "local" ? "localStorage" : "sessionStorage"}.removeItem(${q1(key)})`;
    try {
      await previewEval(js);
    } finally {
      await loadStorage();
    }
  };

  const evaluate = async (expr: string) => {
    pushLog({ level: "log", args: [`› ${expr}`], t: Date.now() });
    try {
      const raw = await previewEval(`(${expr})`);
      pushLog({ level: "result", args: [raw], t: Date.now() });
    } catch (e) {
      pushLog({ level: "error", args: [String(e)], t: Date.now() });
    }
  };

  const q = query.trim().toLowerCase();
  const shownLogs = logs.filter(
    (l) =>
      (!errorsOnly || l.level === "error") &&
      (!q || l.args.map(fmt).join(" ").toLowerCase().includes(q)),
  );
  const shownNet = net.filter((n) => !q || n.url.toLowerCase().includes(q));

  // Header actions for the current tab. Shown inline when there's room, else moved
  // into a "⋯" overflow menu (like Chrome's toolbar when it's too narrow).
  type Act = { key: string; label: string; icon: React.ReactNode; onClick: () => void; active?: boolean };
  const actions: Act[] = [
    ...(tab === "console"
      ? [{ key: "errors", label: t("inspector.errorsOnly"), icon: <WarningIcon className="h-3.5 w-3.5" />, onClick: () => setErrorsOnly((v) => !v), active: errorsOnly }]
      : []),
    ...(tab === "elements"
      ? [{ key: "pick", label: t("inspector.pick"), icon: <CrosshairIcon className="h-3.5 w-3.5" />, onClick: () => setPick(!pickMode), active: pickMode }]
      : []),
    ...(tab === "application" || tab === "elements"
      ? [{ key: "refresh", label: t("inspector.refresh"), icon: <FetchIcon className="h-3.5 w-3.5" />, onClick: () => void (tab === "application" ? loadStorage() : loadDom()) }]
      : []),
    ...(tab === "console" || tab === "network"
      ? [{ key: "clear", label: t("inspector.clear"), icon: <TrashIcon className="h-3.5 w-3.5" />, onClick: clearAll }]
      : []),
    // Detached: it's a standalone dock panel → offer re-attach (its position is
    // owned by the dock). Nested: offer the bottom/right toggle + detach.
    ...(docked
      ? [{ key: "attach", label: t("inspector.attach"), icon: <DetachIcon className="h-3.5 w-3.5" />, onClick: attachInspector }]
      : [
          { key: "dock", label: t("inspector.dock"), icon: <LayoutIcon className={`h-3.5 w-3.5 ${inspectorPos === "right" ? "rotate-90" : ""}`} />, onClick: () => setInspectorPos(inspectorPos === "bottom" ? "right" : "bottom") },
          { key: "detach", label: t("inspector.detach"), icon: <DetachIcon className="h-3.5 w-3.5" />, onClick: detachInspector },
        ]),
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas">
      <header ref={headerRef} className="flex h-8 flex-none items-center gap-1 border-b border-line px-1.5 text-xs">
        <div className="flex min-w-0 flex-none items-center gap-1 overflow-x-auto">
          <TabButton active={tab === "console"} onClick={() => setTab("console")}>
            {t("inspector.console")}
          </TabButton>
          <TabButton active={tab === "network"} onClick={() => setTab("network")}>
            {t("inspector.network")} {net.length > 0 && <span className="text-faint">({net.length})</span>}
          </TabButton>
          <TabButton active={tab === "elements"} onClick={() => setTab("elements")}>
            {t("inspector.elements")}
          </TabButton>
          <TabButton active={tab === "application"} onClick={() => setTab("application")}>
            {t("inspector.application")}
          </TabButton>
        </div>
        {tab !== "application" && tab !== "elements" ? (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("inspector.filter")}
            className="mx-1 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink outline-none focus:border-accent"
          />
        ) : (
          <span className="flex-1" />
        )}
        {narrow ? (
          <div className="relative flex-none">
            <IconButton
              size="sm"
              label={t("inspector.more")}
              active={menuOpen}
              icon={<MoreVerticalIcon className="h-3.5 w-3.5" />}
              onClick={() => setMenuOpen((o) => !o)}
            />
            {menuOpen && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute right-0 top-full z-50 mt-1 min-w-36 rounded-md border border-line bg-overlay p-1 shadow-[var(--shadow)]"
              >
                {actions.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => {
                      a.onClick();
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-surface ${a.active ? "text-accent" : "text-ink"}`}
                  >
                    <span className="grid h-3.5 w-3.5 flex-none place-items-center">{a.icon}</span>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-none items-center gap-0.5">
            {actions.map((a) => (
              <IconButton key={a.key} size="sm" label={a.label} active={a.active} icon={a.icon} onClick={a.onClick} />
            ))}
          </div>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-relaxed">
        {tab === "console" ? (
          shownLogs.length === 0 ? (
            <Empty>{t("inspector.emptyConsole")}</Empty>
          ) : (
            shownLogs.map((l, i) => (
              <div
                key={i}
                className={`group/row flex items-start gap-2 border-b border-line/40 px-2 py-1 ${LEVEL_TONE[l.level]}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="whitespace-pre-wrap break-words">{l.args.map(fmt).join(" ")}</span>
                  {l.source && <span className="ml-2 text-faint">{l.source}</span>}
                  {l.stack && (
                    <pre className="mt-0.5 whitespace-pre-wrap break-words text-[10px] text-faint">{l.stack}</pre>
                  )}
                </span>
                {l.level === "error" && (
                  <IconButton
                    size="sm"
                    label={t("inspector.sendToAgent")}
                    icon={<SendIcon className="h-3.5 w-3.5" />}
                    onClick={() => sendErrorToAgent(l)}
                    className="flex-none opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                  />
                )}
              </div>
            ))
          )
        ) : tab === "network" ? (
          shownNet.length === 0 ? (
            <Empty>{t("inspector.emptyNetwork")}</Empty>
          ) : (
            <div className="flex h-full">
              <div className={`min-w-0 overflow-auto ${selectedNet != null ? "w-1/2 border-r border-line" : "flex-1"}`}>
                {shownNet.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelectedNet(n.id === selectedNet ? null : n.id)}
                    className={`flex w-full items-center gap-2 border-b border-line/40 px-2 py-1 text-left ${n.id === selectedNet ? "bg-surface" : ""} ${n.ok === false ? "text-[var(--diag-error)]" : "text-ink"}`}
                  >
                    <span className="w-12 flex-none text-faint">{n.method}</span>
                    <span className="w-10 flex-none tabular-nums">{n.status ?? (n.error ? "ERR" : "…")}</span>
                    <span className="min-w-0 flex-1 truncate">{n.url}</span>
                    {n.method === "WS" && (n.frames ?? 0) > 0 && <span className="flex-none text-faint">{n.frames}▾</span>}
                    {n.ms != null && <span className="flex-none text-faint tabular-nums">{n.ms}ms</span>}
                  </button>
                ))}
              </div>
              {selectedNet != null && (
                <NetDetail
                  entry={net.find((n) => n.id === selectedNet)}
                  onClose={() => setSelectedNet(null)}
                />
              )}
            </div>
          )
        ) : tab === "elements" ? (
          dom ? (
            <div className="py-1" onMouseLeave={unhiNode}>
              <TreeNode
                node={dom}
                path="0"
                depth={0}
                expanded={expanded}
                toggle={toggleNode}
                onHover={hiNode}
                onLeave={unhiNode}
              />
            </div>
          ) : (
            <Empty>{t("inspector.emptyElements")}</Empty>
          )
        ) : (
          <StorageView storage={storage} onSet={setStorageItem} onRemove={removeStorageItem} />
        )}
      </div>

      {tab === "console" && (
        <input
          placeholder={t("inspector.evaluate")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = (e.target as HTMLInputElement).value.trim();
              if (v) {
                void evaluate(v);
                (e.target as HTMLInputElement).value = "";
              }
            }
          }}
          spellCheck={false}
          className="h-8 flex-none border-t border-line bg-surface px-2 font-mono text-xs text-ink outline-none focus:border-accent"
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 ${active ? "bg-surface text-ink" : "text-faint hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="m-0 px-2 py-3 text-faint">{children}</p>;
}

/** A `<tag attr="value">` opening/closing mark, syntax-coloured like Chrome. */
function Mark({ node, closing }: { node: DomNode; closing?: boolean }) {
  return (
    <>
      <span className="text-faint">{closing ? "</" : "<"}</span>
      <span className="text-[var(--syn-keyword)]">{node.tag}</span>
      {!closing &&
        node.attrs.map(([k, v]) => (
          <span key={k}>
            {" "}
            <span className="text-[var(--syn-definition)]">{k}</span>
            {v !== "" && (
              <>
                <span className="text-faint">=</span>
                <span className="text-[var(--syn-string)]">&quot;{v.length > 60 ? v.slice(0, 60) + "…" : v}&quot;</span>
              </>
            )}
          </span>
        ))}
      <span className="text-faint">&gt;</span>
    </>
  );
}

/** The DOM rendered as real HTML markup (collapsible), the way Chrome shows it. */
function TreeNode({
  node,
  path,
  depth,
  expanded,
  toggle,
  onHover,
  onLeave,
}: {
  node: DomNode;
  path: string;
  depth: number;
  expanded: Set<string>;
  toggle: (p: string) => void;
  onHover: (p: string) => void;
  onLeave: () => void;
}) {
  const isOpen = expanded.has(path);
  const hasKids = node.n > 0;
  const pad = depth * 12 + 6;

  // Leaf: <tag …>text</tag> on one line.
  if (!hasKids) {
    return (
      <div
        className="whitespace-nowrap py-0.5 pr-2 hover:bg-surface"
        style={{ paddingLeft: pad + 16 }}
        onMouseEnter={() => onHover(path)}
      >
        <Mark node={node} />
        {node.text && <span className="text-ink">{node.text}</span>}
        {node.text && <Mark node={node} closing />}
      </div>
    );
  }

  return (
    <>
      <div
        className="flex items-start whitespace-nowrap py-0.5 pr-2 hover:bg-surface"
        style={{ paddingLeft: pad }}
        onMouseEnter={() => onHover(path)}
      >
        <button
          type="button"
          onClick={() => toggle(path)}
          className="grid h-4 w-4 flex-none place-items-center text-faint"
        >
          <ChevronIcon className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </button>
        <span className="min-w-0">
          <Mark node={node} />
          {!isOpen && (
            <>
              <span className="text-faint">…</span>
              <Mark node={node} closing />
            </>
          )}
        </span>
      </div>
      {isOpen &&
        node.kids.map((k, i) => (
          <TreeNode
            key={i}
            node={k}
            path={`${path}.${i}`}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            onHover={onHover}
            onLeave={onLeave}
          />
        ))}
      {isOpen && (
        <div className="whitespace-nowrap py-0.5 pr-2" style={{ paddingLeft: pad + 16 }}>
          <Mark node={node} closing />
        </div>
      )}
    </>
  );
}

/** Request/response detail for a selected network row (Chrome-style). */
function NetDetail({ entry, onClose }: { entry?: NetEntry; onClose: () => void }) {
  const { t } = useTranslation();
  if (!entry) return null;
  const headers = (h?: Record<string, string>) =>
    h && Object.keys(h).length ? (
      Object.entries(h).map(([k, v]) => (
        <div key={k} className="flex gap-2 px-2 py-0.5">
          <span className="w-40 flex-none truncate text-accent" title={k}>{k}</span>
          <span className="min-w-0 flex-1 break-all text-ink">{v}</span>
        </div>
      ))
    ) : (
      <p className="px-2 py-1 text-faint">—</p>
    );
  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-line bg-canvas px-2 py-1">
        <span className="min-w-0 truncate text-ink" title={entry.url}>{entry.url}</span>
        <IconButton
          size="sm"
          label={t("inspector.close")}
          icon={<CloseIcon className="h-3 w-3" />}
          onClick={onClose}
          className="flex-none"
        />
      </div>
      <Section title={t("inspector.general")}>
        <KV k="Method" v={entry.method} />
        <KV k="Status" v={String(entry.status ?? entry.error ?? "—")} />
        {entry.ms != null && <KV k="Time" v={`${entry.ms} ms`} />}
      </Section>
      <Section title={t("inspector.reqHeaders")}>{headers(entry.reqHeaders)}</Section>
      {entry.reqBody && (
        <Section title={t("inspector.payload")}>
          <Pre>{pretty(entry.reqBody)}</Pre>
        </Section>
      )}
      <Section title={t("inspector.resHeaders")}>{headers(entry.resHeaders)}</Section>
      <Section title={t("inspector.response")}>
        {entry.resBody ? <Pre>{pretty(entry.resBody)}</Pre> : <p className="px-2 py-1 text-faint">—</p>}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="px-2 py-0.5 text-[10px] tracking-[0.06em] text-faint uppercase">{title}</h3>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 px-2 py-0.5">
      <span className="w-40 flex-none text-faint">{k}</span>
      <span className="min-w-0 flex-1 break-all text-ink">{v}</span>
    </div>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words px-2 py-1 text-ink">{children}</pre>;
}

/** Pretty-print JSON bodies; leave anything else as-is. */
function pretty(s?: string): string {
  if (!s) return "";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

/** Cookies + local/session storage — editable: change a value, delete a key, or
 *  add a new one. Writes go through the page's storage APIs via eval. */
function StorageView({
  storage,
  onSet,
  onRemove,
}: {
  storage: { cookies: [string, string][]; local: [string, string][]; session: [string, string][] };
  onSet: (kind: StoreKind, key: string, value: string) => void | Promise<void>;
  onRemove: (kind: StoreKind, key: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const sections: [string, StoreKind, [string, string][]][] = [
    [t("inspector.cookies"), "cookie", storage.cookies],
    [t("inspector.localStorage"), "local", storage.local],
    [t("inspector.sessionStorage"), "session", storage.session],
  ];
  return (
    <div className="p-1">
      {sections.map(([title, kind, rows]) => (
        <section key={kind} className="mb-2">
          <h3 className="px-1 py-0.5 text-[10px] tracking-[0.06em] text-faint uppercase">
            {title} <span className="text-faint">({rows.length})</span>
          </h3>
          {rows.map(([k, v]) => (
            <div key={k} className="group/row flex items-center gap-2 border-b border-line/40 px-1 py-0.5">
              <span className="w-40 flex-none truncate text-accent" title={k}>{k}</span>
              <input
                key={v}
                defaultValue={v}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onSet(kind, k, (e.target as HTMLInputElement).value);
                }}
                onBlur={(e) => {
                  if (e.target.value !== v) void onSet(kind, k, e.target.value);
                }}
                className="min-w-0 flex-1 rounded bg-transparent px-1 text-ink outline-none focus:bg-surface"
              />
              <IconButton
                size="sm"
                label={t("inspector.deleteKey")}
                icon={<CloseIcon className="h-3 w-3" />}
                onClick={() => void onRemove(kind, k)}
                className="flex-none opacity-0 group-hover/row:opacity-100"
              />
            </div>
          ))}
          <AddRow onAdd={(k, v) => onSet(kind, k, v)} />
        </section>
      ))}
    </div>
  );
}

/** A key/value entry row that adds a new storage item. */
function AddRow({ onAdd }: { onAdd: (key: string, value: string) => void | Promise<void> }) {
  const { t } = useTranslation();
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  const commit = () => {
    if (k.trim()) {
      void onAdd(k.trim(), v);
      setK("");
      setV("");
    }
  };
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <input
        value={k}
        onChange={(e) => setK(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        placeholder={t("inspector.newKey")}
        className="w-40 flex-none rounded bg-surface px-1 text-faint outline-none focus:text-ink"
      />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        placeholder={t("inspector.newValue")}
        className="min-w-0 flex-1 rounded bg-surface px-1 text-faint outline-none focus:text-ink"
      />
    </div>
  );
}
