// Signing: the switch that used to be silent about a repository that cannot
// sign. Turning it on writes two git config keys and nothing else happens —
// until the next commit, which git refuses with gpg's own error.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../api", () => ({
  gitAmend: vi.fn(),
  gitCherryPick: vi.fn(),
  gitHeadIsPushed: vi.fn(),
  gitMerge: vi.fn(),
  gitRebase: vi.fn(),
  gitRefs: vi.fn(),
  gitRemoteAdd: vi.fn(),
  gitRemoteRemove: vi.fn(),
  gitRemoteRename: vi.fn(),
  gitRemotes: vi.fn(),
  gitRevert: vi.fn(),
  gitSequencerContinue: vi.fn(),
  gitSetSigning: vi.fn(async () => {}),
  gitSigning: vi.fn(),
  gitSigningCheck: vi.fn(async () => ""),
  gitSubmodules: vi.fn(),
  gitSubmoduleUpdate: vi.fn(),
  gitTagCreate: vi.fn(),
  gitTagDelete: vi.fn(),
  gitTags: vi.fn(),
  gitWorktreeAdd: vi.fn(),
  gitWorktreeRemove: vi.fn(),
  gitWorktrees: vi.fn(),
}))
vi.mock("../notice", () => ({ notify: vi.fn(), notifyError: vi.fn() }))
vi.mock("../prompt", () => ({ prompt: vi.fn() }))
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn() }))

import * as api from "@/lib/api"
import { setSigning } from "@/lib/gitOps"
import { notify } from "@/lib/notice"
import { useProject } from "@/lib/store"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.gitSigningCheck).mockResolvedValue("")
  useProject.setState({ root: "/repo" })
})

describe("setSigning", () => {
  it("says so when the repository has no key to sign with", async () => {
    vi.mocked(api.gitSigningCheck).mockResolvedValue("no-key")
    await setSigning(true)
    // The setting still stands — the user asked for it, and this is advice.
    expect(api.gitSetSigning).toHaveBeenCalledWith("/repo", true)
    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("user.signingkey"),
    )
  })

  it("names gpg when gpg is what is missing", async () => {
    vi.mocked(api.gitSigningCheck).mockResolvedValue("no-gpg")
    await setSigning(true)
    expect(vi.mocked(notify)).toHaveBeenCalledWith("error", expect.stringContaining("gpg"))
  })

  it("confirms plainly when the repository can sign", async () => {
    await setSigning(true)
    expect(vi.mocked(notify)).toHaveBeenCalledWith("info", expect.any(String))
    expect(vi.mocked(notify)).not.toHaveBeenCalledWith("error", expect.any(String))
  })

  it("does not check anything when signing is turned off", async () => {
    // Nothing is about to fail, so there is nothing to warn about.
    await setSigning(false)
    expect(api.gitSigningCheck).not.toHaveBeenCalled()
    expect(vi.mocked(notify)).toHaveBeenCalledWith("info", expect.any(String))
  })

  it("keeps the switch usable when the probe itself fails", async () => {
    vi.mocked(api.gitSigningCheck).mockRejectedValue(new Error("no git"))
    await setSigning(true)
    expect(vi.mocked(notify)).toHaveBeenCalledWith("info", expect.any(String))
  })
})
