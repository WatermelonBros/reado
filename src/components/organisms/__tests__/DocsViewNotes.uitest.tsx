// The knowledge base's notes digest — comments as documentation — plus the
// full-text search overlay and the spec index. The document rendering and the
// name filter are covered in DocsView.uitest.tsx.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Comment } from "@/lib/api"

vi.mock("@tauri-apps/api/core", async (orig) => ({
  ...(await orig<typeof import("@tauri-apps/api/core")>()),
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn(async () => undefined),
}))
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  listFiles: vi.fn(),
  readFile: vi.fn(),
  searchText: vi.fn(),
  allowProjectAssets: vi.fn(async () => {}),
}))

import { DocsView } from "@/components/organisms/DocsView"
import { listFiles, readFile, searchText } from "@/lib/api"
import { useComments } from "@/lib/comments"
import { type SpecGroup, useSpecs } from "@/lib/specs"
import { useProject, useWorkspace } from "@/lib/store"

const ROOT = "/repo"
const SPECS: SpecGroup[] = [
  {
    title: "auth",
    kind: "spec",
    items: [{ label: "spec.md", path: ".openspec/specs/auth/spec.md", isSpec: true }],
  },
]

const comment = (over: Partial<Comment> = {}): Comment =>
  ({
    id: "c1",
    type: "note",
    kind: "note",
    state: "open",
    messages: [{ author: "me", body: "a durable observation", createdAt: 0 }],
    anchor: { scope: "range", file: "src/a.ts", startLine: 12, endLine: 12 },
    ...over,
  }) as Comment

const open = vi.fn()
const setActive = vi.fn()
const toggleDocs = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listFiles).mockResolvedValue(["README.md", "docs/guide.md"])
  vi.mocked(searchText).mockResolvedValue([])
  vi.mocked(readFile).mockResolvedValue({ kind: "text", text: "# Heading" })
  useComments.setState({ comments: [], archived: [], loadArchived: vi.fn(), setActive })
  useSpecs.setState({ groups: SPECS, expanded: new Set() })
  useProject.setState({ root: ROOT, open })
  useWorkspace.setState({ docsOpen: true, toggleDocs })
})

/** Open the notes digest from the index. */
async function openNotes() {
  render(<DocsView />)
  await userEvent.click((await screen.findAllByText("kb.notes"))[1])
}

describe("the notes digest", () => {
  it("says so when there are no comments to read", async () => {
    await openNotes()
    expect(await screen.findByText("comments.empty")).toBeInTheDocument()
  })

  it("groups the comments by file, in line order", async () => {
    useComments.setState({
      comments: [
        comment({
          id: "c2",
          anchor: { scope: "range", file: "src/b.ts", startLine: 3, endLine: 3 },
        } as Partial<Comment>),
        comment({
          id: "c3",
          messages: [{ author: "me", body: "second", createdAt: 0 }],
          anchor: { scope: "range", file: "src/a.ts", startLine: 40, endLine: 40 },
        } as Partial<Comment>),
        comment(),
      ],
    })
    await openNotes()
    expect(await screen.findByText("src/a.ts")).toBeInTheDocument()
    expect(screen.getByText("src/b.ts")).toBeInTheDocument()
    const files = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)
    expect(files).toEqual(["src/a.ts", "src/b.ts"])
  })

  it("files a project-scoped comment under its own heading", async () => {
    useComments.setState({
      comments: [
        comment({
          anchor: { scope: "project", file: "", startLine: 0, endLine: 0 },
        } as Partial<Comment>),
      ],
    })
    await openNotes()
    expect(await screen.findByText("(project)")).toBeInTheDocument()
  })

  it("jumps to a comment's line, selecting it", async () => {
    useComments.setState({ comments: [comment()] })
    await openNotes()
    await userEvent.click(await screen.findByText(":12"))
    expect(open).toHaveBeenCalledWith("/repo/src/a.ts", 12)
    expect(setActive).toHaveBeenCalledWith("c1")
    expect(toggleDocs).toHaveBeenCalledWith(false)
  })

  it("won't re-select an archived comment it jumps to", async () => {
    useComments.setState({
      comments: [],
      archived: [comment({ archived: true } as Partial<Comment>)],
    })
    await openNotes()
    await userEvent.click(await screen.findByText(":12"))
    expect(open).toHaveBeenCalled()
    expect(setActive).not.toHaveBeenCalled()
  })

  it("offers no jump for a comment with no line", async () => {
    useComments.setState({
      comments: [
        comment({
          anchor: { scope: "file", file: "src/a.ts", startLine: 0, endLine: 0 },
        } as Partial<Comment>),
      ],
    })
    await openNotes()
    await screen.findByText("src/a.ts")
    expect(screen.queryByText(/^:/)).not.toBeInTheDocument()
  })

  it("narrows the digest to one comment type", async () => {
    useComments.setState({
      comments: [
        comment(),
        comment({
          id: "c2",
          type: "bug",
          messages: [{ author: "me", body: "a real bug", createdAt: 0 }],
        }),
      ],
    })
    await openNotes()
    expect(await screen.findByText("a real bug")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("combobox", { name: "type filter" }))
    await userEvent.click(await screen.findByRole("option", { name: "comment.type.bug" }))
    await waitFor(() => expect(screen.queryByText("a durable observation")).not.toBeInTheDocument())
    expect(screen.getByText("a real bug")).toBeInTheDocument()
  })
})

describe("searching the knowledge base", () => {
  it("keeps only the KB documents that matched the full-text search", async () => {
    vi.mocked(searchText).mockResolvedValue([
      { path: "/repo/docs/guide.md", line: 3, column: 1, text: "the needle" },
      // A hit outside the knowledge base: it must not pull a source file into
      // the index, and it must not count as a match for anything.
      { path: "/repo/src/app.ts", line: 9, column: 1, text: "the needle" },
    ])
    render(<DocsView />)
    fireEvent.change(await screen.findByLabelText("kb.search"), { target: { value: "needle" } })
    await waitFor(() => expect(screen.getByText("docs/guide.md")).toBeInTheDocument())
    expect(screen.queryByText("README.md")).not.toBeInTheDocument()
    expect(screen.queryByText("app.ts")).not.toBeInTheDocument()
  })

  it("degrades to name-filtering when ripgrep is missing, and says so", async () => {
    vi.mocked(searchText).mockRejectedValue(new Error("ripgrep not found"))
    render(<DocsView />)
    fireEvent.change(await screen.findByLabelText("kb.search"), { target: { value: "needle" } })
    expect(await screen.findByText("search.ripgrepMissing")).toBeInTheDocument()
  })

  it("stays quiet about any other search failure", async () => {
    vi.mocked(searchText).mockRejectedValue(new Error("something else"))
    render(<DocsView />)
    fireEvent.change(await screen.findByLabelText("kb.search"), { target: { value: "needle" } })
    await waitFor(() => expect(searchText).toHaveBeenCalled())
    expect(screen.queryByText("search.ripgrepMissing")).not.toBeInTheDocument()
  })
})

describe("the index", () => {
  it("lists the specs under their change, and opens one", async () => {
    render(<DocsView />)
    expect(await screen.findByText("auth")).toBeInTheDocument()
    await userEvent.click(screen.getByText("spec"))
    await waitFor(() =>
      expect(readFile).toHaveBeenCalledWith(ROOT, "/repo/.openspec/specs/auth/spec.md"),
    )
  })

  it("shows an empty document rather than failing when one can't be read", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("gone"))
    render(<DocsView />)
    // The KB auto-selects the first document, which is where the read fails.
    await waitFor(() => expect(readFile).toHaveBeenCalled())
    // The failure is contained to the document pane: no rendered markdown…
    expect(screen.queryByText("Heading")).not.toBeInTheDocument()
    // …while the index it was picked from is still there to pick again.
    expect(screen.getByText("README.md")).toBeInTheDocument()
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument()
  })

  it("closes on the scrim and from the button", async () => {
    render(<DocsView />)
    await userEvent.click(await screen.findByLabelText("settings.close"))
    expect(toggleDocs).toHaveBeenCalledWith(false)

    toggleDocs.mockClear()
    fireEvent.click(document.querySelector(".reado-scrim") as HTMLElement)
    expect(toggleDocs).toHaveBeenCalledWith(false)
  })

  it("a click inside the panel doesn't close it", async () => {
    render(<DocsView />)
    await userEvent.click(await screen.findByRole("heading", { name: "kb.title" }))
    expect(toggleDocs).not.toHaveBeenCalled()
    // The positive control: the same handler *does* fire on the scrim.
    fireEvent.click(document.querySelector(".reado-scrim") as HTMLElement)
    expect(toggleDocs).toHaveBeenCalledWith(false)
  })
})
