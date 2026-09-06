/**
 * Colour themes contributed by installed extensions.
 *
 * A published theme is a JSON file with two halves: `colors`, several hundred
 * keys naming parts of another editor's interface, and `tokenColors`, TextMate
 * scope selectors carrying the syntax palette. Reado's own palette is a much
 * smaller set of semantic tokens (`docs/research/color-theory-for-reading.md`),
 * so importing a theme is a mapping, not a copy.
 *
 * The mapping is deliberately partial and always completed: whatever the theme
 * doesn't specify is inherited from the built-in Reado theme of the same
 * polarity, which stays on `<html data-theme>` underneath. That is what stops an
 * imported theme from producing a half-painted interface — the failure mode of
 * every naive theme import.
 */
import { extRead, type InstalledExt } from "./api"
import { type Oklch, oklchToHex, rgbToOklch } from "./colorLiterals"
import { createLogger } from "./logger"
import { enabledExtensions, useMarketplace } from "./marketplace"
import type { BuiltinTheme, ExtThemeName } from "./store"

const log = createLogger("extThemes")

/** A theme contributed by an extension. The id is stable across restarts so a
 *  chosen theme survives one, and namespaced so two extensions can't collide. */
export interface ExtTheme {
  id: `ext:${string}`
  label: string
  extId: string
  namespace: string
  name: string
  path: string
  /** From the theme's declared `uiTheme`; refined by the file's own `type`. */
  dark: boolean
}

interface ThemeContribution {
  id?: string
  label?: string
  uiTheme?: string
  path?: string
}

/** The themes an installed extension contributes. */
export function themesOf(ext: InstalledExt): ExtTheme[] {
  const list = (ext.manifest.contributes?.themes as ThemeContribution[] | undefined) ?? []
  return list
    .filter((t) => typeof t.path === "string")
    .map((t, i) => ({
      id: `ext:${ext.id}:${t.id ?? t.label ?? i}` as const,
      label: t.label ?? t.id ?? ext.displayName,
      extId: ext.id,
      namespace: ext.namespace,
      name: ext.name,
      path: t.path as string,
      dark: t.uiTheme !== "vs" && t.uiTheme !== "hc-light",
    }))
}

/**
 * Parse the JSON-with-comments these files are actually written in.
 *
 * The format is nominally JSON; in practice published themes carry `//`
 * comments, block comments and trailing commas, and a strict parse rejects a
 * large share of the registry. Strings are stepped over character by character
 * so a `//` inside a colour name or a URL survives.
 */
export function parseJsonc(text: string): unknown {
  let out = ""
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      const start = i++
      while (i < text.length && (text[i] !== '"' || text[i - 1] === "\\")) i++
      out += text.slice(start, ++i)
      continue
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++
      continue
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      i += 2
      continue
    }
    out += c
    i++
  }
  // Trailing commas, once the comments that could hide them are gone.
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"))
}

interface ThemeFile {
  type?: "dark" | "light" | "hcDark" | "hcLight"
  include?: string
  colors?: Record<string, string>
  tokenColors?: Array<{
    scope?: string | string[]
    settings?: { foreground?: string; fontStyle?: string }
  }>
}

/**
 * Resolve `rel` against the directory of `base`, both extension-relative.
 *
 * Collapses `a/b/../c` → `a/c`. The backend refuses anything that still escapes
 * the extension, so this only has to produce the path the manifest meant.
 */
export function resolveSibling(base: string, rel: string): string {
  const parts: string[] = []
  for (const part of `${base.replace(/[^/]*$/, "")}${rel}`.split("/")) {
    if (part === "..") parts.pop()
    else if (part && part !== ".") parts.push(part)
  }
  return parts.join("/")
}

/** Read a theme file, following `include` chains (themes are commonly published
 *  as a base plus thin variants). Bounded, because the chain is untrusted. */
async function readThemeFile(theme: ExtTheme, path: string, depth = 0): Promise<ThemeFile> {
  const file = parseJsonc(await extRead(theme.namespace, theme.name, path)) as ThemeFile
  if (!file.include || depth >= 4) return file
  const base = await readThemeFile(theme, resolveSibling(path, file.include), depth + 1)
  return {
    ...base,
    ...file,
    colors: { ...base.colors, ...file.colors },
    tokenColors: [...(base.tokenColors ?? []), ...(file.tokenColors ?? [])],
  }
}

/**
 * What a theme is authoritative about.
 *
 * The first version of this map copied a colour for every Reado token that had
 * a plausible-looking counterpart, and that is exactly how an imported theme
 * ends up unreadable. `descriptionForeground` and `editorLineNumber.foreground`
 * are *recessive* colours in the editor they were authored for — a line number
 * is meant to disappear. Reado spends `--text-muted` and `--text-faint` on
 * labels, hints and secondary copy that have to be read. Copying one onto the
 * other imports the name and loses the role.
 *
 * So a theme supplies its identity — the canvas, the ink, the accent, the
 * syntax palette, the signal colours — and everything that carries legibility
 * is derived below, to Reado's own standard, in the theme's own hue.
 */
const IDENTITY_MAP: Record<string, string[]> = {
  bg: ["editor.background"],
  text: ["editor.foreground", "foreground"],
  accent: ["textLink.foreground", "button.background", "focusBorder"],
  "accent-contrast": ["button.foreground"],
  selection: ["editor.selectionBackground"],
  landing: ["editor.lineHighlightBackground", "editor.rangeHighlightBackground"],
  "diag-error": ["editorError.foreground", "errorForeground"],
  "diag-warn": ["editorWarning.foreground"],
  "diag-info": ["editorInfo.foreground"],
  "diff-add": ["gitDecoration.addedResourceForeground"],
  "diff-add-soft": ["diffEditor.insertedTextBackground", "diffEditor.insertedLineBackground"],
  "diff-del": ["gitDecoration.deletedResourceForeground"],
  "diff-del-soft": ["diffEditor.removedTextBackground", "diffEditor.removedLineBackground"],
}

/**
 * Reado's syntax roles, expressed as the TextMate scopes that carry them.
 *
 * Ordered most specific first: `keyword.control` is control flow, a bare
 * `keyword` is everything else, and a theme that only styles the general case
 * still colours both.
 */
const SYNTAX_MAP: Record<string, string[]> = {
  "syn-control": ["keyword.control", "keyword.control.flow", "keyword"],
  "syn-keyword": ["keyword", "storage.type", "storage"],
  "syn-definition": ["entity.name.function", "entity.name.type", "entity.name", "entity"],
  "syn-string": ["string.quoted", "string"],
  "syn-number": ["constant.numeric", "constant"],
  "syn-comment": ["comment.line", "comment"],
  "syn-punctuation": ["punctuation", "meta.brace"],
}

// ---------------------------------------------------------------------------
// Deriving the interface from the theme's canvas
// ---------------------------------------------------------------------------

/**
 * How far each surface and line sits from the canvas, in OKLCH lightness.
 *
 * Measured off Reado's own dark theme, where `--bg` is L 0.20 and `--bg-elevated`
 * is L 0.24. Perceptual lightness is what makes "one step lighter" mean the same
 * thing on a navy background as on a warm grey one, which is why the steps are
 * absolute rather than a percentage of the canvas.
 */
const SURFACE_STEPS: Record<string, number> = {
  "bg-elevated": 0.04,
  "bg-overlay": 0.07,
  border: 0.12,
  "border-strong": 0.22,
}

/**
 * The contrast each text token must clear against the canvas.
 *
 * Reado's own dark theme measures 12.2:1 for `--text` and 4.97:1 for
 * `--text-faint` (see `tokens.css`). An imported theme is held to the same
 * numbers rather than to whatever its author used for line numbers.
 */
const TEXT_TARGETS: Record<string, number> = {
  "text-muted": 7,
  "text-faint": 4.6,
}

/** Bridge to the shared colour module, which speaks 0..255 channels. */
const toRgb = ([r, g, b]: [number, number, number]) => ({
  r: r * 255,
  g: g * 255,
  b: b * 255,
  a: 1,
})

/** WCAG relative luminance of an OKLCH colour. */
const luminanceOf = (c: Oklch) => {
  const rgb = parseHex(oklchToHex(c))
  return rgb ? luminance(rgb) : 0
}

const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * The lightness at which `hue`/`chroma` clears `target` contrast against `bg`.
 *
 * Binary search rather than an inverse formula: the sRGB gamma curve and the
 * OKLCH→sRGB clip make the closed form messy, and twenty halvings land well
 * inside a rounding error.
 */
function lightnessForContrast(target: number, bg: Oklch, chroma: number, hue: number): number {
  const bgL = luminanceOf(bg)
  // Move away from the canvas: lighter text on a dark theme, darker on a light.
  const dark = bgL < 0.18
  let lo = dark ? bg.l : 0
  let hi = dark ? 1 : bg.l
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const hit = ratio(luminanceOf({ l: mid, c: chroma, h: hue }), bgL) >= target
    // Keep the least extreme lightness that still clears the bar, so derived
    // text stays part of the theme instead of jumping to white or black.
    // Keep the half that still contains the answer: on a dark canvas the text
    // gets lighter as contrast rises, on a light one it gets darker.
    if (dark === hit) hi = mid
    else lo = mid
  }
  return dark ? hi : lo
}

/**
 * Everything the interface needs that a theme should not be trusted to supply.
 *
 * Surfaces and lines step away from the canvas by a fixed perceptual amount and
 * keep its hue, so a blue-grey theme gets blue-grey panels and an input never
 * lands on the same colour as the page behind it — the failure the direct
 * mapping produced with themes whose sidebar and editor share one background.
 * Secondary text is solved for a contrast ratio instead of copied.
 */
function deriveInterface(canvas: Oklch, ink: Oklch, dark: boolean): Record<string, string> {
  const out: Record<string, string> = {}
  const away = dark ? 1 : -1
  for (const [token, step] of Object.entries(SURFACE_STEPS)) {
    out[token] = oklchToHex({
      l: Math.min(1, Math.max(0, canvas.l + step * away)),
      // A touch more chroma as surfaces lift, the way Reado's own themes do.
      c: canvas.c * (1 + step),
      h: canvas.h,
    })
  }
  for (const [token, target] of Object.entries(TEXT_TARGETS)) {
    // Secondary text keeps the ink's hue, so it reads as the same voice quieter
    // rather than as a different colour.
    const chroma = Math.min(ink.c, 0.04)
    out[token] = oklchToHex({
      l: lightnessForContrast(target, canvas, chroma, ink.h),
      c: chroma,
      h: ink.h,
    })
  }
  return out
}

/** Push a colour away from the canvas until it clears `target`, keeping its
 *  hue and chroma. Used on the theme's own ink and accent: a theme is allowed
 *  its palette, not to make Reado unreadable. */
function ensureContrast(color: string, canvas: Oklch, target: number): string {
  const rgb = parseHex(color)
  if (!rgb) return color
  const c = rgbToOklch(toRgb(rgb))
  if (ratio(luminance(rgb), luminanceOf(canvas)) >= target) return color
  return oklchToHex({ l: lightnessForContrast(target, canvas, c.c, c.h), c: c.c, h: c.h })
}

/** The foreground a theme gives `scope`, by longest matching selector. */
function foregroundFor(file: ThemeFile, scope: string): string | undefined {
  let best: { length: number; color: string } | undefined
  for (const rule of file.tokenColors ?? []) {
    const fg = rule.settings?.foreground
    if (!fg) continue
    const scopes = Array.isArray(rule.scope) ? rule.scope : (rule.scope ?? "").split(",")
    for (const raw of scopes) {
      const selector = raw.trim().split(/\s+/).pop() ?? ""
      // `keyword` matches `keyword.control`, but never the other way round.
      if (!selector || !(scope === selector || scope.startsWith(`${selector}.`))) continue
      if (!best || selector.length > best.length) best = { length: selector.length, color: fg }
    }
  }
  return best?.color
}

/** A theme resolved into the CSS custom properties Reado's interface reads. */
export interface ResolvedTheme {
  /** Built-in theme left underneath, supplying everything unmapped. */
  base: BuiltinTheme
  tokens: Record<string, string>
  /** The theme's own scope rules, kept for grammar-highlighted files where real
   *  TextMate scopes exist to match them against. */
  tokenColors: ThemeFile["tokenColors"]
}

/**
 * Load a contributed theme and resolve it into Reado's tokens.
 *
 * The theme brings its identity — canvas, ink, accent, syntax, signal colours.
 * The interface mechanics that carry legibility are derived from that canvas to
 * Reado's own standard, and the theme's own ink and accent are pushed to clear
 * the AA floor if they don't already. A theme is allowed its palette; it is not
 * allowed to make the interface unreadable.
 */
export async function loadExtTheme(theme: ExtTheme): Promise<ResolvedTheme> {
  const file = await readThemeFile(theme, theme.path)
  const dark = file.type ? file.type === "dark" || file.type === "hcDark" : theme.dark
  const colors = file.colors ?? {}
  const tokens: Record<string, string> = {}

  for (const [token, sources] of Object.entries(IDENTITY_MAP)) {
    const value = sources.map((k) => colors[k]).find(Boolean)
    if (value) tokens[token] = value
  }
  for (const [token, scopes] of Object.entries(SYNTAX_MAP)) {
    const value = scopes.map((s) => foregroundFor(file, s)).find(Boolean)
    if (value) tokens[token] = value
  }

  // Without a canvas there is nothing to derive from, so the built-in base
  // supplies the whole interface and the theme contributes only its palette.
  const canvasRgb = parseHex(tokens.bg ?? "")
  if (canvasRgb) {
    const canvas = rgbToOklch(toRgb(canvasRgb))
    const inkRgb = parseHex(tokens.text ?? "")
    // A theme that names no foreground still gets coherent text: the ink takes
    // the canvas's hue and whatever lightness clears the reading floor.
    const ink = inkRgb ? rgbToOklch(toRgb(inkRgb)) : { l: 0, c: canvas.c, h: canvas.h }
    Object.assign(tokens, deriveInterface(canvas, ink, dark))

    tokens.text = ensureContrast(tokens.text ?? oklchToHex(ink), canvas, AA_CONTRAST)
    // An accent lands on buttons and links, which are text too.
    if (tokens.accent) tokens.accent = ensureContrast(tokens.accent, canvas, 3)
    // Syntax has to clear the floor as well — a comment nobody can read is the
    // most common way an imported dark theme fails.
    for (const token of Object.keys(SYNTAX_MAP)) {
      if (tokens[token]) tokens[token] = ensureContrast(tokens[token], canvas, AA_CONTRAST)
    }
  }

  return {
    base: dark ? "reado-dark" : "reado-light",
    tokens,
    tokenColors: file.tokenColors ?? [],
  }
}

/**
 * The colour the active contributed theme gives a token's scopes, if any.
 *
 * A TextMate token carries its scopes outermost-first; the innermost scope that
 * any rule matches wins, and among rules matching the same scope the longest
 * selector does. Null when no contributed theme is active, in which case the
 * caller falls back to Reado's own semantic palette.
 */
export function themeForegroundForScopes(scopes: readonly string[]): string | undefined {
  const rules = activeTokenColors
  if (!rules?.length) return undefined
  for (let i = scopes.length - 1; i >= 0; i--) {
    const found = foregroundFor({ tokenColors: rules }, scopes[i])
    if (found) return found
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

/** `#rgb`, `#rrggbb` and `#rrggbbaa` → sRGB channels in 0..1. Alpha is dropped:
 *  a translucent colour is composited by the browser, and the check wants the
 *  author's intent. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3,8})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("")
  if (h.length < 6) return null
  const n = Number.parseInt(h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [number, number, number]
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** WCAG relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG contrast ratio between two hex colours, or null if either is unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const [ca, cb] = [parseHex(a), parseHex(b)]
  if (!ca || !cb) return null
  const [la, lb] = [luminance(ca), luminance(cb)]
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG AA for body text. Reado holds its own themes to this; a contributed
 *  theme is measured against it and labelled, never blocked — it is the user's
 *  editor, and they are allowed to want the theme anyway. */
export const AA_CONTRAST = 4.5

export interface ThemeVerdict {
  /** Text-on-background ratio, or null when the theme didn't specify both. */
  ratio: number | null
  passes: boolean
}

export function judge(resolved: ResolvedTheme): ThemeVerdict {
  const ratio = contrastRatio(resolved.tokens.text ?? "", resolved.tokens.bg ?? "")
  // Unspecified means inherited from the built-in base, which already passes.
  return { ratio, passes: ratio === null || ratio >= AA_CONTRAST }
}

/**
 * Every theme contributed by the extensions that are switched on.
 *
 * The filter is applied here rather than asked of the caller: half the call
 * sites were passing the raw installed list, so the pickers offered themes from
 * disabled extensions and choosing one fell back to a built-in with a notice
 * about an extension sitting right there in the list.
 */
export function allExtThemes(installed: InstalledExt[]): ExtTheme[] {
  return enabledExtensions(installed).flatMap((ext) => {
    try {
      return themesOf(ext)
    } catch (e) {
      log.warn("could not read an extension's themes", { id: ext.id, error: String(e) })
      return []
    }
  })
}

// ---------------------------------------------------------------------------
// Applying a contributed theme
// ---------------------------------------------------------------------------

/** Reado's built-in themes stay on `<html data-theme>`; a contributed theme is
 *  the base of matching polarity plus these inline overrides. Tracked so a
 *  switch clears the previous theme instead of layering onto it. */
let applied: string[] = []

/** The active contributed theme's scope rules, for grammar-highlighted files. */
let activeTokenColors: ThemeFile["tokenColors"] = []

/** Resolved themes, keyed by id. A theme is a handful of files to read and parse;
 *  re-doing that on every "Trust Reado" tick would be pointless work. */
const cache = new Map<string, ResolvedTheme>()

export function clearExtTheme(): void {
  const root = document.documentElement
  for (const token of applied) root.style.removeProperty(`--${token}`)
  applied = []
  activeTokenColors = []
  // The scope→colour answers were the active theme's; they go with it.
  void import("./extGrammars").then((m) => m.forgetScopeColors())
}

/**
 * Apply a contributed theme, or report that it is gone.
 *
 * Returns the built-in fallback when the extension providing the theme has been
 * uninstalled or disabled — the user keeps a working editor of the polarity they
 * chose rather than a half-painted one.
 */
export async function applyExtTheme(id: ExtThemeName): Promise<BuiltinTheme | null> {
  const theme = allExtThemes(useMarketplace.getState().installed).find((t) => t.id === id)
  if (!theme) return null

  let resolved = cache.get(id)
  if (!resolved) {
    try {
      resolved = await loadExtTheme(theme)
      cache.set(id, resolved)
    } catch (e) {
      log.warn("could not load a contributed theme", { id, error: String(e) })
      return null
    }
  }

  const root = document.documentElement
  clearExtTheme()
  root.dataset.theme = resolved.base
  for (const [token, value] of Object.entries(resolved.tokens)) {
    root.style.setProperty(`--${token}`, value)
  }
  applied = Object.keys(resolved.tokens)
  activeTokenColors = resolved.tokenColors
  return resolved.base
}

/** Drop a theme's cached mapping — called when its extension is installed or
 *  removed, since the id survives a version bump. */
export function forgetExtTheme(extId: string): void {
  for (const key of [...cache.keys()]) if (key.startsWith(`ext:${extId}:`)) cache.delete(key)
}

/** A contributed theme, resolved and measured — what the theme picker needs to
 *  show a real preview and an honest contrast verdict for each one. */
export interface ExtThemePreview {
  theme: ExtTheme
  resolved: ResolvedTheme
  verdict: ThemeVerdict
}

/** Load and judge every contributed theme. Failures are dropped rather than
 *  thrown: one unreadable theme must not empty the picker. */
export async function loadExtThemePreviews(installed: InstalledExt[]): Promise<ExtThemePreview[]> {
  const loaded = await Promise.all(
    allExtThemes(installed).map(async (theme) => {
      try {
        const resolved = cache.get(theme.id) ?? (await loadExtTheme(theme))
        cache.set(theme.id, resolved)
        return { theme, resolved, verdict: judge(resolved) }
      } catch (e) {
        log.warn("could not preview a contributed theme", { id: theme.id, error: String(e) })
        return null
      }
    }),
  )
  return loaded.filter((p): p is ExtThemePreview => p !== null)
}
