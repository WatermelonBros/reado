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
import { useComments } from "../lib/comments";
import { useProject, useWorkspace } from "../lib/store";
import { useT } from "../i18n";
import { TYPE_COLOR } from "./commentMeta";
import { CloseIcon } from "./icons";

interface Node {
  id: string;
  kind: "file" | "comment";
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
}

const basename = (p: string) => p.split("/").pop() ?? p;

export function KnowledgeGraph() {
  const comments = useComments((s) => s.comments);
  const setActive = useComments((s) => s.setActive);
  const root = useProject((s) => s.root);
  const open = useProject((s) => s.open);
  const close = useWorkspace((s) => s.toggleGraph);
  const t = useT();

  const size = { w: 900, h: 620 };

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

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
        edges.push({ a: `c:${c.id}`, b: fid }); // co-location
      }
      // Manual links between comments.
      for (const target of c.links) {
        if (comments.some((x) => x.id === target)) edges.push({ a: `c:${c.id}`, b: `c:${target}` });
      }
    });
    return { nodes, edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments]);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const dragId = useRef<string | null>(null);
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
      className="animate-fade fixed inset-0 z-[115] grid place-items-center bg-[color-mix(in_oklch,var(--bg)_70%,transparent)] backdrop-blur-[2px]"
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
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                />
              );
            })}
            {nodes.map((n) => (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                className="cursor-pointer"
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  dragId.current = n.id;
                }}
                onClick={() => navigate(n)}
              >
                <circle
                  r={n.kind === "file" ? 9 : 6}
                  fill={n.kind === "file" ? "var(--bg-elevated)" : n.color}
                  stroke={n.color}
                  strokeWidth={n.kind === "file" ? 2 : 1}
                />
                <text
                  x={n.kind === "file" ? 13 : 10}
                  y={4}
                  fontSize={n.kind === "file" ? 12 : 11}
                  fill={n.kind === "file" ? "var(--text)" : "var(--text-muted)"}
                  style={{ fontFamily: "var(--font-ui)", pointerEvents: "none" }}
                >
                  {n.label}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
