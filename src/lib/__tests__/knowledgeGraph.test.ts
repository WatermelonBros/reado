import { describe, expect, it } from "vitest"
import type { Comment } from "../api"
import { buildGraph } from "../knowledgeGraph"

const size = { w: 1000, h: 600 }
const typeColor = () => "red"

const note = (id: string, file: string, links: string[] = []): Comment =>
  ({
    id,
    type: "note",
    state: "open",
    kind: "note",
    anchor: { file, startLine: 3, endLine: 3, scope: "range" },
    links,
    messages: [{ body: `about ${id}\nmore` }],
  }) as unknown as Comment

const build = (over: Partial<Parameters<typeof buildGraph>[0]>) =>
  buildGraph({ docs: [], links: [], comments: [], specGroups: [], ...over }, { size, typeColor })

describe("buildGraph", () => {
  it("draws a note, the file it sits on, and the links between notes", () => {
    const { nodes, edges } = build({
      comments: [note("a", "src/x.ts", ["b", "gone"]), note("b", "src/x.ts")],
    })
    expect(nodes.map((n) => n.id).sort()).toEqual(["c:a", "c:b", "f:src/x.ts"])
    expect(nodes.find((n) => n.id === "c:a")?.label).toBe("about a")
    // A link to a note that no longer exists draws nothing.
    expect(edges).toContainEqual({ a: "c:a", b: "c:b", kind: "link" })
    expect(edges.filter((e) => e.b === "c:gone")).toEqual([])
    expect(edges.filter((e) => e.b === "f:src/x.ts")).toHaveLength(2)
  })

  it("draws a single-document spec group as that document, named by the group", () => {
    const { nodes } = build({
      specGroups: [
        {
          title: "search",
          kind: "spec",
          items: [{ path: "specs/search/spec.md", label: "spec.md" }],
        },
      ] as never,
    })
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ id: "k:specs/search/spec.md", label: "search", kind: "spec" })
  })

  it("hangs a larger spec group off a hub", () => {
    const { nodes, edges } = build({
      specGroups: [
        {
          title: "auth",
          kind: "change",
          items: [
            { path: "c/auth/proposal.md", label: "proposal.md" },
            { path: "c/auth/design.md", label: "design.md" },
          ],
        },
      ] as never,
    })
    expect(nodes.map((n) => n.label).sort()).toEqual(["auth", "design", "proposal"])
    expect(edges.every((e) => e.b === "g:change:auth" && e.kind === "colocation")).toBe(true)
  })

  it("groups documents by folder only where a folder holds more than one", () => {
    const docs = [
      { path: "README.md", label: "README.md" },
      { path: "docs/a.md", label: "docs/a.md" },
      { path: "docs/b.md", label: "docs/b.md" },
    ]
    const { nodes, edges } = build({ docs, links: [["docs/a.md", "README.md"]] })
    expect(nodes.map((n) => n.id).sort()).toEqual([
      "dir:docs",
      "k:README.md",
      "k:docs/a.md",
      "k:docs/b.md",
    ])
    expect(nodes.find((n) => n.id === "k:README.md")?.label).toBe("README")
    expect(edges).toContainEqual({ a: "k:docs/a.md", b: "k:README.md", kind: "link" })
    // No hub for the root, which holds one document.
    expect(edges.filter((e) => e.a === "k:README.md")).toEqual([])
  })

  it("bridges a note on a document across to it, and ignores links to unknown docs", () => {
    const docs = [{ path: "docs/a.md", label: "docs/a.md" }]
    const { edges } = build({
      docs,
      links: [["docs/a.md", "nowhere.md"]],
      comments: [note("n", "docs/a.md")],
    })
    expect(edges).toContainEqual({ a: "c:n", b: "k:docs/a.md", kind: "link" })
    expect(edges.some((e) => e.b === "k:nowhere.md")).toBe(false)
  })

  it("seeds positions deterministically, inside the canvas", () => {
    const one = build({ comments: [note("a", "x.ts")] }).nodes
    const two = build({ comments: [note("a", "x.ts")] }).nodes
    expect(one.map((n) => [n.x, n.y])).toEqual(two.map((n) => [n.x, n.y]))
    for (const n of one) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(size.w)
      expect(n.y).toBeLessThanOrEqual(size.h)
    }
  })
})
