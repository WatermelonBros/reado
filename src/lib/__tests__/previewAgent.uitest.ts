// The agent's command queue behind the credential gate. The gate is the security
// boundary between the agent and a page holding a password, so it is pinned here
// on its own, below the pane that drives it.
import { beforeEach, describe, expect, it, vi } from "vitest"

const api = {
  previewTakeCmd: vi.fn<(r: string) => Promise<string | null>>(async () => null),
  previewEval: vi.fn<(s: string) => Promise<string>>(async () => ""),
  previewPutResult: vi.fn<(r: string, json: string) => Promise<void>>(async () => {}),
  previewNavigate: vi.fn<(u: string) => Promise<void>>(async () => {}),
  previewCaptureFrame: vi.fn<(...a: number[]) => Promise<string>>(async () => "frame.png"),
  previewPersistState: vi.fn<(...a: string[]) => Promise<void>>(async () => {}),
}
vi.mock("../api", async (orig) => ({
  ...(await orig<typeof import("../api")>()),
  previewTakeCmd: (r: string) => api.previewTakeCmd(r),
  previewEval: (s: string) => api.previewEval(s),
  previewPutResult: (r: string, j: string) => api.previewPutResult(r, j),
  previewNavigate: (u: string) => api.previewNavigate(u),
  previewCaptureFrame: (...a: number[]) => api.previewCaptureFrame(...a),
  previewPersistState: (...a: string[]) => api.previewPersistState(...a),
}))

import { usePreview } from "../preview"
import { mirrorPreviewState, runPendingAgentCommand } from "../previewAgent"
import { GATED_REASON, PAGE_STATE_JS } from "../vault"

const ROOT = "/repo"
const PAGE = "https://app.example.com/login"

/** The page answers the gate probe with this state; any other script returns "ran". */
const page = (state: { hasSecret: boolean; href: string } | null) =>
  api.previewEval.mockImplementation(async (s) =>
    s === PAGE_STATE_JS ? JSON.stringify(state) : "ran",
  )
const queue = (cmd: { id: string; op: string; arg?: string }) =>
  api.previewTakeCmd.mockResolvedValue(JSON.stringify(cmd))
const lastResult = () =>
  JSON.parse(api.previewPutResult.mock.lastCall?.[1] ?? "null") as {
    id: string
    ok: boolean
    result: string
  }
const ranScripts = () =>
  api.previewEval.mock.calls.map(([s]) => s).filter((s) => s !== PAGE_STATE_JS)

let memo: { lastCmdId: string; askedFor: string }
const run = () => runPendingAgentCommand(ROOT, memo, () => undefined)

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  api.previewTakeCmd.mockResolvedValue(null)
  memo = { lastCmdId: "", askedFor: "" }
  usePreview.setState({
    agentAccess: true,
    grants: {},
    accessRequest: null,
    secrets: [],
    url: PAGE,
  })
})

describe("the agent command gate", () => {
  it("refuses a command on a page holding a credential the user has not granted", async () => {
    page({ hasSecret: true, href: PAGE })
    queue({ id: "c1", op: "eval", arg: "document.title" })
    await run()
    expect(ranScripts()).toEqual([])
    expect(lastResult()).toEqual({ id: "c1", ok: false, result: GATED_REASON })
    // …and asks the user, once.
    expect(usePreview.getState().accessRequest).toBe(PAGE)
  })

  it("asks once per origin, not once per page of it", async () => {
    page({ hasSecret: true, href: PAGE })
    queue({ id: "c1", op: "eval", arg: "1" })
    await run()
    usePreview.setState({ accessRequest: null })
    page({ hasSecret: true, href: "https://app.example.com/login/step-2" })
    queue({ id: "c2", op: "eval", arg: "2" })
    await run()
    expect(lastResult().ok).toBe(false)
    expect(usePreview.getState().accessRequest).toBeNull()
  })

  it("runs the command once the user has granted the origin", async () => {
    usePreview.getState().grantPage(PAGE)
    page({ hasSecret: true, href: PAGE })
    queue({ id: "c1", op: "eval", arg: "document.title" })
    await run()
    expect(ranScripts()).toEqual(["document.title"])
    expect(lastResult()).toEqual({ id: "c1", ok: true, result: "ran" })
  })

  it("runs the command on a page with no credential in it", async () => {
    page({ hasSecret: false, href: PAGE })
    queue({ id: "c1", op: "eval", arg: "document.title" })
    await run()
    expect(lastResult()).toEqual({ id: "c1", ok: true, result: "ran" })
  })

  it("runs a command only once, however often it is still queued", async () => {
    page({ hasSecret: false, href: PAGE })
    queue({ id: "c1", op: "eval", arg: "x" })
    await run()
    await run()
    expect(ranScripts()).toEqual(["x"])
    expect(api.previewPutResult).toHaveBeenCalledTimes(1)
  })

  it("takes nothing from the queue while agent access is off", async () => {
    usePreview.setState({ agentAccess: false })
    queue({ id: "c1", op: "eval", arg: "x" })
    await run()
    expect(api.previewTakeCmd).not.toHaveBeenCalled()
    expect(api.previewEval).not.toHaveBeenCalled()
  })

  it("keeps navigation to allowed origins", async () => {
    page({ hasSecret: false, href: PAGE })
    queue({ id: "c1", op: "navigate", arg: "https://evil.example.net/" })
    await run()
    expect(api.previewNavigate).not.toHaveBeenCalled()
    expect(lastResult()).toEqual({ id: "c1", ok: false, result: "origin not allowed" })
  })
})

describe("the agent mirror", () => {
  it("writes the redacted snapshot only when it changed", () => {
    usePreview.setState({ logs: [], net: [], secrets: [] })
    const m = { lastPersisted: "" }
    mirrorPreviewState(ROOT, m)
    mirrorPreviewState(ROOT, m)
    expect(api.previewPersistState).toHaveBeenCalledTimes(1)
    expect(api.previewPersistState).toHaveBeenCalledWith(ROOT, "[]", "[]")
  })

  it("writes nothing while agent access is off", () => {
    usePreview.setState({ agentAccess: false })
    mirrorPreviewState(ROOT, { lastPersisted: "" })
    expect(api.previewPersistState).not.toHaveBeenCalled()
  })
})
