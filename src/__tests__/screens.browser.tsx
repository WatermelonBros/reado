// Browser test: every screen of the app, at every window size × interface zoom
// the app is used at, checked for what a squeezed layout breaks — text sliced at
// a panel's edge, a page wider than its window, a floating layer off-screen or
// under something. English only, the default theme only: languages have their
// own parity test (i18n/__tests__/locales.test.ts) and themes theirs
// (themes.browser.tsx); neither moves a box.
//
// One app per combination, reused across its screens, so each screen is one
// reported case without paying for a fresh boot.
import { screen } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { page, userEvent } from "vitest/browser"
import { useLocale } from "@/i18n"
import { type Tool, usePalette, useProject, useSettings, useWorkspace } from "@/lib/store"
import { installFakeBackend, ROOT, uninstallFakeBackend } from "@/test/fakeBackend"
import {
  clippedText,
  coveredBy,
  floatingPanels,
  describe as name,
  outsideViewport,
  pageOverflow,
} from "@/test/layoutChecks"
import { mountApp, openFromTree, prepareWorkspace } from "@/test/workspace"

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const WINDOWS = [
  { width: 1280, height: 832 },
  { width: 1024, height: 640 },
  { width: 800, height: 600 },
]
const ZOOMS = [1, 1.5, 2]
const COMBOS = WINDOWS.flatMap((w) => ZOOMS.map((zoom) => ({ ...w, zoom })))

const TOOLS: Tool[] = [
  "files",
  "search",
  "comments",
  "outline",
  "git",
  "orphans",
  "specs",
  "problems",
  "bookmarks",
  "hierarchy",
  "timeline",
  "qa",
  "tours",
  "prereview",
  "guidedreview",
  "coverage",
  "tests",
  "extensions",
  "output",
]
const SETTINGS_TABS = ["Appearance", "Editor", "Interface", "Files", "System"]

interface Screen {
  name: string
  open: () => unknown
  close?: () => unknown
}

const SCREENS: Screen[] = [
  ...TOOLS.map((tool) => ({
    name: `sidebar: ${tool}`,
    // setState, not selectTool: selecting the active tool collapses the sidebar.
    open: () => useWorkspace.setState({ tool }),
  })),
  {
    name: "markdown document",
    open: () => useProject.getState().open(`${ROOT}/README.md`),
    close: () => useProject.getState().open(`${ROOT}/src/greet.ts`),
  },
  {
    name: "palette: commands",
    open: () => usePalette.getState().open("commands"),
    close: () => usePalette.getState().close(),
  },
  {
    name: "palette: files",
    open: () => usePalette.getState().open("files"),
    close: () => usePalette.getState().close(),
  },
  ...SETTINGS_TABS.map((tab) => ({
    name: `settings: ${tab}`,
    open: async () => {
      usePalette.getState().toggleSettings(true)
      const drawer = await screen.findByRole("dialog")
      const item = [...drawer.querySelectorAll('[data-scope="segment-group"][data-part="item"]')]
        .map((el) => el as HTMLElement)
        .find((el) => el.textContent?.trim() === tab)
      if (!item) throw new Error(`no "${tab}" tab in Settings`)
      await userEvent.click(item)
    },
    close: () => usePalette.getState().toggleSettings(false),
  })),
  {
    name: "knowledge graph",
    open: () => useWorkspace.getState().toggleGraph(true),
    close: () => useWorkspace.getState().toggleGraph(false),
  },
  {
    name: "docs",
    open: () => useWorkspace.getState().toggleDocs(true),
    close: () => useWorkspace.getState().toggleDocs(false),
  },
]

/** Everything wrong with what is on screen right now. */
function problems(app: Element): string[] {
  const out: string[] = []
  const over = pageOverflow()
  if (over) out.push(over)
  out.push(...clippedText(document.body))
  for (const panel of floatingPanels(app)) {
    const off = outsideViewport(panel)
    if (off) out.push(`${name(panel)} leaves the window: ${off}`)
    const under = coveredBy(panel)
    if (under) out.push(`${name(panel)} is covered by ${under}`)
  }
  return out
}

beforeAll(() => {
  prepareWorkspace()
  installFakeBackend()
  useLocale.getState().setLocale("en")
})
afterAll(() => uninstallFakeBackend())

describe.each(COMBOS)("$width×$height at zoom $zoom", ({ width, height, zoom }) => {
  let app: HTMLElement
  let unmount: () => void

  beforeAll(async () => {
    await page.viewport(width, height)
    // The previous combination left its last screen's sidebar open; this boot
    // starts from the file tree, like a fresh window.
    useSettings.setState({ zoom })
    useWorkspace.setState({ tool: "files" })
    ;({ app, unmount } = mountApp())
    await openFromTree("src/greet.ts")
    await screen.findByText(/Say hello/, {}, { timeout: 5000 })
  })
  afterAll(() => unmount())

  it.each(SCREENS)("$name", async (s) => {
    await s.open()
    await wait(250)
    try {
      expect(problems(app)).toEqual([])
    } finally {
      await s.close?.()
      await wait(50)
    }
  })
})
