/**
 * The knowledge graph's nodes and edges, built from what the project knows: its
 * documents and the links between them, its specs, and the notes taken while
 * reading. Pure — positions are seeded deterministically, and the layout itself
 * is the view's business.
 */
import type { Comment, CommentType } from "./api"
import { baseName } from "./comments"
import { stripDocExt } from "./docs"
import type { DocItem } from "./knowledge"
import { dirName } from "./paths"
import type { SpecGroup } from "./specs"

/** The layers the legend can switch off. `file` covers the note→file anchors. */
export type Layer = "doc" | "spec" | "comment" | "file"

export interface Node {
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
export interface Edge {
  a: string
  b: string
  /** "colocation" (containment) reads quiet; "link" (a real reference) accented. */
  kind: "colocation" | "link"
}

/** Build the graph. `size` is the canvas the seed positions are scattered over;
 *  `typeColor` colours a note by its type. */
export function buildGraph(
  {
    docs,
    links,
    comments,
    specGroups,
  }: {
    docs: DocItem[]
    /** `[from, to]` document path pairs, as the documents link to each other. */
    links: Array<[string, string]>
    comments: Comment[]
    specGroups: SpecGroup[]
  },
  { size, typeColor }: { size: { w: number; h: number }; typeColor: (type: CommentType) => string },
): { nodes: Node[]; edges: Edge[] } {
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
      color: typeColor(c.type),
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
        label: stripDocExt(it.label),
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
  for (const d of docs) folders.set(dirName(d.path), (folders.get(dirName(d.path)) ?? 0) + 1)
  for (const d of docs) {
    add({
      id: docId(d.path),
      kind: "doc",
      layer: "doc",
      label: stripDocExt(baseName(d.path)),
      color: "var(--syn-string)",
      file: d.path,
      line: 1,
    })
    const dir = dirName(d.path)
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
}
