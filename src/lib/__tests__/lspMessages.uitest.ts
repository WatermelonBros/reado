// A language server's `window/showMessage` becomes one Reado notice per server
// and text, however often the server repeats it.
import { expect, it, vi } from "vitest"

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock("../notice", () => ({ notify: vi.fn() }))

const { showServerMessage } = await import("@/lib/lsp/connection")
const { notify } = await import("@/lib/notice")

it("says a repeated message once, keeps errors as errors, and drops log lines", () => {
  const fail = { type: 1, message: "Failed to discover workspace." }
  for (let i = 0; i < 7; i++) showServerMessage("rust", fail)
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledWith("error", "rust: Failed to discover workspace.")

  // Another server saying the same thing is another message.
  showServerMessage("toml", fail)
  expect(notify).toHaveBeenCalledTimes(2)

  showServerMessage("rust", { type: 4, message: "indexing" })
  expect(notify).toHaveBeenCalledTimes(2)
})
