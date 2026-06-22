/**
 * Knowledge graph overlay.
 *
 * Nodes are files and comments; edges are co-location (a comment to its file)
 * and manual links (comment to comment). A small force simulation lays them
 * out; nodes are draggable, and clicking one navigates to it. This is a
 * lightweight, dependency-free force layout suited to the modest node counts of
 * a personal project's annotations.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useComments } from "../../lib/comments";
import { useProject, useWorkspace } from "../../lib/store";
import { useSpecs } from "../../lib/specs";
import { listFiles } from "../../lib/api";
import { listDocs, type DocItem } from "../../lib/knowledge";

import { TYPE_COLOR } from "../atoms/commentMeta";
import { CloseIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

const stripExt = (s: string) => s.replace(/\.(md|markdown|mdx)$/i, "");

interface Node {
  id: string;
  kind: "file" | "comment" | "spec" | "doc" | "change";
  label: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Navigation target. */
  file: string;
  line: number;
  commentId?: string;
}
interface Edge {
  a: string;
  b: string;
  /** "colocation" (comment→file) reads quiet; "link" (manual) reads accented. */
  kind: "colocation" | "link";
}

const basename = (p: string) => p.split("/").pop() ?? p;

export function KnowledgeGraph() {
  const comments = useComments((s) => s.comments);
  const setActive = useComments((s) => s.setActive);
  const specGroups = useSpecs((s) => s.groups);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const close = useWorkspace((s) => s.toggleGraph);
  const { t } = useTranslation();

  const size = { w: 900, h: 620 };
  const [docs, setDocs] = useState<DocItem[]>([]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // The KB's own docs join the graph as a layer beside comments and specs.
  useEffect(() => {
    listFiles(root)
      .then((files) => setDocs(listDocs(files)))
      .catch(() => {});
  }, [root]);

  // Build the graph from current comments (positions seeded once).
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const fileIds = new Set<string>();
    const seed = (i: number, n: number) => ({
      x: size.w / 2 + Math.cos((i / Math.max(n, 1)) * Math.PI * 2) * 180 + (Math.random() - 0.5) * 40,
      y: size.h / 2 + Math.sin((i / Math.max(n, 1)) * Math.PI * 2) * 180 + (Math.random() - 0.5) * 40,
    });

    comments.forEach((c, i) => {
      const p = seed(i, comments.length);
      nodes.push({
        id: `c:${c.id}`,
        kind: "comment",
        label: c.messages[0]?.body.split("\n")[0]?.slice(0, 28) || c.type,
        color: TYPE_COLOR[c.type],
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        file: c.anchor.file,
        line: c.anchor.startLine,
        commentId: c.id,
      });
      if (c.anchor.file) {
        const fid = `f:${c.anchor.file}`;
        if (!fileIds.has(fid)) {
          fileIds.add(fid);
          const fp = seed(i + 0.5, comments.length);
          nodes.push({
            id: fid,
            kind: "file",
            label: basename(c.anchor.file),
            color: "var(--accent)",
            x: fp.x,
            y: fp.y,
            vx: 0,
            vy: 0,
            file: c.anchor.file,
            line: 1,
          });
        }
        edges.push({ a: `c:${c.id}`, b: fid, kind: "colocation" });
      }
      // Manual links between comments.
      for (const target of c.links) {
        if (comments.some((x) => x.id === target))
          edges.push({ a: `c:${c.id}`, b: `c:${target}`, kind: "link" });
      }
    });

    // --- Knowledge layer: specs and docs ---
    // Each spec change/feature is a hub; its documents and capabilities orbit
    // it. Docs hang off a single "Docs" hub. Where a comment is anchored on a
    // doc/spec path, it links across to that knowledge node, bridging the two
    // layers into one graph.
    const kbByPath = new Map<string, string>();
    let idx = comments.length;
    const addKb = (
      id: string,
      kind: "spec" | "doc" | "change",
      label: string,
      color: string,
      file: string,
    ) => {
      const p = seed(idx++, comments.length + specGroups.length + docs.length + 4);
      nodes.push({ id, kind, label, color, x: p.x, y: p.y, vx: 0, vy: 0, file, line: file ? 1 : 0 });
      if (file) kbByPath.set(file, id);
    };

    specGroups.forEach((g) => {
      const chId = `ch:${g.kind}:${g.title}`;
      addKb(chId, "change", g.title, "var(--accent)", "");
      for (const it of g.items) {
        const sid = `s:${it.path}`;
        addKb(sid, "spec", stripExt(it.label), "var(--syn-control)", it.path);
        edges.push({ a: sid, b: chId, kind: "colocation" });
      }
    });

    if (docs.length) {
      const hub = "dh:docs";
      addKb(hub, "change", t("kb.docs"), "var(--accent)", "");
      for (const d of docs) {
        const did = `d:${d.path}`;
        addKb(did, "doc", basename(d.path), "var(--syn-string)", d.path);
        edges.push({ a: did, b: hub, kind: "colocation" });
      }
    }

    // Bridge: a comment anchored on a doc/spec links to that knowledge node.
    for (const c of comments) {
      const kbId = c.anchor.file && kbByPath.get(c.anchor.file);
      if (kbId) edges.push({ a: `c:${c.id}`, b: kbId, kind: "link" });
    }

    return { nodes, edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, specGroups, docs]);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const dragId = useRef<string | null>(null);
  const dragMoved = useRef(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Force simulation.
  useEffect(() => {
    let raf = 0;
    const byId = (id: string) => nodesRef.current.find((n) => n.id === id);
    const step = () => {
      const ns = nodesRef.current;
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i];
          const b = ns[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 1;
          const f = 2600 / d2;
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          a.vx += dx * f;
          a.vy += dy * f;
          b.vx -= dx * f;
          b.vy -= dy * f;
        }
      }
      for (const e of edges) {
        const a = byId(e.a);
        const b = byId(e.b);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 90) * 0.012;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      for (const n of ns) {
        if (n.id === dragId.current) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx += (size.w / 2 - n.x) * 0.002;
        n.vy += (size.h / 2 - n.y) * 0.002;
        n.vx *= 0.86;
        n.vy *= 0.86;
        n.x = Math.max(24, Math.min(size.w - 24, n.x + n.vx));
        n.y = Math.max(24, Math.min(size.h - 24, n.y + n.vy));
      }
      setTick((x) => x + 1);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [edges]);

  const navigate = (n: Node) => {
    // Hubs (change/docs) carry no file; clicking them just rearranges, no nav.
    if (!n.file && !n.commentId) return;
    if (n.file) open(`${root}/${n.file}`, n.kind === "comment" ? n.line : undefined);
    if (n.commentId) setActive(n.commentId);
    close(false);
  };

  // Drag handling in SVG coordinates.
  const svgRef = useRef<SVGSVGElement>(null);
  const toSvg = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * size.w,
      y: ((e.clientY - rect.top) / rect.height) * size.h,
    };
  };

  const byId = (id: string) => nodesRef.current.find((n) => n.id === id);

  return (
    <div
      onClick={() => close(false)}
      className="animate-fade fixed inset-0 z-[115] grid place-items-center reado-scrim"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[88vh] w-[92vw] max-w-[1100px] flex-col overflow-hidden rounded-lg border border-line-strong bg-canvas shadow-[var(--shadow)]"
      >
        <header className="flex flex-none items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="m-0 text-sm font-semibold tracking-wide uppercase">
            {t("graph.title")}
          </h2>
          <button
            type="button"
            aria-label={t("settings.close")}
            onClick={() => close(false)}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
          >
            <CloseIcon />
          </button>
        </header>
        {nodes.length === 0 ? (
          <p className="grid flex-1 place-items-center text-sm text-faint">{t("comments.empty")}</p>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${size.w} ${size.h}`}
            className="min-h-0 flex-1"
            onPointerMove={(e) => {
              if (!dragId.current) return;
              dragMoved.current = true;
              const p = toSvg(e);
              const n = byId(dragId.current);
              if (n) {
                n.x = p.x;
                n.y = p.y;
              }
            }}
            onPointerUp={() => (dragId.current = null)}
            onPointerLeave={() => (dragId.current = null)}
          >
            {edges.map((e, i) => {
              const a = byId(e.a);
              const b = byId(e.b);
              if (!a || !b) return null;
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={e.kind === "link" ? "var(--accent)" : "var(--border)"}
                  strokeWidth={e.kind === "link" ? 1.5 : 1}
                />
              );
            })}
            {nodes.map((n) => {
              const isHub = n.kind === "change";
              const isAnchor = n.kind === "file" || isHub;
              const showLabel = isAnchor || hoverId === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className="cursor-pointer"
                  onPointerDown={(e) => {
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    dragId.current = n.id;
                    dragMoved.current = false;
                  }}
                  onPointerEnter={() => setHoverId(n.id)}
                  onPointerLeave={() => setHoverId((h) => (h === n.id ? null : h))}
                  // A drag must not also navigate.
                  onClick={() => !dragMoved.current && navigate(n)}
                >
                  <circle
                    r={isAnchor ? 9 : 6}
                    fill={isAnchor ? "var(--bg-elevated)" : n.color}
                    stroke={n.color}
                    strokeWidth={isAnchor ? 2 : 1}
                  />
                  {showLabel && (
                    <text
                      x={isAnchor ? 13 : 10}
                      y={4}
                      fontSize={isAnchor ? 12 : 11}
                      fill="var(--text)"
                      style={{ fontFamily: "var(--font-ui)", pointerEvents: "none" }}
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {nodes.length > 0 && (
          <footer className="flex flex-none items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-accent bg-surface" />
              {t("graph.legend.file")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--syn-keyword)" }} />
              {t("graph.legend.comment")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--syn-control)" }} />
              {t("graph.legend.spec")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--syn-string)" }} />
              {t("graph.legend.doc")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-px w-4" style={{ background: "var(--accent)" }} />
              {t("graph.legend.link")}
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
