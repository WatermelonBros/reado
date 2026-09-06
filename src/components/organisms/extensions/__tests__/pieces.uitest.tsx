/**
 * The small pieces of the extensions panel: the artwork, the activate control,
 * the reload prompt and the per-project formatter override. Each has one
 * decision worth pinning.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../../lib/api")>()),
  formatterStatus: vi.fn(async () => []),
  linuxPackageManager: vi.fn(async () => null),
  lspInstalled: vi.fn(async () => false),
  lspInstalledAll: vi.fn(async () => []),
  ptyWrite: vi.fn(async () => {}),
  submitToTerminal: vi.fn(),
}))

import { Activate } from "@/components/organisms/extensions/Activate"
import { ExtensionIcon } from "@/components/organisms/extensions/ExtensionRow"
import { FormatterOverride } from "@/components/organisms/extensions/FormatterOverride"
import { ReloadNotice } from "@/components/organisms/extensions/ReloadNotice"
import { forgetServerProbe, runInstall } from "@/components/organisms/extensions/useCurated"
import type { InstalledExt } from "@/lib/api"
import { useFormatterOverrides } from "@/lib/formatters"
import { useMarketplace } from "@/lib/marketplace"
import { useProject, useSettings } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

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
  it("reveals the terminal it runs in", () => {
    // Reusing an existing pane didn't open the panel, so clicking Install with
    // the terminal closed ran the command out of sight and read as a dead button.
    // A pane already exists — the reuse path, which is the one that was broken.
    const id = useTerminals.getState().add()
    useTerminals.setState({ open: false, activeId: id })
    runInstall("brew install shfmt")
    const term = useTerminals.getState()
    expect(term.open).toBe(true)
    expect(term.activeId).toBeTruthy()
  })
})
