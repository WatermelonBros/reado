// UI test: the reading surface's routing — which viewer each kind of file gets,
// the large-file guard, the markdown source/prose toggle, and the PR-review path
// that reads bytes from a git ref instead of the working tree. Every viewer is
// stubbed; what's asserted is which one the editor chooses, and with what.
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FileContent } from "@/lib/api"

const readFile = vi.fn<(...a: unknown[]) => Promise<FileContent>>()
const gitShowRef = vi.fn(async () => null as string | null)
const gitDiffLines = vi.fn(async () => [] as Array<[number, number]>)
const reanchorFile = vi.fn(async () => [])
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  readFile: (...a: unknown[]) => readFile(...a),
  gitShowRef: (...a: unknown[]) => gitShowRef(...(a as [])),
  gitDiffLines: (...a: unknown[]) => gitDiffLines(...(a as [])),
  reanchorFile: (...a: unknown[]) => reanchorFile(...(a as [])),
}))

type Listener = (e: { payload: { file: string } }) => void
let fileChanged: Listener | null = null
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_e: string, cb: Listener) => {
    fileChanged = cb
    return () => {}
  }),
}))

vi.mock("../editor/CodeView", () => ({
  CodeView: (p: { text: string; pinned: boolean; changedLines: unknown[] }) => (
    <div
      data-testid="code-view"
      data-pinned={String(p.pinned)}
      data-changed={JSON.stringify(p.changedLines)}
    >
      {p.text}
    </div>
  ),
}))
vi.mock("../editor/RenderedMarkdown", () => ({
  RenderedMarkdown: ({ text }: { text: string }) => <div data-testid="prose">{text}</div>,
}))
vi.mock("../DiffView", () => ({
  DiffView: ({ base }: { base?: string }) => <div data-testid="diff">{base ?? "HEAD"}</div>,
}))
vi.mock("../ConflictView", () => ({ ConflictView: () => <div data-testid="conflict" /> }))
vi.mock("../ImageView", () => ({ ImageView: () => <div data-testid="image" /> }))
vi.mock("../PdfView", () => ({ PdfView: () => <div data-testid="pdf" /> }))
vi.mock("../../molecules/Welcome", () => ({ Welcome: () => <div data-testid="welcome" /> }))

import { Editor } from "@/components/organisms/Editor"
import { useComments } from "@/lib/comments"
import { useGuidedReview } from "@/lib/guidedReview"
import { useEditorActions, useProject, useSettings } from "@/lib/store"
import { useTextView } from "@/lib/textView"

const ROOT = "/repo"
const FILE = "/repo/src/a.ts"

beforeEach(() => {
  vi.clearAllMocks()
  fileChanged = null
  readFile.mockResolvedValue({ kind: "text", text: "const x = 1" })
  gitShowRef.mockResolvedValue(null)
  useProject.setState({ root: ROOT, active: FILE, landing: null })
  useComments.setState({ comments: [], archived: [], reanchoringId: null })
  useEditorActions.setState({ diffing: false, resolvingConflict: false, dirty: false })
  useSettings.setState({ largeFileGuardMb: 5, showResolvedComments: false })
  useTextView.setState({ force: new Set() })
  useGuidedReview.setState({ sessions: [], currentId: null })
})

describe("with no file open", () => {
  it("shows the welcome screen", () => {
    useProject.setState({ active: null })
    render(<Editor />)
    expect(screen.getByTestId("welcome")).toBeInTheDocument()
  })
})

describe("choosing a viewer", () => {
  it("shows a loading placeholder until the bytes arrive", () => {
    readFile.mockReturnValue(new Promise(() => {}))
    render(<Editor />)
    expect(screen.getByText("common.loading")).toBeInTheDocument()
  })

  it("renders code in the code view", async () => {
    render(<Editor />)
    expect(await screen.findByTestId("code-view")).toHaveTextContent("const x = 1")
  })

  it("renders an image inline", async () => {
    readFile.mockResolvedValue({ kind: "image", dataUrl: "data:," })
    render(<Editor />)
    expect(await screen.findByTestId("image")).toBeInTheDocument()
  })

  it("renders a PDF in the viewer", async () => {
    readFile.mockResolvedValue({ kind: "pdf", dataUrl: "data:," })
    render(<Editor />)
    expect(await screen.findByTestId("pdf")).toBeInTheDocument()
  })

  it("is honest about a binary rather than showing gibberish", async () => {
    readFile.mockResolvedValue({ kind: "binary", size: 2048 })
    render(<Editor />)
    expect(await screen.findByRole("status")).toHaveTextContent("editor.binary")
  })

  it("surfaces a read error instead of an empty pane", async () => {
    readFile.mockRejectedValue(new Error("EACCES"))
    render(<Editor />)
    expect(await screen.findByRole("alert")).toHaveTextContent("EACCES")
  })
})

describe("the large-file guard", () => {
  it("is a speed bump, not a wall", async () => {
    readFile.mockResolvedValue({ kind: "large", size: 40 * 1024 * 1024 })
    render(<Editor />)
    expect(await screen.findByText("editor.large")).toBeInTheDocument()
    readFile.mockResolvedValue({ kind: "text", text: "the whole thing" })
    await userEvent.click(screen.getByRole("button", { name: "editor.openAnyway" }))
    expect(await screen.findByTestId("code-view")).toBeInTheDocument()
    // Re-read with the guard lifted for this file.
    expect(readFile).toHaveBeenLastCalledWith(ROOT, FILE, false, 0)
  })

  it("passes the configured guard size otherwise", async () => {
    useSettings.setState({ largeFileGuardMb: 2 })
    render(<Editor />)
    await waitFor(() => expect(readFile).toHaveBeenCalledWith(ROOT, FILE, false, 2 * 1024 * 1024))
  })
})

describe("markdown", () => {
  beforeEach(() => {
    useProject.setState({ active: "/repo/README.md" })
    readFile.mockResolvedValue({ kind: "text", text: "# Title" })
  })

  it("renders as prose by default", async () => {
    render(<Editor />)
    expect(await screen.findByTestId("prose")).toHaveTextContent("# Title")
  })

  it("drops to the source view on the toggle", async () => {
    render(<Editor />)
    await userEvent.click(await screen.findByRole("button", { name: /editor\.viewSource/ }))
    expect(await screen.findByTestId("code-view")).toBeInTheDocument()
  })

  it("forces source while a comment is being re-anchored — prose has no lines", async () => {
    useComments.setState({ reanchoringId: "c1" })
    render(<Editor />)
    expect(await screen.findByTestId("code-view")).toBeInTheDocument()
  })

  it("counts the file's comments on the toggle", async () => {
    // Opening re-anchors the file, and the backend's answer replaces the store's
    // comments for it — so the count has to arrive through that, not around it.
    reanchorFile.mockResolvedValue([
      {
        id: "c1",
        state: "open",
        kind: "note",
        type: "note",
        messages: [],
        anchor: { file: "README.md", scope: "file", startLine: 1, endLine: 1 },
      },
    ] as never)
    render(<Editor />)
    expect(await screen.findByText("1")).toBeInTheDocument()
  })

  it("shows the diff instead when the file was opened as its diff", async () => {
    useEditorActions.setState({ pendingView: "diff" })
    render(<Editor />)
    expect(await screen.findByTestId("diff")).toBeInTheDocument()
  })
})

describe("the other whole-pane views", () => {
  it("resolves conflicts before reading the file", async () => {
    // Source Control opens a conflicted file straight into the resolver; the
    // request rides along with the open (a plain flag would be reset on mount).
    useEditorActions.setState({ pendingView: "conflict" })
    render(<Editor />)
    expect(await screen.findByTestId("conflict")).toBeInTheDocument()
  })

  it("shows the diff when asked", async () => {
    useEditorActions.setState({ pendingView: "diff" })
    render(<Editor />)
    expect(await screen.findByTestId("diff")).toHaveTextContent("HEAD")
  })
})

describe("re-anchoring and external edits", () => {
  it("recomputes this file's anchors on open", async () => {
    render(<Editor />)
    await waitFor(() => expect(reanchorFile).toHaveBeenCalledWith(ROOT, "src/a.ts"))
  })

  it("reloads when the file changes on disk", async () => {
    render(<Editor />)
    await screen.findByTestId("code-view")
    readFile.mockResolvedValue({ kind: "text", text: "changed by the agent" })
    fileChanged?.({ payload: { file: "src/a.ts" } })
    expect(await screen.findByText("changed by the agent")).toBeInTheDocument()
  })

  it("won't clobber unsaved edits", async () => {
    render(<Editor />)
    await screen.findByTestId("code-view")
    useEditorActions.setState({ dirty: true })
    readFile.mockClear()
    fileChanged?.({ payload: { file: "src/a.ts" } })
    expect(readFile).not.toHaveBeenCalled()
  })

  it("ignores a change to another file", async () => {
    render(<Editor />)
    await screen.findByTestId("code-view")
    readFile.mockClear()
    fileChanged?.({ payload: { file: "src/other.ts" } })
    expect(readFile).not.toHaveBeenCalled()
  })
})

describe("reviewing a PR in place", () => {
  const startPr = (files: string[]) =>
    useGuidedReview.setState({
      currentId: "s1",
      sessions: [
        {
          id: "s1",
          scope: { kind: "pr", pr: "#7" },
          route: files.map((file) => ({ file })),
          files: [],
        },
      ],
    } as unknown as Parameters<typeof useGuidedReview.setState>[0])

  it("reads the PR's version from the ref, not the working tree", async () => {
    startPr(["src/a.ts"])
    gitShowRef.mockResolvedValue("the PR's version")
    render(<Editor />)
    expect(await screen.findByText("the PR's version")).toBeInTheDocument()
    expect(readFile).not.toHaveBeenCalled()
  })

  it("falls back to the working tree when the path isn't in the ref", async () => {
    startPr(["src/a.ts"])
    gitShowRef.mockResolvedValue(null)
    render(<Editor />)
    expect(await screen.findByText("const x = 1")).toBeInTheDocument()
  })

  it("pins the view and marks the lines the PR changed", async () => {
    startPr(["src/a.ts"])
    gitDiffLines.mockResolvedValue([[3, 7]])
    render(<Editor />)
    expect(await screen.findByTestId("code-view")).toHaveAttribute("data-pinned", "true")
    // The ranges the PR touched reach the view, not just the backend call.
    await waitFor(() =>
      expect(screen.getByTestId("code-view")).toHaveAttribute("data-changed", "[[3,7]]"),
    )
  })

  it("leaves a file outside the PR's scope on the working tree", async () => {
    startPr(["src/elsewhere.ts"])
    render(<Editor />)
    await screen.findByTestId("code-view")
    expect(gitShowRef).not.toHaveBeenCalled()
    expect(screen.getByTestId("code-view")).toHaveAttribute("data-pinned", "false")
  })

  it("skips re-anchoring — the comments already match the PR's lines", async () => {
    startPr(["src/a.ts"])
    gitShowRef.mockResolvedValue("pr bytes")
    render(<Editor />)
    await screen.findByText("pr bytes")
    expect(reanchorFile).not.toHaveBeenCalled()
  })

  it("diffs against the PR's base, not the reviewer's HEAD", async () => {
    startPr(["src/a.ts"])
    gitShowRef.mockResolvedValue("pr bytes")
    useEditorActions.setState({ pendingView: "diff" })
    render(<Editor />)
    // `prRefsFor` derives both refs from the PR number, so the base is exact.
    expect(await screen.findByTestId("diff")).toHaveTextContent("refs/reado/pr-7-base")
  })
})

describe("the split pane", () => {
  it("shows the file it was given, not the globally active one", async () => {
    readFile.mockImplementation(async (_root, path) =>
      path === "/repo/src/split.ts"
        ? { kind: "text", text: "the split file" }
        : { kind: "text", text: "the active file" },
    )
    render(<Editor paneFile="/repo/src/split.ts" />)
    expect(await screen.findByText("the split file")).toBeInTheDocument()
  })

  it("doesn't reset the shared editor state — the primary pane owns it", async () => {
    useEditorActions.setState({ diffing: true })
    render(<Editor paneFile="/repo/src/split.ts" />)
    await screen.findByTestId("diff")
    expect(useEditorActions.getState().diffing).toBe(true)
  })
})
