/**
 * The small pieces of the extensions panel: the artwork, the activate control,
 * the reload prompt and the per-project formatter override. Each has one
 * decision worth pinning.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock("../../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/api")>()),
  agentInstalled: vi.fn(async () => false),
  formatterStatus: vi.fn(async () => []),
  linuxPackageManager: vi.fn(async () => null),
  lspInstalled: vi.fn(async () => false),
  lspInstalledAll: vi.fn(async () => []),
  ptyKill: vi.fn(async () => {}),
  ptySpawn: vi.fn(async () => {}),
  ptyWrite: vi.fn(async () => {}),
  submitToTerminal: vi.fn(),
}))

import { Activate } from "@/components/organisms/extensions/Activate"
import { EntryRow } from "@/components/organisms/extensions/EntryRow"
import { ExtensionIcon } from "@/components/organisms/extensions/ExtensionRow"
import { vaultEntry } from "@/components/organisms/extensions/entries"
import { FormatterOverride } from "@/components/organisms/extensions/FormatterOverride"
import { ReloadNotice } from "@/components/organisms/extensions/ReloadNotice"
import { forgetServerProbe, runInstall } from "@/components/organisms/extensions/useCurated"
import type { InstalledExt } from "@/lib/api"
import { VAULTS } from "@/lib/extensions"
import { useFormatterOverrides } from "@/lib/formatters"
import { useMarketplace } from "@/lib/marketplace"
import { useProject, useSettings } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"
import { vaultGuide } from "@/lib/vaultGuide"

const ext = (contributes: unknown): InstalledExt => ({
  id: "Pub.pack",
  namespace: "Pub",
  name: "pack",
  version: "1.0.0",
  displayName: "Pack",
  manifest: { contributes: contributes as Record<string, unknown> },
})

beforeEach(() => {
  // The PATH probe is shared across mounts; each test starts from cold.
  forgetServerProbe()
  useSettings.setState({ theme: "reado-dark", iconTheme: null, mode: "manual" })
  useMarketplace.setState({ reloadNeeded: false })
  useFormatterOverrides.setState({ byRoot: {} })
  useProject.setState({ root: "/repo", active: null })
})

describe("ExtensionIcon", () => {
  it("draws a monogram when there is no artwork", () => {
    render(<ExtensionIcon name="Dracula" size={7} />)
    expect(screen.getByText("D")).toBeInTheDocument()
  })

  it("falls back to the monogram when the artwork fails to load", async () => {
    // A 404 used to leave the browser's broken-image glyph, which reads as a
    // broken app rather than a missing file.
    render(<ExtensionIcon icon="https://example.invalid/x.png" name="Dracula" size={12} />)
    fireEvent.error(document.querySelector("img") as HTMLImageElement)
    expect(await screen.findByText("D")).toBeInTheDocument()
  })

  it("contains the artwork rather than cropping it", () => {
    // Publishers ship logos at every aspect ratio; cover cut the wide ones.
    render(<ExtensionIcon icon="data:image/png;base64,AA" name="X" size={7} />)
    expect(document.querySelector("img")?.className).toContain("object-contain")
  })
})

describe("Activate", () => {
  it("offers nothing for an extension with nothing selectable", () => {
    const { container } = render(<Activate ext={ext({ snippets: [{}] })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("turns on the single thing an extension contributes", async () => {
    render(<Activate ext={ext({ themes: [{ label: "Dusk", path: "./t.json" }] })} />)
    await userEvent.click(screen.getByRole("button", { name: "ext.use" }))
    expect(useSettings.getState().theme).toBe("ext:Pub.pack:Dusk")
    // Choosing a theme is a manual choice; the mode has to follow.
    expect(useSettings.getState().mode).toBe("manual")
  })

  it("offers a picker when an extension carries several", () => {
    render(
      <Activate
        ext={ext({
          themes: [
            { label: "Day", path: "./d.json", uiTheme: "vs" },
            { label: "Night", path: "./n.json" },
          ],
        })}
      />,
    )
    expect(screen.getByLabelText("ext.chooseContribution")).toBeInTheDocument()
  })

  it("says it's in use once it is", () => {
    useSettings.setState({ iconTheme: "ext:Pub.pack:0" })
    render(<Activate ext={ext({ iconThemes: [{ path: "./i.json" }] })} />)
    expect(screen.getByText("ext.inUse")).toBeInTheDocument()
  })
})

describe("ReloadNotice", () => {
  it("says nothing until something needs a reload", () => {
    const { container } = render(<ReloadNotice />)
    expect(container).toBeEmptyDOMElement()
  })

  it("offers the reload once something does", () => {
    useMarketplace.setState({ reloadNeeded: true })
    render(<ReloadNotice />)
    expect(screen.getByRole("button", { name: "ext.reload" })).toBeInTheDocument()
  })
})

describe("FormatterOverride", () => {
  const status = {
    biome: { id: "biome", exts: ["ts"], declared: true, installed: true },
    prettier: { id: "prettier", exts: ["ts"], declared: false, installed: false },
  }

  it("stays out of the way with no file open", () => {
    const { container } = render(<FormatterOverride status={status} filter="all" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("stays out of the way under a filter that isn't about formatting", () => {
    useProject.setState({ root: "/repo", active: "/repo/a.ts" })
    const { container } = render(<FormatterOverride status={status} filter="themes" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("stays out of the way for a file type no formatter serves", () => {
    useProject.setState({ root: "/repo", active: "/repo/a.zzz" })
    const { container } = render(<FormatterOverride status={status} filter="all" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("pins a formatter for the open file's type", async () => {
    useProject.setState({ root: "/repo", active: "/repo/a.ts" })
    render(<FormatterOverride status={status} filter="all" />)
    await userEvent.click(screen.getByLabelText("ext.formatterFor"))
    await userEvent.click(await screen.findByText("Prettier"))
    expect(useFormatterOverrides.getState().byRoot["/repo"]?.ts).toBe("prettier")
  })
})

describe("running a curated install", () => {
  it("runs in a shell of its own, leaving the user's terminal alone", async () => {
    // Installing is Reado's job, not an errand handed to the user's terminal:
    // it used to open the panel and type the command into whichever pane was
    // active, hijacking a session someone was working in.
    const { ptySpawn, submitToTerminal } = await import("@/lib/api")
    vi.mocked(ptySpawn).mockClear()
    vi.mocked(submitToTerminal).mockClear()
    const id = useTerminals.getState().add()
    useTerminals.setState({ open: false, activeId: id })

    runInstall("brew install shfmt", { kind: "formatter", id: "shfmt", name: "shfmt" })
    await vi.waitFor(() =>
      expect(submitToTerminal).toHaveBeenCalledWith(
        expect.stringMatching(/^install-/),
        "brew install shfmt",
        expect.anything(),
      ),
    )

    expect(ptySpawn).toHaveBeenCalled()
    // Not the pane the user had open, and the panel stays shut.
    expect(vi.mocked(submitToTerminal).mock.calls.every((c) => c[0] !== id)).toBe(true)
    expect(useTerminals.getState().open).toBe(false)
  })
})

describe("a password manager's CLI in the list", () => {
  const bw = VAULTS.find((v) => v.id === "bw") as (typeof VAULTS)[number]
  const op = VAULTS.find((v) => v.id === "op") as (typeof VAULTS)[number]

  it("is offered with an install command when the CLI isn't there", async () => {
    // The case that matters: someone runs the Bitwarden *app* and has no idea
    // the browser pane needs the CLI.
    const { submitToTerminal } = await import("@/lib/api")
    vi.mocked(submitToTerminal).mockClear()
    render(<EntryRow entry={vaultEntry(bw, false)} linuxPm={null} />)
    expect(screen.getByText("Bitwarden CLI")).toBeInTheDocument()
    await userEvent.click(screen.getByText("ext.install"))
    // Whichever OS the test host reports, the command installs Bitwarden's CLI.
    expect(submitToTerminal).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/bitwarden/i),
      expect.anything(),
    )
  })

  it("states the prerequisite the CLI alone doesn't satisfy", () => {
    // `op` unlocks through the 1Password app, so installing the binary is only
    // half the story — the row says the other half rather than failing later.
    render(<EntryRow entry={vaultEntry(op, false)} linuxPm={null} />)
    expect(screen.getByText(/ext.requires/)).toBeInTheDocument()
  })

  it("carries the vendor's own mark, not a grey monogram", () => {
    const { container } = render(<EntryRow entry={vaultEntry(bw, false)} linuxPm={null} />)
    // Brand colour, drawn inline: no URL to fetch and nothing to 404.
    expect(container.querySelector('svg[fill="#175DDC"]')).toBeTruthy()
  })

  it("reads as installed once it resolves on the PATH", () => {
    render(<EntryRow entry={vaultEntry(bw, true)} linuxPm={null} />)
    expect(screen.getByText("ext.installed")).toBeInTheDocument()
    expect(screen.queryByText("ext.install")).not.toBeInTheDocument()
  })
})

describe("the guide Reado writes for a password manager", () => {
  it("answers the three questions the row can't, in the reader's language", () => {
    for (const id of ["op", "bw"] as const) {
      const en = vaultGuide(id, "en")
      const it = vaultGuide(id, "it")
      // Why not the extension you already use, how to set it up, what happens to
      // the password once Reado has it.
      expect(en).toMatch(/extension/i)
      expect(en).toMatch(/install/i)
      expect(en).toMatch(/redacted/i)
      expect(it).toMatch(/estensione/i)
      expect(it).toMatch(/oscurato/i)
      expect(it).not.toBe(en)
      // An unwritten locale reads the English one rather than nothing at all.
      expect(vaultGuide(id, "de")).toBe(en)
    }
  })

  it("tells each vault's own setup story, then the part they share", () => {
    // The prose wraps, so the phrase is matched across the line break.
    expect(vaultGuide("op", "en")).toMatch(/Integrate with 1Password\s+CLI/)
    expect(vaultGuide("bw", "en")).toMatch(/bw login/)
    // One copy of the shared half, appended to both.
    for (const id of ["op", "bw"] as const)
      expect(vaultGuide(id, "en")).toMatch(/## When it doesn't work/)
  })
})
