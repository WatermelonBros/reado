// UI test: the Settings drawer's remaining tabs — Interface, Files and System —
// and the system actions (CLI install, default-app, logging, update check,
// replay the tour). The Appearance/Editor tabs and the shell are covered in
// Settings.uitest.tsx. Every Tauri edge is mocked; the settings store is real.
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getVersion,
  installCli,
  cliInstalled,
  checkForUpdates,
  logPath,
  makeDefaultApp,
  revealItemInDir,
  tourRun,
} = vi.hoisted(() => ({
  getVersion: vi.fn(async () => "1.2.3"),
  installCli: vi.fn(async () => "/home/u/.local/bin/reado"),
  cliInstalled: vi.fn(async () => false),
  checkForUpdates: vi.fn(async () => {}),
  logPath: vi.fn(async () => "/tmp/reado.log" as string | null),
  makeDefaultApp: vi.fn(async () => {}),
  revealItemInDir: vi.fn(async () => {}),
  tourRun: vi.fn(),
}))

vi.mock("@tauri-apps/api/app", () => ({ getVersion }))
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir }))
vi.mock("../../../lib/api", () => ({ installCli, cliInstalled }))
vi.mock("../../../lib/updater", () => ({ checkForUpdates }))
vi.mock("../../../lib/logger", () => ({ logPath }))
vi.mock("../../../lib/defaults", () => ({ makeDefaultApp }))
vi.mock("../../../lib/tour", () => ({ useTourGuide: { getState: () => ({ run: tourRun }) } }))

import { Settings } from "@/components/organisms/Settings"
import { usePalette, useSettings } from "@/lib/store"

/** Open the drawer on `tab`. */
async function openTab(tab: string) {
  render(<Settings />)
  await userEvent.click(await screen.findByText(`settings.tabs.${tab}`))
}

beforeEach(() => {
  vi.clearAllMocks()
  cliInstalled.mockResolvedValue(false)
  logPath.mockResolvedValue("/tmp/reado.log")
  usePalette.setState({ settingsOpen: true })
  useSettings.setState({
    zoom: 1,
    colorVision: "normal",
    reduceMotion: "off",
    restoreSession: true,
    trimTrailingWhitespace: false,
    insertFinalNewline: false,
    inlineBlame: false,
    diffGutter: false,
    showResolvedComments: false,
    completionSound: false,
    logEnabled: true,
    logLevel: "info",
  })
})

describe("the Interface tab", () => {
  it("carries the zoom, colour-vision, motion and cursor controls", async () => {
    await openTab("interface")
    for (const key of [
      "settings.zoom",
      "settings.colorVision",
      "settings.reduceMotion",
      "settings.cursorStyle",
      "settings.cursorBlink",
    ]) {
      expect(await screen.findByText(key)).toBeInTheDocument()
    }
  })

  it("applies a colour-vision mode to the store", async () => {
    await openTab("interface")
    // An Ark listbox, not a native <select>: the current label shows on the
    // trigger *and* on its item, so go through the trigger's role to open it.
    const trigger = (await screen.findAllByRole("combobox")).find((el) =>
      el.textContent?.includes("settings.colorVisionNormal"),
    ) as HTMLElement
    await userEvent.click(trigger)
    await userEvent.click(await screen.findByText("settings.colorVisionRedGreen"))
    expect(useSettings.getState().colorVision).toBe("red-green")
  })
})

describe("the Files tab", () => {
  it("carries the session, guard and on-save controls", async () => {
    await openTab("files")
    expect(await screen.findByText("settings.restoreSession")).toBeInTheDocument()
    expect(screen.getByText("settings.largeFileGuard")).toBeInTheDocument()
    expect(screen.getByText("settings.onSave")).toBeInTheDocument()
    expect(screen.getByText("settings.trimTrailingWhitespace")).toBeInTheDocument()
    expect(screen.getByText("settings.insertFinalNewline")).toBeInTheDocument()
  })

  it("turns the save hygiene on", async () => {
    await openTab("files")
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /settings\.trimTrailingWhitespace/ }),
    )
    expect(useSettings.getState().trimTrailingWhitespace).toBe(true)
  })

  it("stops restoring the previous session", async () => {
    await openTab("files")
    await userEvent.click(await screen.findByRole("checkbox", { name: /settings\.restoreSession/ }))
    expect(useSettings.getState().restoreSession).toBe(false)
  })
})

describe("the System tab", () => {
  it("carries the review, notification, default-app, logging and CLI sections", async () => {
    await openTab("system")
    expect(await screen.findByText("settings.review")).toBeInTheDocument()
    expect(screen.getByText("settings.showResolvedComments")).toBeInTheDocument()
    expect(screen.getByText("settings.notifications")).toBeInTheDocument()
    expect(screen.getByText("defaultApp.title")).toBeInTheDocument()
    expect(screen.getByText("settings.logging")).toBeInTheDocument()
    expect(screen.getByText("settings.cli")).toBeInTheDocument()
  })

  it("shows resolved comments inline when asked", async () => {
    await openTab("system")
    await userEvent.click(
      await screen.findByRole("checkbox", { name: /settings\.showResolvedComments/ }),
    )
    expect(useSettings.getState().showResolvedComments).toBe(true)
  })

  it("asks the OS to make Reado the default text editor", async () => {
    await openTab("system")
    await userEvent.click(await screen.findByRole("button", { name: "defaultApp.set" }))
    expect(makeDefaultApp).toHaveBeenCalled()
  })

  it("installs the CLI and reports where it landed", async () => {
    await openTab("system")
    await userEvent.click(await screen.findByRole("button", { name: "settings.cliInstall" }))
    expect(installCli).toHaveBeenCalled()
    expect(await screen.findByText("settings.cliDone")).toBeInTheDocument()
  })

  it("offers a reinstall when it is already there", async () => {
    cliInstalled.mockResolvedValue(true)
    await openTab("system")
    expect(await screen.findByRole("button", { name: "settings.cliReinstall" })).toBeInTheDocument()
    expect(screen.getByText("settings.cliInstalled")).toBeInTheDocument()
  })

  it("surfaces a failed install instead of pretending it worked", async () => {
    installCli.mockRejectedValue(new Error("no write access to ~/.local/bin"))
    await openTab("system")
    await userEvent.click(await screen.findByRole("button", { name: "settings.cliInstall" }))
    expect(await screen.findByText(/no write access/)).toBeInTheDocument()
  })

  it("reveals and copies the log path", async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
    await openTab("system")
    await userEvent.click(await screen.findByRole("button", { name: "settings.logReveal" }))
    expect(revealItemInDir).toHaveBeenCalledWith("/tmp/reado.log")
    await userEvent.click(screen.getByRole("button", { name: "settings.logCopyPath" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("/tmp/reado.log"))
    vi.unstubAllGlobals()
  })

  it("turns logging off", async () => {
    await openTab("system")
    await userEvent.click(await screen.findByRole("checkbox", { name: /settings\.logEnabled/ }))
    expect(useSettings.getState().logEnabled).toBe(false)
  })

  it("shows the app version and checks for updates on demand", async () => {
    await openTab("system")
    expect(await screen.findByText(/1\.2\.3/)).toBeInTheDocument()
    const check = screen.getByRole("button", { name: /settings\.checkUpdates/ })
    await userEvent.click(check)
    expect(checkForUpdates).toHaveBeenCalled()
  })
})
