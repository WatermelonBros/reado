import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DiffTool } from "@/lib/api"

const api = vi.hoisted(() => ({
  inspect: vi.fn(),
  preview: vi.fn(),
}))
vi.mock("@/lib/api", () => ({
  gitDiffTools: api.inspect,
  gitSpecializedDiff: api.preview,
}))

import { SpecializedDiffPanel } from "@/components/molecules/SpecializedDiffPanel"

const TOOL: DiffTool = {
  id: "approved-command",
  kind: "textconv",
  source: "diff.pdf.textconv",
  command: "pdftotext -layout",
}
const PROPS = { root: "/project", file: "docs/report.pdf", base: "HEAD", head: null }

beforeEach(() => {
  vi.resetAllMocks()
  api.inspect.mockResolvedValue([TOOL])
  api.preview.mockResolvedValue({ text: "converted output", truncated: false })
})

describe("specialized diff consent", () => {
  it("reveals direction controls in the command being approved", async () => {
    api.inspect.mockResolvedValue([{ ...TOOL, command: "pdftotext \u202e-layout" }])
    render(<SpecializedDiffPanel {...PROPS} />)
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.view" }))
    expect(screen.getByText("pdftotext \\u202e-layout")).toBeInTheDocument()
    expect(api.preview).not.toHaveBeenCalled()
  })
  it("does not interpret an external command's empty output as equality", async () => {
    api.inspect.mockResolvedValue([{ ...TOOL, kind: "external" }])
    api.preview.mockResolvedValue({ text: "", truncated: false })
    render(<SpecializedDiffPanel {...PROPS} />)
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.view" }))
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.run" }))
    expect(await screen.findByText("diff.tools.noOutput")).toBeInTheDocument()
    expect(screen.queryByText("diff.noChanges")).not.toBeInTheDocument()
  })
  it("detects a tool without executing it", async () => {
    render(<SpecializedDiffPanel {...PROPS} />)
    await screen.findByRole("button", { name: "diff.tools.view" })
    expect(api.inspect).toHaveBeenCalledWith(PROPS.root, PROPS.file)
    expect(api.preview).not.toHaveBeenCalled()
  })

  it("shows the exact scope and command before execution", async () => {
    render(<SpecializedDiffPanel {...PROPS} />)
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.view" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(PROPS.root)).toBeInTheDocument()
    expect(within(dialog).getByText(PROPS.file)).toBeInTheDocument()
    expect(within(dialog).getByText(TOOL.command)).toBeInTheDocument()
    expect(api.preview).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole("button", { name: "common.cancel" }))
    expect(api.preview).not.toHaveBeenCalled()
  })

  it("runs only the confirmed command and displays plain output", async () => {
    api.preview.mockResolvedValue({ text: "<script>untrusted</script>", truncated: true })
    render(<SpecializedDiffPanel {...PROPS} head="refs/reado/pr-42" />)
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.view" }))
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.run" }))
    expect(api.preview).toHaveBeenCalledExactlyOnceWith(
      PROPS.root,
      PROPS.file,
      "HEAD",
      "refs/reado/pr-42",
      TOOL.id,
    )
    const dialog = await screen.findByRole("dialog", { name: "diff.tools.result" })
    expect(within(dialog).getByText("<script>untrusted</script>")).toBeInTheDocument()
    expect(dialog.querySelector("script")).toBeNull()
    expect(within(dialog).getByText("diff.tools.truncated")).toBeInTheDocument()
    expect(within(dialog).getByText("diff.tools.readOnly")).toBeInTheDocument()
  })

  it("does not retain permission for the next preview", async () => {
    render(<SpecializedDiffPanel {...PROPS} />)
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.view" }))
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.run" }))
    const result = await screen.findByRole("dialog", { name: "diff.tools.result" })
    await userEvent.click(within(result).getByRole("button", { name: "common.close" }))
    await userEvent.click(screen.getByRole("button", { name: "diff.tools.view" }))
    expect(api.preview).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "diff.tools.run" })).toBeInTheDocument()
  })

  it("reloads a changed command without executing it again", async () => {
    api.preview.mockRejectedValue("diff-tool-changed")
    render(<SpecializedDiffPanel {...PROPS} />)
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.view" }))
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.run" }))
    await screen.findByText("diff.tools.changed")
    await waitFor(() => expect(api.inspect).toHaveBeenCalledTimes(2))
    expect(api.preview).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("discards a pending confirmation when the file changes", async () => {
    const { rerender } = render(<SpecializedDiffPanel {...PROPS} />)
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.view" }))
    rerender(<SpecializedDiffPanel {...PROPS} file="different.pdf" />)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(api.preview).not.toHaveBeenCalled()
    expect(api.inspect).toHaveBeenLastCalledWith(PROPS.root, "different.pdf")
  })

  it("ignores a late inspection for the previous project", async () => {
    let resolve: (tools: DiffTool[]) => void = () => {}
    api.inspect.mockReturnValueOnce(
      new Promise<DiffTool[]>((r) => {
        resolve = r
      }),
    )
    const { rerender } = render(<SpecializedDiffPanel {...PROPS} />)
    api.inspect.mockResolvedValue([])
    rerender(<SpecializedDiffPanel {...PROPS} root="/other-project" />)
    await act(async () => resolve([TOOL]))
    expect(screen.queryByRole("button", { name: "diff.tools.view" })).not.toBeInTheDocument()
  })

  it("offers no execution for a file without a configured command", async () => {
    api.inspect.mockResolvedValue([])
    render(<SpecializedDiffPanel {...PROPS} />)
    await waitFor(() => expect(api.inspect).toHaveBeenCalled())
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(api.preview).not.toHaveBeenCalled()
  })

  it("reports an execution error and allows a fresh confirmation", async () => {
    api.preview.mockRejectedValue("diff-tool-timeout")
    render(<SpecializedDiffPanel {...PROPS} />)
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.view" }))
    await userEvent.click(await screen.findByRole("button", { name: "diff.tools.run" }))
    await screen.findByText("diff.tools.timeout")
    expect(api.preview).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "diff.tools.view" })).toBeEnabled()
  })
})
