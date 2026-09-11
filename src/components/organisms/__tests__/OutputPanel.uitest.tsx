// The Output panel, driven the way it is used: pick a channel, narrow by level
// and text, clear it.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { runMenuCommand } = vi.hoisted(() => ({ runMenuCommand: vi.fn() }))
vi.mock("@/lib/menu", () => ({ runMenuCommand }))

import { OutputPanel } from "@/components/organisms/OutputPanel"
import { useOutput } from "@/lib/outputLog"
import { useSettings } from "@/lib/store"

const seed = () => {
  useOutput.setState({ records: [] })
  const add = useOutput.getState().add
  add({ at: 0, level: "error", channel: "lsp:typescript", msg: "Cannot find module" })
  add({ at: 0, level: "debug", channel: "ipc", msg: "read_file", fields: { ms: 3 } })
  add({ at: 0, level: "info", channel: "git", msg: "fetched origin" })
}

beforeEach(() => {
  seed()
  useSettings.setState({ logEnabled: true })
})

describe("OutputPanel", () => {
  it("shows every channel's records, each tagged with where it came from", () => {
    render(<OutputPanel />)
    expect(screen.getByText("Cannot find module")).toBeInTheDocument()
    expect(screen.getByText("read_file")).toBeInTheDocument()
    // A language server's own output is a channel like any other — this is the
    // line that makes "why won't it start" answerable in the app.
    // (twice: the record's own tag, and the channel picker's option)
    expect(screen.getAllByText("lsp:typescript").length).toBeGreaterThan(0)
    // Both pickers are there to narrow it; what they select is `filterRecords`,
    // which has its own tests (an Ark Select cannot be opened in this DOM).
    expect(screen.getByLabelText("output.channel")).toBeInTheDocument()
    expect(screen.getByLabelText("output.level")).toBeInTheDocument()
  })

  it("narrows by text", async () => {
    const user = userEvent.setup()
    render(<OutputPanel />)
    await user.type(screen.getByLabelText("output.filter"), "module")
    expect(screen.queryByText("fetched origin")).not.toBeInTheDocument()
    expect(screen.getByText("Cannot find module")).toBeInTheDocument()
  })

  it("says so when logging is off, instead of looking broken", () => {
    useOutput.setState({ records: [] })
    useSettings.setState({ logEnabled: false })
    render(<OutputPanel />)
    expect(screen.getByText("output.loggingOff")).toBeInTheDocument()
  })

  it("points at the log file, which keeps what the buffer drops", async () => {
    const user = userEvent.setup()
    render(<OutputPanel />)
    await user.click(screen.getByLabelText("output.revealLog"))
    expect(runMenuCommand).toHaveBeenCalledWith("help:revealLog")
  })

  it("clears what it holds", async () => {
    const user = userEvent.setup()
    render(<OutputPanel />)
    await user.click(screen.getByLabelText("output.clear"))
    expect(useOutput.getState().records).toEqual([])
    expect(screen.queryByText("fetched origin")).not.toBeInTheDocument()
  })
})
