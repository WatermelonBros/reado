// UI test: the knowledge-base overlay indexes the project's docs/specs/notes,
// filters the index by name, and renders the selected document's markdown.

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DocsView } from "@/components/organisms/DocsView"
import { listFiles, readFile, searchText } from "@/lib/api"
import { useComments } from "@/lib/comments"
import { type SpecGroup, useSpecs } from "@/lib/specs"
import { useProject, useWorkspace } from "@/lib/store"

// The overlay fetches the file list, each document's contents, and full-text
// matches from Tauri on mount/interaction; stub those edges deterministically.
// `convertFileSrc` is Tauri's; stub it so a rewritten image URL is inspectable
// (and keep `invoke`, which the real api module reaches for).
vi.mock("@tauri-apps/api/core", async (orig) => ({
  ...(await orig<typeof import("@tauri-apps/api/core")>()),
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  listFiles: vi.fn(),
  readFile: vi.fn(),
  searchText: vi.fn(),
}))

const ROOT = "/repo"

const SPECS: SpecGroup[] = [
  {
    title: "auth",
    kind: "spec",
    items: [{ label: "spec.md", path: ".openspec/specs/auth/spec.md", isSpec: true }],
  },
]

function seed() {
  vi.mocked(listFiles).mockResolvedValue([
    "README.md",
    "docs/guide.md",
    "src/app.ts",
    ".openspec/specs/auth/spec.md",
  ])
  vi.mocked(searchText).mockResolvedValue([])
  vi.mocked(readFile).mockImplementation((_root: string, path: string) =>
    Promise.resolve({
      kind: "text" as const,
      text: path.endsWith("guide.md")
        ? "# Guide Heading\n\n![local](img/shot.png)"
        : '# Readme Heading\n\n<img src="docs/media/loop.gif" alt="the loop">',
    }),
  )

  useComments.setState({ comments: [], archived: [], loadArchived: vi.fn(), setActive: vi.fn() })
  useSpecs.setState({ groups: SPECS, expanded: new Set() })
  useProject.setState({ root: ROOT, open: vi.fn() })
  useWorkspace.setState({ docsOpen: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

describe("DocsView", () => {
  it("renders the index of docs, specs and notes", async () => {
    render(<DocsView />)

    // Docs (README has no slash → basename; nested docs keep their path label).
    expect(await screen.findByText("README.md")).toBeInTheDocument()
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument()
    // Specs group + its extension-stripped document.
    expect(screen.getByText("auth")).toBeInTheDocument()
    expect(screen.getByText("spec")).toBeInTheDocument()
    // Section headings + the always-present notes entry.
    expect(screen.getByText("kb.docs")).toBeInTheDocument()
    expect(screen.getByText("kb.specs")).toBeInTheDocument()
    expect(screen.getAllByText("kb.notes").length).toBeGreaterThan(0)
  })

  it("typing in the filter narrows the doc index by name", async () => {
    render(<DocsView />)
    expect(await screen.findByText("README.md")).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText("kb.search"), "guide")

    await waitFor(() => expect(screen.queryByText("README.md")).not.toBeInTheDocument())
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument()
  })

  it("selecting a doc renders its markdown content", async () => {
    render(<DocsView />)

    // README is opened by default → its markdown renders.
    expect(await screen.findByText("Readme Heading")).toBeInTheDocument()

    // Switching to another doc renders that document's markdown.
    await userEvent.click(screen.getByText("docs/guide.md"))
    expect(await screen.findByText("Guide Heading")).toBeInTheDocument()
  })

  // A doc's own images are paths on disk: rendered as written they resolve
  // against the webview's origin and come out as broken-image placeholders.
  it("points a doc's images at the file on disk, relative to that doc", async () => {
    render(<DocsView />)

    // README sits at the root — raw HTML <img>, the form a README badge uses.
    expect(await screen.findByAltText("the loop")).toHaveAttribute(
      "src",
      `asset://localhost/${encodeURIComponent("/repo/docs/media/loop.gif")}`,
    )

    // A nested doc resolves against its own directory, not the project root.
    await userEvent.click(screen.getByText("docs/guide.md"))
    expect(await screen.findByAltText("local")).toHaveAttribute(
      "src",
      `asset://localhost/${encodeURIComponent("/repo/docs/img/shot.png")}`,
    )
  })
})
