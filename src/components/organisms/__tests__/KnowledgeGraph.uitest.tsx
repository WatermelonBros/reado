// UI test: the knowledge-graph overlay — what it puts in the graph (comments,
// their files, specs, docs and the bridges between them), and what clicking,
// dragging and Escape do. The force simulation is real but settles on its own.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Comment } from "@/lib/api"

const listFiles = vi.fn<(root: string) => Promise<string[]>>(async () => [])
const docLinks = vi.fn<(root: string, files: string[]) => Promise<Array<[string, string]>>>(
  async () => [],
)
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  listFiles: (root: string) => listFiles(root),
  docLinks: (root: string, files: string[]) => docLinks(root, files),
}))

import { KnowledgeGraph } from "@/components/organisms/KnowledgeGraph"
import { useComments } from "@/lib/comments"
import { useSpecs } from "@/lib/specs"
import { useProject, useWorkspace } from "@/lib/store"

const ROOT = "/repo"

const comment = (over: Partial<Comment> = {}): Comment =>
  ({
    id: "c1",
    state: "open",
    kind: "task",
    type: "bug",
    links: [],
    messages: [{ author: "me", body: "the first line\nand more", createdAt: 0 }],
    anchor: { scope: "range", file: "src/a.ts", startLine: 12, endLine: 12 },
    ...over,
  }) as Comment

const open = vi.fn()
const setActive = vi.fn()
const toggleGraph = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  listFiles.mockResolvedValue([])
  docLinks.mockResolvedValue([])
  useProject.setState({ root: ROOT, open })
  useComments.setState({ comments: [], setActive })
  useSpecs.setState({ groups: [] })
  useWorkspace.setState({ toggleGraph })
})

/** Every node label currently drawn. */
const labels = () => [...document.querySelectorAll("svg text")].map((n) => n.textContent)

describe("what goes in the graph", () => {
  it("says so when there is nothing to show", () => {
    render(<KnowledgeGraph />)
    expect(screen.getByText("graph.empty")).toBeInTheDocument()
  })

  it("draws a comment and the file it is anchored to", async () => {
    useComments.setState({ comments: [comment()] })
    render(<KnowledgeGraph />)
    await waitFor(() => expect(labels()).toContain("a.ts"))
    // A comment's label is its first line, and only on hover.
    expect(labels()).not.toContain("the first line")
  })

  it("collapses several comments on one file onto a single file node", async () => {
    useComments.setState({
      comments: [
        comment(),
        comment({ id: "c2" }),
        comment({
          id: "c3",
          anchor: { scope: "range", file: "src/b.ts", startLine: 1, endLine: 1 },
        } as Partial<Comment>),
      ],
    })
    render(<KnowledgeGraph />)
    await waitFor(() => expect(labels().filter((l) => l === "a.ts")).toHaveLength(1))
    expect(labels()).toContain("b.ts")
  })

  it("draws a one-document spec group as one node, named for the group", async () => {
    // A hub plus a lone child said the same thing twice, and named the child
    // from its file: `specs/<capability>/spec.md` became the word "spec", once
    // per capability, each pair floating unconnected.
    useSpecs.setState({
      groups: [
        {
          kind: "spec",
          title: "add-search",
          items: [{ path: "openspec/specs/add-search/spec.md", label: "spec.md" }],
        },
      ],
    } as unknown as Parameters<typeof useSpecs.setState>[0])
    render(<KnowledgeGraph />)
    await waitFor(() => expect(labels()).toContain("add-search"))
    expect(labels()).not.toContain("spec")
    expect(document.querySelectorAll("svg[role=img] g")).toHaveLength(1)
  })

  it("keeps the hub when a spec group really has several documents", async () => {
    useSpecs.setState({
      groups: [
        {
          kind: "change",
          title: "add-search",
          items: [
            { path: "openspec/changes/add-search/proposal.md", label: "proposal.md" },
            { path: "openspec/changes/add-search/tasks.md", label: "tasks.md" },
          ],
        },
      ],
    } as unknown as Parameters<typeof useSpecs.setState>[0])
    render(<KnowledgeGraph />)
    await waitFor(() => expect(labels()).toContain("add-search"))
    expect(labels()).toEqual(expect.arrayContaining(["proposal", "tasks"]))
  })

  it("groups docs by their folder, and leaves a lone document ungrouped", async () => {
    // One "Docs" hub for every document in the project is a starburst whose
    // spokes cross the whole canvas; a folder holding one file is no grouping.
    listFiles.mockResolvedValue(["docs/a.md", "docs/b.md", "notes/only.md", "src/a.ts"])
    render(<KnowledgeGraph />)
    await waitFor(() => expect(labels()).toContain("docs"))
    expect(labels()).toEqual(expect.arrayContaining(["a", "b", "only"]))
    expect(labels()).not.toContain("notes")
  })

  it("draws the links the documents make to each other", async () => {
    // The reason to draw a graph at all: containment is what the file tree
    // already shows.
    listFiles.mockResolvedValue(["docs/a.md", "docs/b.md"])
    docLinks.mockResolvedValue([["docs/a.md", "docs/b.md"]])
    render(<KnowledgeGraph />)
    await waitFor(() => expect(labels()).toContain("a"))
    await waitFor(() =>
      expect(
        [...document.querySelectorAll("line")].filter(
          (l) => l.getAttribute("stroke") === "var(--accent)",
        ),
      ).toHaveLength(1),
    )
    expect(docLinks).toHaveBeenCalledWith(ROOT, ["docs/a.md", "docs/b.md"])
  })

  it("still draws the docs when their links can't be read", async () => {
    listFiles.mockResolvedValue(["docs/a.md", "docs/b.md"])
    docLinks.mockRejectedValue(new Error("nope"))
    render(<KnowledgeGraph />)
    await waitFor(() => expect(labels()).toContain("a"))
  })

  it("draws manual links between comments, and only to comments that exist", async () => {
    useComments.setState({
      comments: [comment({ links: ["c2", "gone"] } as Partial<Comment>), comment({ id: "c2" })],
    })
    render(<KnowledgeGraph />)
    await waitFor(() => expect(document.querySelectorAll("line").length).toBeGreaterThan(0))
    const accented = [...document.querySelectorAll("line")].filter(
      (l) => l.getAttribute("stroke") === "var(--accent)",
    )
    expect(accented).toHaveLength(1)
  })

  it("keeps every node inside the canvas as the simulation settles", async () => {
    useComments.setState({
      comments: Array.from({ length: 40 }, (_, i) =>
        comment({
          id: `k${i}`,
          anchor: { file: `src/f${i}.ts`, scope: "range", startLine: 1, endLine: 1 },
        } as Partial<Comment>),
      ),
    })
    render(<KnowledgeGraph />)
    await waitFor(() => expect(document.querySelectorAll("g[transform]").length).toBeGreaterThan(0))
    // Let the force simulation run itself out.
    await new Promise((r) => setTimeout(r, 300))
    const positions = [...document.querySelectorAll("g[transform]")]
      .map((g) => /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute("transform") ?? ""))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [Number(m[1]), Number(m[2])] as const)
    expect(positions.length).toBeGreaterThan(0)
    // Nodes that drift out never come back — part of the graph simply leaves.
    for (const [x, y] of positions) {
      expect(x).toBeGreaterThanOrEqual(24)
      expect(x).toBeLessThanOrEqual(1280 - 24)
      expect(y).toBeGreaterThanOrEqual(24)
      expect(y).toBeLessThanOrEqual(760 - 24)
    }
  })

  it("survives a project whose file list can't be read", async () => {
    listFiles.mockRejectedValue(new Error("no project"))
    useComments.setState({ comments: [comment()] })
    render(<KnowledgeGraph />)
    await waitFor(() => expect(labels()).toContain("a.ts"))
  })
})

describe("navigating", () => {
  it("opens a comment's file at its line, and selects the comment", async () => {
    useComments.setState({ comments: [comment()] })
    render(<KnowledgeGraph />)
    await waitFor(() => expect(document.querySelectorAll("g").length).toBeGreaterThan(0))
    const group = document.querySelectorAll("g")[0]
    fireEvent.click(group)
    expect(open).toHaveBeenCalledWith("/repo/src/a.ts", 12)
    expect(setActive).toHaveBeenCalledWith("c1")
    expect(toggleGraph).toHaveBeenCalledWith(false)
  })

  it("a drag moves the node, and doesn't navigate", async () => {
    useComments.setState({ comments: [comment()] })
    render(<KnowledgeGraph />)
    await waitFor(() => expect(document.querySelectorAll("g").length).toBeGreaterThan(0))
    // The graph's own canvas — `querySelector("svg")` would find the close icon.
    const svg = screen.getByRole("img", { name: "graph.title" }) as unknown as SVGSVGElement
    svg.setPointerCapture = vi.fn()
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1280, height: 760, right: 1280, bottom: 760 }) as DOMRect
    const group = document.querySelectorAll("g")[0]
    const before = group.getAttribute("transform")
    fireEvent.pointerDown(group, { pointerId: 1, bubbles: true })
    // The move bubbles from the node up to the svg, which owns the handler.
    fireEvent.pointerMove(group, { clientX: 640, clientY: 380, bubbles: true })
    // The node followed the pointer to the middle of the canvas…
    await waitFor(() => expect(group.getAttribute("transform")).not.toBe(before))
    expect(group.getAttribute("transform")).toBe("translate(640,380)")
    fireEvent.pointerUp(group, { bubbles: true })
    // …and releasing it there is a rearrangement, not a click-through.
    fireEvent.click(group)
    expect(open).not.toHaveBeenCalled()
  })

  it("navigates on a click that moved a pixel — a hand is not a drag", async () => {
    // Without a threshold ANY pointer movement suppressed the click, and a real
    // mouse always moves one: clicking a node did nothing at all.
    useComments.setState({ comments: [comment()] })
    render(<KnowledgeGraph />)
    await waitFor(() => expect(document.querySelectorAll("g").length).toBeGreaterThan(0))
    const svg = screen.getByRole("img", { name: "graph.title" }) as unknown as SVGSVGElement
    svg.setPointerCapture = vi.fn()
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1280, height: 760, right: 1280, bottom: 760 }) as DOMRect
    const group = document.querySelectorAll("g")[0]
    fireEvent.pointerDown(group, { pointerId: 1, clientX: 100, clientY: 100, bubbles: true })
    fireEvent.pointerMove(group, { clientX: 101, clientY: 100, bubbles: true })
    fireEvent.pointerUp(group, { bubbles: true })
    fireEvent.click(group)
    expect(open).toHaveBeenCalledWith("/repo/src/a.ts", 12)
  })

  it("reveals a comment's text on hover", async () => {
    useComments.setState({ comments: [comment()] })
    render(<KnowledgeGraph />)
    await waitFor(() => expect(document.querySelectorAll("g").length).toBeGreaterThan(0))
    fireEvent.pointerEnter(document.querySelectorAll("g")[0])
    await waitFor(() => expect(labels()).toContain("the first line"))
    fireEvent.pointerLeave(document.querySelectorAll("g")[0])
    await waitFor(() => expect(labels()).not.toContain("the first line"))
  })
})

describe("keeping it readable", () => {
  it("switches a layer off from the legend, and its edges with it", async () => {
    useComments.setState({ comments: [comment()] })
    listFiles.mockResolvedValue(["docs/a.md", "docs/b.md"])
    render(<KnowledgeGraph />)
    await waitFor(() => expect(labels()).toContain("a"))
    expect(labels()).toContain("a.ts") // the note's file

    await userEvent.click(screen.getByRole("button", { name: "graph.legend.doc" }))
    await waitFor(() => expect(labels()).not.toContain("a"))
    // The other layers stay, and no edge is left dangling.
    expect(labels()).toContain("a.ts")
    for (const line of document.querySelectorAll("line")) {
      expect(line.getAttribute("x1")).not.toBe("NaN")
    }

    await userEvent.click(screen.getByRole("button", { name: "graph.legend.doc" }))
    await waitFor(() => expect(labels()).toContain("a"))
  })

  it("zooms about the pointer, and the reset button puts it back", async () => {
    useComments.setState({ comments: [comment()] })
    render(<KnowledgeGraph />)
    const svg = screen.getByRole("img", { name: "graph.title" })
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1280, height: 760, right: 1280, bottom: 760 }) as DOMRect
    expect(svg.getAttribute("viewBox")).toBe("0 0 1280 760")

    // Zoom in about the middle: the box shrinks and stays centred on it.
    fireEvent.wheel(svg, { deltaY: -100 })
    await waitFor(() => expect(svg.getAttribute("viewBox")).not.toBe("0 0 1280 760"))
    const [x, y, w, h] = (svg.getAttribute("viewBox") ?? "").trim().split(/\s+/).map(Number)
    expect(w).toBeLessThan(1280)
    // Every number is usable: one NaN in the viewBox blanks the whole graph.
    expect([x, y, w, h].every(Number.isFinite)).toBe(true)
    expect(x + w / 2).toBeCloseTo(640)
    expect(y + h / 2).toBeCloseTo(380)

    await userEvent.click(screen.getByRole("button", { name: "graph.reset" }))
    expect(svg.getAttribute("viewBox")).toBe("0 0 1280 760")
  })

  it("drags the background to pan", async () => {
    useComments.setState({ comments: [comment()] })
    render(<KnowledgeGraph />)
    const svg = screen.getByRole("img", { name: "graph.title" })
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1280, height: 760, right: 1280, bottom: 760 }) as DOMRect
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 640, clientY: 380 })
    fireEvent.pointerMove(svg, { clientX: 540, clientY: 380, buttons: 1 })
    await waitFor(() => expect(svg.getAttribute("viewBox")).toBe("100 0 1280 760"))
  })
})

describe("closing", () => {
  it("closes on Escape, on the scrim, and from the button", async () => {
    render(<KnowledgeGraph />)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(toggleGraph).toHaveBeenCalledWith(false)

    toggleGraph.mockClear()
    await userEvent.click(screen.getByLabelText("settings.close"))
    expect(toggleGraph).toHaveBeenCalledWith(false)

    toggleGraph.mockClear()
    fireEvent.click(document.querySelector(".reado-scrim") as HTMLElement)
    expect(toggleGraph).toHaveBeenCalledWith(false)
  })

  it("a click inside the panel doesn't close it", async () => {
    render(<KnowledgeGraph />)
    await userEvent.click(screen.getByRole("heading", { name: "graph.title" }))
    expect(toggleGraph).not.toHaveBeenCalled()
    // The positive control: the same handler *does* fire on the scrim, so the
    // silence above is a decision, not a missing listener.
    fireEvent.click(document.querySelector(".reado-scrim") as HTMLElement)
    expect(toggleGraph).toHaveBeenCalledWith(false)
  })
})

describe("the legend", () => {
  it("appears only when there is a graph to read", async () => {
    const { unmount } = render(<KnowledgeGraph />)
    expect(screen.queryByText("graph.legend.file")).not.toBeInTheDocument()
    unmount()
    useComments.setState({ comments: [comment()] })
    render(<KnowledgeGraph />)
    expect(await screen.findByText("graph.legend.file")).toBeInTheDocument()
    expect(screen.getByText("graph.legend.link")).toBeInTheDocument()
  })
})
