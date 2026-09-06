/**
 * Finding a setting by name.
 *
 * Thirty-eight controls across six tabs is past the point where any taxonomy
 * reliably takes you to the one you want. Search navigates rather than filters:
 * a result says where the control lives, and picking it opens that tab — because
 * half of finding a setting is recognising it next to the ones it belongs with.
 */
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getVersion, cliInstalled, installCli, logPath, makeDefaultApp } = vi.hoisted(() => ({
  getVersion: vi.fn(async () => "1.0.0"),
  cliInstalled: vi.fn(async () => true),
  installCli: vi.fn(async () => {}),
  logPath: vi.fn(async () => "/tmp/log"),
  makeDefaultApp: vi.fn(),
}))
vi.mock("@tauri-apps/api/app", () => ({ getVersion }))
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn(async () => {}) }))
vi.mock("../../../lib/api", () => ({ installCli, cliInstalled }))
vi.mock("../../../lib/updater", () => ({ checkForUpdates: vi.fn() }))
vi.mock("../../../lib/logger", () => ({
  logPath,
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
}))
vi.mock("../../../lib/defaults", () => ({ makeDefaultApp }))
vi.mock("../../../lib/tour", () => ({ useTourGuide: { getState: () => ({ run: vi.fn() }) } }))

import { Settings } from "@/components/organisms/Settings"
import { usePalette } from "@/lib/store"

const search = async (text: string) =>
  userEvent.type(screen.getByPlaceholderText("settings.searchPlaceholder"), text)

beforeEach(() => usePalette.setState({ settingsOpen: true }))

describe("settings search", () => {
  it("finds a setting and says where it lives", async () => {
    render(<Settings />)
    await search("settings.lineHeight")
    // The result carries its path, so you learn the shape while you use it.
    const hit = await screen.findByRole("button", { name: /settings\.lineHeight/ })
    expect(hit.textContent).toContain("settings.tabs.editor")
    expect(hit.textContent).toContain("settings.typography")
  })

  it("says so when nothing matches, rather than showing an empty pane", async () => {
    render(<Settings />)
    await search("zzzzzzz")
    expect(await screen.findByText("settings.searchNone")).toBeInTheDocument()
  })

  it("takes you to the tab that holds the result, and clears itself", async () => {
    render(<Settings />)
    await search("settings.formatOnSave")
    await userEvent.click(await screen.findByText("settings.formatOnSave"))
    // Back to the tabs, on the one that owns it, with the query gone.
    expect(screen.getByPlaceholderText("settings.searchPlaceholder")).toHaveValue("")
    expect(await screen.findByText("settings.onSave")).toBeInTheDocument()
  })

  it("hides the tabs while you're searching, so results own the pane", async () => {
    render(<Settings />)
    expect(screen.getByText("settings.theme")).toBeInTheDocument()
    await search("settings.ruler")
    expect(screen.queryByText("settings.themeMode")).not.toBeInTheDocument()
  })
})
