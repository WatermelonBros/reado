// Every control in the Settings drawer, exercised: each checkbox, each select,
// each numeric field and each free-text field must write its value to the store.
// A control wired to the wrong key looks fine and silently does nothing, so the
// sweep clicks them all rather than sampling.
import { fireEvent, render, screen } from "@testing-library/react"
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
import { usePalette, useProject, useSettings } from "@/lib/store"

const TABS = ["appearance", "editor", "interface", "files", "system"] as const

/** Everything the settings store holds, minus its own actions. */
const snapshot = () => {
  const s = useSettings.getState() as unknown as Record<string, unknown>
  return Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== "function"))
}

/** Which settings differ from `before` now. A control wired to nothing — or to
 *  the wrong key — leaves this empty, which is the whole point of the sweeps. */
const changedKeys = (before: Record<string, unknown>) => {
  const now = snapshot()
  return Object.keys(now).filter((k) => !Object.is(now[k], before[k]))
}

/** Open the drawer on `tab`. */
async function openTab(tab: (typeof TABS)[number]) {
  render(<Settings />)
  await userEvent.click(await screen.findByText(`settings.tabs.${tab}`))
}

beforeEach(() => {
  vi.clearAllMocks()
  usePalette.setState({ settingsOpen: true })
  // Without a repo the git-gated toggles (inlineBlame, diffGutter) don't render
  // at all, and the sweep below skips them without saying so.
  useProject.setState({ git: { isRepo: true } as never })
  // A known baseline: the sweeps below compare the store before and after each
  // control, so a value left behind by another test would read as "wrote nothing".
  useSettings.setState({ mode: "manual", theme: "reado-light", codeFont: "" })
})

describe("every checkbox writes to the store", () => {
  // "appearance" is swatches and selects — it has no checkbox to sweep.
  for (const tab of TABS.filter((t) => t !== "appearance")) {
    it(`${tab}: each toggle flips exactly one setting`, async () => {
      await openTab(tab)
      const boxes = screen.queryAllByRole("checkbox")
      // Without this the loop body silently never runs and the test is green
      // for a tab that lost every toggle.
      expect(boxes.length, `${tab} has no toggles`).toBeGreaterThan(0)
      const written: string[] = []
      for (const box of boxes) {
        const before = snapshot()
        await userEvent.click(box)
        const changed = changedKeys(before)
        const name = box.getAttribute("aria-label") ?? box.parentElement?.textContent ?? "?"
        expect(changed, `the toggle "${name}" wrote nothing`).toHaveLength(1)
        expect(typeof snapshot()[changed[0]]).toBe("boolean")
        written.push(changed[0])
      }
      // Each toggle must own its key. Without this, two controls wired to the
      // same setting each still "flip exactly one".
      expect(new Set(written).size, `${tab} has two toggles on one setting`).toBe(boxes.length)
    })
  }
})

describe("the selects write to the store", () => {
  /** Open the select whose current value reads `showing`, then pick `option`. */
  async function pick(showing: string, option: string) {
    // Ark's own trigger — the hidden native <select> it renders alongside also
    // has role combobox, and its text contains every option label.
    const trigger = Array.from(
      document.querySelectorAll<HTMLElement>('[data-scope="select"][data-part="trigger"]'),
    ).find((el) => el.textContent?.includes(showing))
    expect(trigger, `no select currently showing "${showing}"`).toBeTruthy()
    await userEvent.click(trigger as HTMLElement)
    await userEvent.click(await screen.findByRole("option", { name: option }))
  }

  // The theme-mode select is deliberately not driven here: this widget won't
  // open under happy-dom (pointer and keyboard both leave it closed), so any
  // test of it would assert the harness rather than the setting. What the mode
  // *does* — split the theme picker into a light and a dark one — is covered by
  // "the theme picker" below, which drives the store directly.

  it("editor: the code font, and the reading controls", async () => {
    await openTab("editor")
    await pick("settings.codeFontDefault", "Fira Code")
    expect(useSettings.getState().codeFont).toContain("Fira Code")
    await pick("settings.lineNumbersOn", "settings.lineNumbersRelative")
    expect(useSettings.getState().lineNumbers).toBe("relative")
  })

  it("interface: reduced motion", async () => {
    useSettings.setState({ reduceMotion: "system" })
    await openTab("interface")
    await pick("settings.reduceMotionSystem", "settings.reduceMotionOn")
    expect(useSettings.getState().reduceMotion).toBe("on")
  })

  it("system: the log level", async () => {
    useSettings.setState({ logEnabled: true, logLevel: "info" })
    await openTab("system")
    await pick("Info", "Debug")
    expect(useSettings.getState().logLevel).toBe("debug")
  })
})

describe("the numeric fields clamp what they commit", () => {
  it("holds the font size inside its range", async () => {
    await openTab("editor")
    const field = await screen.findByLabelText("settings.fontSize")
    fireEvent.change(field, { target: { value: "999" } })
    fireEvent.blur(field)
    expect(useSettings.getState().fontSize).toBeLessThanOrEqual(40)

    fireEvent.change(field, { target: { value: "1" } })
    fireEvent.blur(field)
    expect(useSettings.getState().fontSize).toBeGreaterThanOrEqual(8)
  })

  it("clamps an emptied field to the bottom of its range, never below", async () => {
    // A number input drops anything unparseable, so clearing it commits the
    // minimum rather than a NaN that would break the editor's layout.
    useSettings.setState({ lineHeight: 1.5 })
    await openTab("editor")
    const field = await screen.findByLabelText("settings.lineHeight")
    fireEvent.change(field, { target: { value: "" } })
    fireEvent.blur(field)
    expect(useSettings.getState().lineHeight).toBe(1.2)
  })

  it("Enter leaves the field, which is what commits it", async () => {
    // The field commits on blur, and Enter commits by blurring itself. Only the
    // blur half is directly observable here — happy-dom's `blur()` doesn't reach
    // React's onBlur — so this pins the half that is: Enter gives up focus, and
    // the test above pins that losing focus writes the value.
    await openTab("editor")
    const field = await screen.findByLabelText("settings.fontSize")
    field.focus()
    expect(document.activeElement).toBe(field)
    fireEvent.keyDown(field, { key: "Enter" })
    expect(document.activeElement).not.toBe(field)
  })

  it("holds the large-file guard inside its range", async () => {
    await openTab("files")
    const field = await screen.findByLabelText(/settings\.largeFileGuard/)
    fireEvent.change(field, { target: { value: "12" } })
    fireEvent.blur(field)
    expect(useSettings.getState().largeFileGuardMb).toBe(12)

    // Past both ends it clamps rather than accepting a guard that would either
    // open a gigabyte file or block every file.
    fireEvent.change(field, { target: { value: "999" } })
    fireEvent.blur(field)
    expect(useSettings.getState().largeFileGuardMb).toBe(Number(field.getAttribute("max")))
    fireEvent.change(field, { target: { value: "-5" } })
    fireEvent.blur(field)
    expect(useSettings.getState().largeFileGuardMb).toBe(Number(field.getAttribute("min")))
  })
})

describe("the free-text fields commit on blur", () => {
  it("takes a font family by name, and clears back to the preset", async () => {
    await openTab("editor")
    const field = await screen.findByLabelText(/settings\.codeFontCustom/)
    fireEvent.change(field, { target: { value: "  Comic Code  " } })
    fireEvent.blur(field)
    expect(useSettings.getState().codeFont).toContain("Comic Code")

    fireEvent.change(field, { target: { value: "" } })
    fireEvent.blur(field)
    expect(useSettings.getState().codeFont).toBe("")
  })

  it("takes the exclude globs one per line, dropping the blanks", async () => {
    await openTab("files")
    const field = await screen.findByLabelText(/settings\.exclude/)
    fireEvent.change(field, { target: { value: "**/dist/**\n\n  **/*.log  \n" } })
    fireEvent.blur(field)
    expect(useSettings.getState().excludeGlobs).toEqual(["**/dist/**", "**/*.log"])
  })
})

describe("the theme picker", () => {
  it("picks a theme in manual mode", async () => {
    await openTab("appearance")
    const swatch = document.querySelector('button[data-theme="reado-dark"]') as HTMLElement
    await userEvent.click(swatch)
    expect(useSettings.getState().theme).toBe("reado-dark")
  })

  it("picks a light and a dark theme separately once the mode is automatic", async () => {
    useSettings.setState({ mode: "system" })
    await openTab("appearance")
    // Pick the *non-default* swatch in each grid — the defaults are
    // reado-light/reado-dark, which would pass with no click at all.
    const light = document.querySelector('button[data-theme="reado-sepia"]') as HTMLElement
    const dark = document.querySelector('button[data-theme="reado-high-contrast"]') as HTMLElement
    await userEvent.click(light)
    await userEvent.click(dark)
    expect(useSettings.getState().lightTheme).toBe("reado-sepia")
    expect(useSettings.getState().darkTheme).toBe("reado-high-contrast")
  })
})

describe("the tour", () => {
  it("can be replayed from Settings", async () => {
    await openTab("system")
    await userEvent.click(await screen.findByRole("button", { name: "tour.replay" }))
    expect(tourRun).toHaveBeenCalled()
  })
})
