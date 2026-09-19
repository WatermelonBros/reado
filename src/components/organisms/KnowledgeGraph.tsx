/**
 * Knowledge graph overlay.
 *
 * Nodes are the project's knowledge — its documents, its specs, the notes taken
 * while reading, and the files those notes sit on. Edges are the relations
 * between them: the links documents make to each other, the links drawn between
 * notes, and the folder each document lives in.
 *
 * The graph earns its place only where it shows something the file tree can't,
 * so **links are read out of the markdown itself** rather than invented from
 * containment. Drawing containment alone turned a modest project into 187
 * look-alike nodes in a ring, 64 of them labelled `spec`, with 418 pairs of
 * overlapping labels and nothing to click. What keeps it readable at that size:
 * a viewport you can zoom and pan, layers you can switch off, labels that
 * appear where they can be read, and one node per thing rather than a hub and a
 * child for every single-document group.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { TYPE_COLOR } from "@/components/atoms/commentMeta"
import { IconButton } from "@/components/atoms/IconButton"
import { CloseIcon } from "@/components/atoms/icons"
import { docLinks, listFiles } from "@/lib/api"
import { baseName, useComments } from "@/lib/comments"
import { type DocItem, listDocs } from "@/lib/knowledge"
import { useSpecs } from "@/lib/specs"
import { useProject, useWorkspace } from "@/lib/store"

const stripExt = (s: string) => s.replace(/\.(md|markdown|mdx)$/i, "")
/** The folder a document lives in, as its own grouping ("" for the root). */
const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")

/** The layers the legend can switch off. `file` covers the note→file anchors. */
type Layer = "doc" | "spec" | "comment" | "file"

interface Node {
  id: string
  kind: "file" | "comment" | "spec" | "doc" | "folder"
  layer: Layer
  label: string
  color: string
  x: number
  y: number
  vx: number
  vy: number
  /** Navigation target. */
  file: string
  line: number
  commentId?: string
}
interface Edge {
  a: string
  b: string
  /** "colocation" (containment) reads quiet; "link" (a real reference) accented. */
  kind: "colocation" | "link"
}

/** Zoom limits, and how much one wheel notch moves it. */
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 1.15
/** Past this scale every node shows its label, however many there are. */
const LABEL_ZOOM = 1.6
/** How many labels the canvas can hold before they collide (418 overlapping
 *  pairs at 187 nodes). Past it, the ones that carry the structure keep theirs
 *  and the rest are earned by hover or by zooming in. */
const LABEL_LIMIT = 45
/** Pointer travel (in screen px) that turns a click into a drag. Without it a
 *  single pixel of hand jitter suppressed the click, so nodes never navigated. */
const DRAG_SLOP = 4

export function KnowledgeGraph() {
  const comments = useComments((s) => s.comments)
  const setActive = useComments((s) => s.setActive)
  const specGroups = useSpecs((s) => s.groups)
  const root = useProject((s) => s.root)
  const open = useProject((s) => s.open)
  const close = useWorkspace((s) => s.toggleGraph)
  const { t } = useTranslation()

  const size = { w: 1280, h: 760 }
  const [docs, setDocs] = useState<DocItem[]>([])
  const [links, setLinks] = useState<Array<[string, string]>>([])
  const [hidden, setHidden] = useState<Set<Layer>>(new Set())
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close])

  // The KB's own docs join the graph as a layer beside comments and specs, and
  // the links they make to each other are what the graph is actually for — one
  // backend call for both, rather than reading a hundred files over IPC.
  useEffect(() => {
    let live = true
    listFiles(root)
      .then(async (files) => {
        if (!live) return
        const found = listDocs(files)
        setDocs(found)
        const paths = files.filter((f) => /\.(md|markdown|mdx)$/i.test(f.replace(/\\/g, "/")))
        const edges = await docLinks(root, paths).catch(() => [])
        if (live) setLinks(edges)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [root])

  // Build the graph from comments, specs and docs (positions seeded once).
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []
    const byId = new Set<string>()
    // Seeded across the area rather than on a circle: a ring seed with a weak
    // pull to the centre never breaks, and the graph settled as a donut with
    // every label piled on the rim and nothing in the middle.
    const add = (node: Omit<Node, "x" | "y" | "vx" | "vy">) => {
      if (byId.has(node.id)) return
      byId.add(node.id)
      // A deterministic scatter (hashed from the id) — a re-render must not
      // reshuffle the layout the user has just made sense of.
      let h = 2166136261
      for (const c of node.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
      const u = ((h >>> 0) % 1000) / 1000
      const v = (((h >>> 10) >>> 0) % 1000) / 1000
      nodes.push({
        ...node,
        x: size.w * (0.12 + u * 0.76),
        y: size.h * (0.12 + v * 0.76),
        vx: 0,
        vy: 0,
      })
    }
    /** Node id for a knowledge document, so links can find it by path. */
    const docId = (path: string) => `k:${path}`

    for (const c of comments) {
      add({
        id: `c:${c.id}`,
        kind: "comment",
        layer: "comment",
        label: c.messages[0]?.body.split("\n")[0]?.slice(0, 28) || c.type,
        color: TYPE_COLOR[c.type],
        file: c.anchor.file,
        line: c.anchor.startLine,
        commentId: c.id,
      })
      if (c.anchor.file) {
        add({
          id: `f:${c.anchor.file}`,
          kind: "file",
          layer: "file",
          label: baseName(c.anchor.file),
          color: "var(--accent)",
          file: c.anchor.file,
          line: 1,
        })
        edges.push({ a: `c:${c.id}`, b: `f:${c.anchor.file}`, kind: "colocation" })
      }
      // Manual links between notes.
      for (const target of c.links) {
        if (comments.some((x) => x.id === target))
          edges.push({ a: `c:${c.id}`, b: `c:${target}`, kind: "link" })
      }
    }

    // --- Specs ---
    // A group with a single document is that document: the hub carried the only
    // useful name (the capability) while the child was labelled from its file
    // name — which for `specs/<capability>/spec.md` is the word "spec", 64 times
    // over, each pair floating unconnected to anything else.
    for (const g of specGroups) {
      if (g.items.length === 1) {
        const it = g.items[0]
        add({
          id: docId(it.path),
          kind: "spec",
          layer: "spec",
          label: g.title,
          color: "var(--syn-control)",
          file: it.path,
          line: 1,
        })
        continue
      }
      const hub = `g:${g.kind}:${g.title}`
      add({
        id: hub,
        kind: "folder",
        layer: "spec",
        label: g.title,
        color: "var(--accent)",
        file: "",
        line: 0,
      })
      for (const it of g.items) {
        add({
          id: docId(it.path),
          kind: "spec",
          layer: "spec",
          label: stripExt(it.label),
          color: "var(--syn-control)",
          file: it.path,
          line: 1,
        })
        edges.push({ a: docId(it.path), b: hub, kind: "colocation" })
      }
    }

    // --- Docs ---
    // Grouped by the folder they live in, not all onto one hub: a single "Docs"
    // node with fifty spokes is a starburst whose edges cross the whole canvas.
    const docPaths = new Set(docs.map((d) => d.path))
    const folders = new Map<string, number>()
    for (const d of docs) folders.set(dirname(d.path), (folders.get(dirname(d.path)) ?? 0) + 1)
    for (const d of docs) {
      add({
        id: docId(d.path),
        kind: "doc",
        layer: "doc",
        label: stripExt(baseName(d.path)),
        color: "var(--syn-string)",
        file: d.path,
        line: 1,
      })
      const dir = dirname(d.path)
      // A folder holding one document adds a node and says nothing.
      if ((folders.get(dir) ?? 0) < 2) continue
      const hub = `dir:${dir}`
      add({
        id: hub,
        kind: "folder",
        layer: "doc",
        // The project root itself, for documents that live directly in it.
        label: dir || "/",
        color: "var(--accent)",
        file: "",
        line: 0,
      })
      edges.push({ a: docId(d.path), b: hub, kind: "colocation" })
    }

    // The links the documents actually make to each other — the reason to draw
    // a graph at all. Spec documents take part too, wherever they are known.
    for (const [from, to] of links) {
      if (byId.has(docId(from)) && byId.has(docId(to)))
        edges.push({ a: docId(from), b: docId(to), kind: "link" })
    }

    // Bridge: a note anchored on a document links across to it.
    for (const c of comments) {
      const target = c.anchor.file && docId(c.anchor.file)
      if (target && byId.has(target) && docPaths.has(c.anchor.file))
        edges.push({ a: `c:${c.id}`, b: target, kind: "link" })
    }

    return { nodes, edges }
  }, [comments, specGroups, docs, links])

  // What the legend leaves switched on. Edges survive only with both ends.
  const shown = useMemo(() => {
    if (!hidden.size) return { nodes, edges }
    const keep = nodes.filter((n) => !hidden.has(n.layer))
    const ids = new Set(keep.map((n) => n.id))
    return { nodes: keep, edges: edges.filter((e) => ids.has(e.a) && ids.has(e.b)) }
  }, [nodes, edges, hidden])

  const nodesRef = useRef(shown.nodes)
  nodesRef.current = shown.nodes
  const dragId = useRef<string | null>(null)
  const dragMoved = useRef(false)
  const pressAt = useRef<{ x: number; y: number } | null>(null)
  const panFrom = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [, setTick] = useState(0)
  // Restarts the cooled-down simulation (called when a node is grabbed). Set by
  // the simulation effect; a ref so handlers always call the live one.
  const reheatRef = useRef<() => void>(() => {})

  // Force simulation with cooldown: it runs until the layout settles (low kinetic
  // energy) or a frame cap, then STOPS — so it doesn't re-render the whole SVG
  // forever (which made a large graph stutter and its nodes impossible to click
  // or drag). Grabbing a node reheats it.
  useEffect(() => {
    let raf = 0
    let frames = 0
    let running = false
    const MAX_FRAMES = 600
    const byId = (id: string) => nodesRef.current.find((n) => n.id === id)
    const step = () => {
      const ns = nodesRef.current
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i]
          const b = ns[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          const d2 = dx * dx + dy * dy || 1
          const f = 5200 / d2
          const d = Math.sqrt(d2)
          dx /= d
          dy /= d
          a.vx += dx * f
          a.vy += dy * f
          b.vx -= dx * f
          b.vy -= dy * f
        }
      }
      for (const e of shown.edges) {
        const a = byId(e.a)
        const b = byId(e.b)
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - 130) * 0.012
        a.vx += (dx / d) * f
        a.vy += (dy / d) * f
        b.vx -= (dx / d) * f
        b.vy -= (dy / d) * f
      }
      let energy = 0
      for (const n of ns) {
        if (n.id === dragId.current) {
          n.vx = 0
          n.vy = 0
          continue
        }
        n.vx += (size.w / 2 - n.x) * 0.002
        n.vy += (size.h / 2 - n.y) * 0.002
        n.vx *= 0.86
        n.vy *= 0.86
        n.x = Math.max(24, Math.min(size.w - 24, n.x + n.vx))
        n.y = Math.max(24, Math.min(size.h - 24, n.y + n.vy))
        energy += n.vx * n.vx + n.vy * n.vy
      }
      frames++
      setTick((x) => x + 1)
      // Keep going while there's meaningful motion (or a node is being dragged),
      // up to a hard cap; otherwise settle and stop re-rendering. The threshold
      // scales with node count so large graphs also reach a stop.
      if ((energy > 0.03 * ns.length || dragId.current) && frames < MAX_FRAMES) {
        raf = requestAnimationFrame(step)
      } else {
        running = false
      }
    }
    const start = () => {
      if (running) return
      running = true
      raf = requestAnimationFrame(step)
    }
    reheatRef.current = () => {
      frames = 0
      start()
    }
    start()
    return () => {
      cancelAnimationFrame(raf)
      running = false
    }
  }, [shown.edges])

  const navigate = (n: Node) => {
    // Hubs (folders, spec groups) carry no file; clicking one just rearranges.
    if (!n.file && !n.commentId) return
    if (n.file) open(`${root}/${n.file}`, n.kind === "comment" ? n.line : undefined)
    if (n.commentId) setActive(n.commentId)
    close(false)
  }

  // Drag handling in SVG coordinates.
  const svgRef = useRef<SVGSVGElement>(null)
  // Pan and zoom move the *viewBox*, not a wrapping transform: the nodes stay in
  // one coordinate system, so a hit test, a drag and the simulation all speak
  // the same numbers, and the SVG keeps one group per node.
  const toGraph = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect?.width) return { x: view.x, y: view.y }
    return {
      x: view.x + ((e.clientX - rect.left) / rect.width) * (size.w / view.k),
      y: view.y + ((e.clientY - rect.top) / rect.height) * (size.h / view.k),
    }
  }

  // Zoom about the pointer, so the thing under the cursor stays under it.
  const onWheel = (e: React.WheelEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect?.width) return
    // A wheel event without usable coordinates zooms about the centre: letting a
    // NaN through here would put one in the viewBox and blank the whole graph.
    const at = (v: number, edge: number, span: number) =>
      Number.isFinite(v) ? (v - edge) / span : 0.5
    const fx = at(e.clientX, rect.left, rect.width)
    const fy = at(e.clientY, rect.top, rect.height)
    setView((v) => {
      const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.k * ZOOM_STEP ** (e.deltaY < 0 ? 1 : -1)))
      // The graph point under the cursor before the zoom must be under it after.
      return {
        k,
        x: v.x + fx * (size.w / v.k - size.w / k),
        y: v.y + fy * (size.h / v.k - size.h / k),
      }
    })
  }
  const reset = useCallback(() => setView({ x: 0, y: 0, k: 1 }), [])

  const toggleLayer = (layer: Layer) =>
    setHidden((h) => {
      const next = new Set(h)
      if (!next.delete(layer)) next.add(layer)
      return next
    })

  const byId = (id: string) => nodesRef.current.find((n) => n.id === id)
  // Neighbours of the hovered node, so hovering reads the immediate structure
  // instead of one lonely label in a field of dots.
  // Which nodes keep a label when there are too many to label them all: the
  // anchors, then the best-connected — a hub of five documents says more about
  // the shape of the graph than the fifth leaf off it.
  const degree = useMemo(() => {
    const d = new Map<string, number>()
    for (const e of shown.edges) {
      d.set(e.a, (d.get(e.a) ?? 0) + 1)
      d.set(e.b, (d.get(e.b) ?? 0) + 1)
    }
    return d
  }, [shown.edges])

  const labelled = useMemo(() => {
    if (shown.nodes.length <= LABEL_LIMIT) return null
    return new Set(
      [...shown.nodes]
        // A note's label is a whole sentence; it stays on hover whatever its degree.
        .filter((n) => n.kind !== "comment")
        .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
        .slice(0, LABEL_LIMIT)
        .filter((n) => (degree.get(n.id) ?? 0) > 0)
        .map((n) => n.id),
    )
  }, [shown, degree])

  const near = useMemo(() => {
    if (!hoverId) return null
    const s = new Set<string>([hoverId])
    for (const e of shown.edges) {
      if (e.a === hoverId) s.add(e.b)
      if (e.b === hoverId) s.add(e.a)
    }
    return s
  }, [hoverId, shown.edges])

  const legend: Array<{ layer: Layer; label: string; color: string; ring?: boolean }> = [
    { layer: "doc", label: t("graph.legend.doc"), color: "var(--syn-string)" },
    { layer: "spec", label: t("graph.legend.spec"), color: "var(--syn-control)" },
    { layer: "comment", label: t("graph.legend.comment"), color: "var(--syn-keyword)" },
    { layer: "file", label: t("graph.legend.file"), color: "var(--accent)", ring: true },
  ]

  return createPortal(
    <div
      onClick={() => close(false)}
      className="animate-fade fixed inset-0 z-[115] grid place-items-center reado-scrim"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[86vh] w-[94vw] max-w-[1320px] flex-col overflow-hidden rounded-lg border border-line-strong bg-canvas shadow-[var(--shadow)]"
      >
        <header className="flex flex-none items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="m-0 text-sm font-medium">{t("graph.title")}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-faint">
              {t("graph.count", { nodes: shown.nodes.length, links: shown.edges.length })}
            </span>
            <button
              type="button"
              onClick={reset}
              className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:bg-surface"
            >
              {t("graph.reset")}
            </button>
            <IconButton
              label={t("settings.close")}
              icon={<CloseIcon />}
              onClick={() => close(false)}
            />
          </div>
        </header>
        {nodes.length === 0 ? (
          <p className="grid flex-1 place-items-center text-sm text-faint">{t("graph.empty")}</p>
        ) : (
          <svg
            ref={svgRef}
            role="img"
            aria-label={t("graph.title")}
            viewBox={`${view.x} ${view.y} ${size.w / view.k} ${size.h / view.k}`}
            className="min-h-0 flex-1 touch-none"
            onWheel={onWheel}
            // Pressing the background pans; pressing a node drags it.
            onPointerDown={(e) => {
              const p = toGraph(e)
              panFrom.current = { x: p.x, y: p.y, vx: view.x, vy: view.y }
            }}
            onPointerMove={(e) => {
              if (dragId.current) {
                const start = pressAt.current
                if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_SLOP)
                  dragMoved.current = true
                const n = byId(dragId.current)
                if (n) {
                  const p = toGraph(e)
                  n.x = p.x
                  n.y = p.y
                  // A settled simulation has stopped re-rendering: without this
                  // the node stays painted where it was and the drag looks dead.
                  reheatRef.current()
                }
                return
              }
              const from = panFrom.current
              if (!from || !e.buttons) return
              // Where the grab started must stay under the pointer.
              const rect = svgRef.current?.getBoundingClientRect()
              if (!rect?.width) return
              const gx = from.vx + ((e.clientX - rect.left) / rect.width) * (size.w / view.k)
              const gy = from.vy + ((e.clientY - rect.top) / rect.height) * (size.h / view.k)
              setView((v) => ({ ...v, x: v.x + (from.x - gx), y: v.y + (from.y - gy) }))
            }}
            onPointerUp={() => {
              dragId.current = null
              panFrom.current = null
            }}
            onPointerLeave={() => {
              dragId.current = null
              panFrom.current = null
            }}
          >
            {shown.edges.map((e, i) => {
              const a = byId(e.a)
              const b = byId(e.b)
              if (!a || !b) return null
              const lit = near?.has(e.a) && near?.has(e.b)
              return (
                <line
                  key={`${e.a}|${e.b}|${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={e.kind === "link" || lit ? "var(--accent)" : "var(--border)"}
                  strokeWidth={(e.kind === "link" ? 1.5 : 1) / Math.max(view.k, 1)}
                  strokeOpacity={near && !lit ? 0.25 : 1}
                />
              )
            })}
            {shown.nodes.map((n) => {
              const isAnchor = n.kind === "file" || n.kind === "folder"
              // Nothing links to it and it links to nothing. It is still part of
              // the knowledge base, but drawn full strength a hundred of them
              // read as a field of identical dots over everything that does
              // connect. Quieter, not hidden — the legend hides layers.
              const loose = (degree.get(n.id) ?? 0) === 0
              const flip = n.x > view.x + (size.w / view.k) * 0.8
              // A label per node is unreadable at a hundred nodes — 418 pairs
              // of them overlapped. Anchors keep theirs; the rest earn one by
              // being hovered, adjacent to what is hovered, or zoomed into.
              const showLabel =
                isAnchor ||
                // A note's label is a sentence out of its first line; there are
                // many of them and they are long, so they stay on hover or zoom
                // however small the graph is.
                (n.kind !== "comment" && (labelled ? labelled.has(n.id) : true)) ||
                view.k >= LABEL_ZOOM ||
                (near ? near.has(n.id) : false)
              const dim = near && !near.has(n.id)
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className="cursor-pointer"
                  opacity={dim ? 0.35 : loose ? 0.5 : 1}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    svgRef.current?.setPointerCapture(e.pointerId)
                    dragId.current = n.id
                    dragMoved.current = false
                    pressAt.current = { x: e.clientX, y: e.clientY }
                    panFrom.current = null
                    reheatRef.current() // resume the layout so neighbours adjust
                  }}
                  onPointerEnter={() => setHoverId(n.id)}
                  onPointerLeave={() => setHoverId((h) => (h === n.id ? null : h))}
                  // A drag must not also navigate — but a click that moved a
                  // pixel is still a click.
                  onClick={() => !dragMoved.current && navigate(n)}
                >
                  <circle
                    r={(isAnchor ? 11 : loose ? 5 : 7.5) / Math.max(view.k, 1) ** 0.5}
                    fill={isAnchor ? "var(--bg-elevated)" : n.color}
                    stroke={n.color}
                    strokeWidth={(isAnchor ? 2.5 : 1.5) / Math.max(view.k, 1) ** 0.5}
                  />
                  {showLabel && (
                    <text
                      // Past the right edge a label is simply cut off, so there
                      // it reads back towards the middle instead.
                      textAnchor={flip ? "end" : "start"}
                      x={((isAnchor ? 15 : 12) / Math.max(view.k, 1) ** 0.5) * (flip ? -1 : 1)}
                      y={4 / Math.max(view.k, 1)}
                      fontSize={(isAnchor ? 13 : 12) / Math.max(view.k, 1)}
                      fill="var(--text)"
                      // A halo (stroke painted under the fill) keeps the label
                      // readable where it crosses edges or other nodes.
                      stroke="var(--bg)"
                      strokeWidth={3 / Math.max(view.k, 1)}
                      paintOrder="stroke"
                      style={{ fontFamily: "var(--font-ui)", pointerEvents: "none" }}
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
        {nodes.length > 0 && (
          <footer className="flex flex-none flex-wrap items-center gap-1 border-t border-line px-3 py-2 text-xs text-faint">
            {legend.map((l) => {
              const off = hidden.has(l.layer)
              return (
                <button
                  key={l.layer}
                  type="button"
                  aria-pressed={!off}
                  onClick={() => toggleLayer(l.layer)}
                  className={`inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-surface ${
                    off ? "opacity-40" : ""
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={
                      l.ring
                        ? { border: `2px solid ${l.color}`, background: "var(--bg-elevated)" }
                        : { background: l.color }
                    }
                  />
                  {l.label}
                </button>
              )
            })}
            <span className="ml-auto inline-flex items-center gap-1.5 pr-1">
              <span className="h-px w-4" style={{ background: "var(--accent)" }} />
              {t("graph.legend.link")}
            </span>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
