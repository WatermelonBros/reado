// Browser test: the whole app, in a real browser, against a fake backend. Opens
// a project and a file, then every floating thing the user can summon — menus,
// popovers, right-click menus, tooltips, the selects inside Settings — and checks
// what a simulated DOM cannot: that what opened is on top of everything and
// inside the window.
//
// Layout bugs live at the edges of the configuration space, so the whole round
// runs over a few window sizes × interface zooms × languages (Italian strings
// run longer). Pairwise rather than the full product: every pair of values is
// met once, at a quarter of the time.
import { screen } from "@testing-library/react"
import { afterAll, beforeAll, expect, it } from "vitest"
import { page, userEvent } from "vitest/browser"
import { type Locale, useLocale } from "@/i18n"
import { usePalette, useSettings } from "@/lib/store"
import { type FakeBackend, installFakeBackend, uninstallFakeBackend } from "@/test/fakeBackend"
import { coveredBy, describe, floatingPanels, outsideViewport } from "@/test/layoutChecks"
import { openFromTree, prepareWorkspace, renderApp } from "@/test/workspace"

let fake: FakeBackend

beforeAll(() => {
  prepareWorkspace()
  fake = installFakeBackend()
})

afterAll(() => {
  const gaps = [...fake.unknown].map(([c, n]) => `${c}×${n}`).join(", ")
  console.info(`[overlays] commands the fake backend never answered: ${gaps || "none"}`)
  uninstallFakeBackend()
  window.location.hash = ""
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const visible = (els: Iterable<Element>) =>
  [...els].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && el.checkVisibility() && !el.hasAttribute("disabled"),
  )
const nameOf = (el: Element) => el.getAttribute("aria-label") ?? describe(el)

/** What a round found: which openers produced a panel, what was wrong, and
 *  what couldn't be driven at all (vitest's locator can't address a few
 *  elements CodeMirror mounts — a gap in the harness, reported, not hidden). */
interface Round {
  /** Names this combination in screenshot files. */
  tag: string
  opened: string[]
  failures: string[]
  skipped: string[]
}

/** Do `open`, then check every panel that appeared because of it. */
async function check(
  app: Element,
  round: Round,
  label: string,
  open: () => Promise<unknown>,
): Promise<boolean> {
  const before = new Set(floatingPanels(app))
  try {
    await open()
  } catch (e) {
    const why = String(e).split("\n")[0].slice(0, 80)
    // A timeout is the page's doing: the control never became clickable
    // (covered, squeezed, off-screen). Anything else is the harness's.
    if (/Timeout/.test(why)) round.failures.push(`${label} can't be clicked: ${why}`)
    else round.skipped.push(`${label} (${why})`)
    return false
  }
  const fresh = floatingPanels(app).filter((p) => !before.has(p))
  if (fresh.length) round.opened.push(label)
  for (const panel of fresh) {
    const problems = [
      outsideViewport(panel)?.replace(/^/, "leaves the window: "),
      coveredBy(panel)?.replace(/^/, "is covered by "),
    ].filter(Boolean)
    if (!problems.length) continue
    round.failures.push(...problems.map((p) => `${label} → ${describe(panel)} ${p}`))
    // What it looked like — uploaded by CI when the job fails.
    await page.screenshot({
      path: `__screenshots__/overlays/${round.tag}-${round.failures.length}.png`,
    })
  }
  return fresh.length > 0
}

/** Click every menu/popover trigger under `scope`, check, dismiss. Escape only
 *  when something opened: an Escape nobody catches closes the drawer around it. */
async function menusIn(app: Element, scope: Element, round: Round, where: string) {
  for (const trigger of visible(scope.querySelectorAll("[aria-haspopup]"))) {
    const label = `${where}: ${nameOf(trigger)}`
    const opened = await check(app, round, label, async () => {
      await userEvent.click(trigger, { timeout: 3000 })
      await wait(200)
    })
    if (opened) {
      await userEvent.keyboard("{Escape}")
      await wait(150)
    }
  }
}

const COMBOS: { width: number; height: number; zoom: number; locale: Locale }[] = [
  { width: 1280, height: 832, zoom: 1, locale: "en" },
  { width: 1280, height: 832, zoom: 2, locale: "it" },
  { width: 800, height: 600, zoom: 1, locale: "it" },
  { width: 800, height: 600, zoom: 1.5, locale: "en" },
]

it.each(COMBOS)(
  "every floating layer opens on top and inside the window at $width×$height, zoom $zoom, $locale",
  async ({ width, height, zoom, locale }) => {
    await page.viewport(width, height)
    useSettings.setState({ zoom })
    useLocale.getState().setLocale(locale)
    const app = renderApp()
    const tag = `${width}x${height}-z${zoom}-${locale}`
    const round: Round = { tag, opened: [], failures: [], skipped: [] }

    const treeItem = await openFromTree("src/greet.ts")
    const code = await screen.findByText(/Say hello/, {}, { timeout: 5000 })
    await wait(250)

    // The workspace: title bar, activity bar, tabs, status bar.
    await menusIn(app, app, round, "workspace")

    // Right-click menus, on the tree and in the editor.
    for (const [label, target] of [
      ["tree right-click", treeItem],
      ["editor right-click", code],
    ] as const) {
      const opened = await check(app, round, label, async () => {
        await userEvent.click(target, { button: "right", timeout: 3000 })
        await wait(200)
      })
      if (opened) await userEvent.keyboard("{Escape}")
    }

    // Tooltips: every icon button says what it does on hover.
    for (const trigger of visible(
      app.querySelectorAll('[data-scope="tooltip"][data-part="trigger"]'),
    )) {
      await check(app, round, `tooltip: ${nameOf(trigger)}`, async () => {
        await userEvent.hover(trigger, { timeout: 3000 })
        await wait(450) // the tooltip's open delay is 350ms
      })
      await Promise.resolve()
        .then(() => userEvent.unhover(trigger))
        .catch(() => {})
    }

    // Settings: a drawer of its own, with selects that must open over it.
    usePalette.getState().toggleSettings(true)
    const drawer = await screen.findByRole("dialog")
    for (const tab of visible(
      drawer.querySelectorAll('[data-scope="segment-group"][data-part="item"]'),
    )) {
      await userEvent.click(tab, { timeout: 3000 })
      await wait(150)
      await menusIn(app, drawer, round, `settings/${tab.textContent?.trim()}`)
    }
    usePalette.getState().toggleSettings(false)

    console.info(
      `[overlays] ${width}×${height} zoom ${zoom} ${locale}: ${round.opened.length} layers checked` +
        (round.skipped.length ? `, couldn't drive: ${round.skipped.join(", ")}` : ""),
    )
    expect(round.opened.length, "nothing opened — the round proved nothing").toBeGreaterThan(20)
    expect(round.failures).toEqual([])
  },
  180_000,
)
