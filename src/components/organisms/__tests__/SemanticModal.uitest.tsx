// Semantic search results modal: the two loading messages (index vs agent), the
// error and ready states, the agent badge, keyboard navigation, and jumping to a
// hit. Store actions are stubbed via setState so no real work runs; i18n is
// mocked to keys.

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SemanticModal } from "@/components/organisms/SemanticModal"
import { useSemanticSearch } from "@/lib/semanticSearch"
import { useProject } from "@/lib/store"

const openFile = vi.fn()
const close = vi.fn()
const askAgent = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useProject.setState({ root: "/proj", open: openFile })
  useSemanticSearch.setState({
    open: false,
    query: "",
    status: "loading",
    results: [],
    askingAgent: false,
    askAgent,
    close,
  })
})

describe("SemanticModal", () => {
  it("renders nothing while closed", () => {
    render(<SemanticModal />)
    expect(screen.queryByText("semantic.title")).not.toBeInTheDocument()
  })

  it("says it is searching the index, with nothing to cancel", () => {
    useSemanticSearch.setState({ open: true, query: "where is auth", status: "loading" })
    render(<SemanticModal />)
    expect(screen.getByText(/where is auth/)).toBeInTheDocument()
    expect(screen.getByText("semantic.searching")).toBeInTheDocument()
    // A local query is milliseconds — there is nothing worth a cancel button.
    expect(screen.queryByRole("button", { name: "agentTask.cancel" })).not.toBeInTheDocument()
  })

  it("says it is asking the agent, and offers to cancel that", () => {
    useSemanticSearch.setState({ open: true, query: "q", status: "loading", askingAgent: true })
    render(<SemanticModal />)
    expect(screen.getByText("semantic.asking")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "agentTask.cancel" })).toBeInTheDocument()
  })

  it("escalates to the agent only when asked", async () => {
    useSemanticSearch.setState({ open: true, query: "q", status: "ready", results: [] })
    render(<SemanticModal />)
    await userEvent.click(screen.getByRole("button", { name: "semantic.askAgent" }))
    expect(askAgent).toHaveBeenCalledOnce()
  })

  it("badges an agent answer and names the symbol a hit sits on", () => {
    useSemanticSearch.setState({
      open: true,
      query: "q",
      status: "ready",
      results: [
        { file: "src/a.ts", line: 1, snippet: "x", symbol: "parseConfig", fromAgent: true },
      ],
    })
    render(<SemanticModal />)
    // The reader should be able to tell which kind of answer they have.
    expect(screen.getByText("semantic.byAgent")).toBeInTheDocument()
    expect(screen.getByText("parseConfig")).toBeInTheDocument()
  })

  it("walks the list with the arrow keys and opens with Enter", async () => {
    useSemanticSearch.setState({
      open: true,
      query: "q",
      status: "ready",
      results: [
        { file: "src/a.ts", line: 12, snippet: "a" },
        { file: "src/b.ts", line: 3, snippet: "b" },
      ],
    })
    render(<SemanticModal />)
    const list = screen.getByRole("listbox")
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true")
    await userEvent.type(list, "{ArrowDown}")
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true")
    await userEvent.type(list, "{Enter}")
    expect(openFile).toHaveBeenCalledWith("/proj/src/b.ts", 3)
  })

  it("shows the error message on failure", () => {
    useSemanticSearch.setState({ open: true, query: "q", status: "error" })
    render(<SemanticModal />)
    expect(screen.getByText("semantic.error")).toBeInTheDocument()
  })

  it("lists ranked hits and jumps to one on click", async () => {
    useSemanticSearch.setState({
      open: true,
      query: "q",
      status: "ready",
      results: [
        { file: "src/a.ts", line: 12, snippet: "const a = 1" },
        { file: "src/b.ts", line: 3, snippet: "" },
      ],
    })
    render(<SemanticModal />)
    expect(screen.getByText("src/a.ts")).toBeInTheDocument()
    expect(screen.getByText("const a = 1")).toBeInTheDocument()
    expect(screen.getByText("src/b.ts")).toBeInTheDocument()

    await userEvent.click(screen.getByText("src/a.ts"))
    expect(openFile).toHaveBeenCalledWith("/proj/src/a.ts", 12)
    expect(close).toHaveBeenCalledOnce()
  })
})
