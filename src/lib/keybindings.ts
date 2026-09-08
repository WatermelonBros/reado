/**
 * Which keystroke runs which command — as data, and overridable.
 *
 * Reado's shortcuts used to be a hand-written `if/else` chain: you got the keys
 * Reado picked, on the keyboard Reado assumed. That is fine until your layout
 * can't produce `⌘\`, or your hands know a different editor. The chain is now a
 * table, and the table can be overwritten one line at a time.
 *
 * Every binding names a command id from `runMenuCommand` — the same registry the
 * menu bar and the command palette dispatch through, so a rebound key and a menu
 * click can never do different things.
 *
 * Written the way VS Code writes them, one per line:
 *
 *     Mod+B = view:sidebar        # rebind
 *     Mod+Alt+P = palette:files   # add
 *     Mod+J =                     # unbind, leaving the key to the editor
 *
 * `Mod` is ⌘ on macOS and Ctrl elsewhere, so one line serves every platform.
 * Text-editing keys inside the editor (⌘Z, Tab, the arrows) belong to CodeMirror
 * and are not in here: they are the editor's own contract with the document.
 */
import type { Chord } from "./chords"
import { alt, ctrl, isMacUA, mod, shift } from "./shortcuts"

/** A keystroke in canonical form: modifiers in a fixed order, then the key. */
export type Combo = string

/**
 * The keystroke as a canonical string.
 *
 * `e.code` for letters and digits, not `e.key`: with Option held macOS composes
 * (⌥Z is "Ω"), and on a non-US layout `e.key` is whatever the layout produces
 * while the physical key is stable. Everything else — punctuation, F-keys,
 * Escape — comes from `e.key`, where the layout *is* the meaning.
 */
export function comboOf(e: KeyboardEvent): Combo {
  const parts: string[] = []
  // "Mod" is the platform's command modifier. A binding written once works on
  // all three, which is the only reason the alias exists.
  if (isMacUA ? e.metaKey : e.ctrlKey) parts.push("Mod")
  if (isMacUA && e.ctrlKey) parts.push("Ctrl")
  if (!isMacUA && e.metaKey) parts.push("Meta")
  if (e.altKey) parts.push("Alt")
  if (e.shiftKey) parts.push("Shift")

  let key = e.key
  const letter = /^Key([A-Z])$/.exec(e.code)
  const digit = /^Digit([0-9])$/.exec(e.code)
  if (letter) key = letter[1]
  else if (digit) key = digit[1]
  else if (e.code === "Backquote") key = "`"
  else if (key.length === 1) key = key.toUpperCase()
  parts.push(key)
  return parts.join("+")
}

/**
 * Canonicalise a hand-written combo so `mod+shift+p` and `Shift+Mod+P` are the
 * same key. Modifier order is fixed; the key itself keeps its case for the
 * named keys (`ArrowLeft`, `Escape`) and is upper-cased when it is one letter.
 */
export function normalizeCombo(text: string): Combo | null {
  const parts = text
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const key = parts.pop() as string
  const mods = new Set(parts.map((m) => m.toLowerCase()))
  const out: string[] = []
  if (mods.has("mod") || mods.has("cmd") || mods.has("cmdorctrl")) out.push("Mod")
  if (mods.has("ctrl") || mods.has("control")) out.push(isMacUA ? "Ctrl" : "Mod")
  if (mods.has("meta")) out.push(isMacUA ? "Mod" : "Meta")
  if (mods.has("alt") || mods.has("option")) out.push("Alt")
  if (mods.has("shift")) out.push("Shift")
  // De-duplicate: on macOS "Ctrl" and "Mod" are different keys, elsewhere
  // "Ctrl" *is* "Mod", and `Ctrl+Mod+F` must not come out with two of them.
  const seen = new Set(out)
  const ordered = ["Mod", "Ctrl", "Meta", "Alt", "Shift"].filter((m) => seen.has(m))
  ordered.push(key.length === 1 ? key.toUpperCase() : key)
  return ordered.join("+")
}

/**
 * The bindings Reado ships.
 *
 * Order is documentation, not behaviour — the lookup is by combo. A command that
 * appears twice has two keys, which is deliberate for the palette (`Mod+Shift+P`
 * is VS Code's, `Mod+K Mod+K` is the chord).
 */
const SHIPPED: Record<string, string> = {
  // Files and editors
  "Mod+S": "save",
  "Mod+Alt+S": "saveAll",
  "Mod+Shift+S": "saveAs",
  "Mod+N": "newFile",
  "Mod+O": "openFile",
  "Mod+W": "closeEditor",
  "Mod+Shift+T": "reopenClosed",
  "Shift+Alt+F": "format",
  "Mod+.": "edit:quickFix",
  // Navigation
  "Mod+P": "palette:files",
  "Mod+Shift+P": "palette:commands",
  "Mod+Shift+F": "palette:search",
  "Mod+Shift+O": "palette:symbols",
  "Mod+T": "palette:wsymbols",
  "Mod+Alt+ArrowLeft": "go:back",
  "Mod+Alt+ArrowRight": "go:forward",
  F8: "go:nextProblem",
  "Shift+F8": "go:prevProblem",
  // Panels and chrome
  "Mod+B": "view:sidebar",
  "Mod+Alt+B": "view:secondarySidebar",
  "Mod+J": "terminal",
  "Mod+\\": "view:splitToggle",
  "Mod+1": "view:focusPane1",
  "Mod+2": "view:focusPane2",
  "Mod+Shift+E": "view:open:files",
  "Mod+Shift+G": "view:open:git",
  "Mod+Shift+C": "view:open:comments",
  "Mod+Shift+V": "preview:toggle",
  "Mod+,": "settings",
  "Ctrl+Shift+`": "terminal:new",
  // View
  F11: "view:fullscreen",
  "Alt+Z": "view:wrap",
  "Mod+=": "zoom:in",
  "Mod+-": "zoom:out",
  "Mod+0": "zoom:reset",
  // Reado's own
  "Mod+Shift+M": "comment:new",
  "Mod+Alt+R": "read:toggle",
  "Mod+Z": "edit:undoFile",
}

// `⌃⌘F` is macOS's full screen; there is no such combo on the other keyboards,
// where Ctrl already *is* Mod.
if (isMacUA) SHIPPED["Mod+Ctrl+F"] = "view:fullscreen"
SHIPPED["Mod+Alt+Z"] = "view:zen"

/**
 * The bindings Reado ships, in the same canonical form the parser produces.
 *
 * Normalised rather than trusted as written: the table is hand-maintained, and
 * a key like `Shift+Alt+F` (modifiers in the wrong order) or `Ctrl+Shift+\`` (Ctrl
 * *is* Mod off macOS) would never match what `comboOf` computes — so the
 * shortcut simply wouldn't work, and the editor would think you had overridden
 * it the moment you opened the dialog.
 */
export const DEFAULT_BINDINGS: Record<Combo, string> = Object.fromEntries(
  Object.entries(SHIPPED).map(([combo, command]) => [normalizeCombo(combo) ?? combo, command]),
)

/** One parsed override. A `command` of "" means "unbind this key". */
export interface Keybinding {
  combo: Combo
  command: string
}

/** Parse the user's `combo = command` lines, skipping anything malformed. */
export function parseKeybindings(lines: string[] | undefined): Keybinding[] {
  const out: Keybinding[] = []
  for (const raw of lines ?? []) {
    const line = raw.split("#")[0].trim()
    if (!line) continue
    // The *last* `=`, not the first: `Mod+= = zoom:in` binds the `=` key, and
    // splitting on the first one parsed the combo as "Mod+" and silently lost
    // the binding. A command id never contains `=`, so the last one is the
    // separator.
    const at = line.lastIndexOf("=")
    if (at < 0) continue
    const combo = normalizeCombo(line.slice(0, at))
    if (!combo) continue
    out.push({ combo, command: line.slice(at + 1).trim() })
  }
  return out
}

/**
 * The bindings in force: the defaults, with the user's lines applied over them.
 *
 * A line with no command removes the binding entirely rather than pointing it at
 * nothing — that is how you give a key back to the editor.
 */
export function resolveBindings(userLines: string[] | undefined): Map<Combo, string> {
  const map = new Map(Object.entries(DEFAULT_BINDINGS))
  for (const { combo, command } of parseKeybindings(userLines)) {
    if (command) map.set(combo, command)
    else map.delete(combo)
  }
  return map
}

/**
 * The bindings in force, rebuilt only when the overrides actually change.
 *
 * The keydown handler is on the window, so it runs for every keystroke in the
 * editor and the terminal, not just for shortcuts. Rebuilding a 37-entry map and
 * re-parsing every override line ten times a second is work nobody asked for;
 * the overrides array is a stable reference between edits, so identity is enough
 * to know when to redo it.
 */
let cachedLines: string[] | undefined
let cachedMap: Map<Combo, string> | undefined
export function activeBindings(userLines: string[] | undefined): Map<Combo, string> {
  if (cachedMap && cachedLines === userLines) return cachedMap
  cachedLines = userLines
  cachedMap = resolveBindings(userLines)
  return cachedMap
}

/**
 * The overrides to store for an edited document.
 *
 * Only the *differences* are kept. Storing the whole resolved list would freeze
 * today's defaults into the user's settings, so a new default in a later release
 * would never reach anyone who had ever opened this dialog.
 *
 * A default the text no longer mentions has been deleted, and is recorded as an
 * explicit unbind — otherwise it would simply come back on the next load.
 */
export function overridesFor(lines: string[]): string[] {
  const parsed = parseKeybindings(lines)
  const out = parsed
    .filter((b) => DEFAULT_BINDINGS[b.combo] !== b.command)
    .map((b) => `${b.combo} = ${b.command}`)
  const mentioned = new Set(parsed.map((b) => b.combo))
  for (const combo of Object.keys(DEFAULT_BINDINGS)) {
    if (!mentioned.has(combo)) out.push(`${combo} = `)
  }
  return out
}

/** Commands named in `lines` that the dispatcher doesn't answer to. */
export function unknownCommands(lines: string[], known: Set<string>): string[] {
  return [...new Set(parseKeybindings(lines).map((b) => b.command))].filter(
    (c) => c && !known.has(c),
  )
}

/** The bindings as the text the user edits — defaults included, so the file
 *  shows what there is to change instead of starting empty. */
export function bindingsToText(userLines: string[] | undefined): string {
  const resolved = resolveBindings(userLines)
  return `${[...resolved.entries()]
    .map(([combo, command]) => `${combo} = ${command}`)
    .sort()
    .join("\n")}\n`
}

/**
 * The `⌘K …` set.
 *
 * Binding data, so it lives with the rest of it: `hooks.ts` dispatches these and
 * the palette reads them to say which keystroke runs a command. Every entry
 * names a command id `runMenuCommand` already answers to, so a chord, a menu
 * click, a palette row and a rebound key all reach the same implementation.
 */
export const CHORDS: Chord[] = [
  // The habit that ⌘K used to serve, kept as a one-hand path.
  { key: "k", mod: true, labelKey: "chord.palette", command: "palette:commands" },
  { key: "s", mod: true, labelKey: "chord.shortcuts", command: "help:shortcuts" },
  { key: ",", labelKey: "chord.settings", command: "settings" },
  { key: "j", labelKey: "chord.settingsJson", command: "settings:json" },
  { key: "z", labelKey: "chord.zen", command: "view:zen" },
  { key: "v", labelKey: "chord.preview", command: "preview:toggle" },
  { key: "0", mod: true, labelKey: "chord.foldAll", command: "view:foldAll" },
  { key: "j", mod: true, labelKey: "chord.unfoldAll", command: "view:unfoldAll" },
  { key: "w", labelKey: "chord.closeAll", command: "tabs:closeAll" },
  { key: "p", labelKey: "chord.copyPath", command: "file:copyPath" },
  { key: "r", labelKey: "chord.reveal", command: "file:reveal" },
  // ⌘K ⌘1…⌘9 fold to a level. Listed once in the dialog, bound nine times.
  ...Array.from({ length: 9 }, (_, i) => ({
    key: String(i + 1),
    mod: true,
    labelKey: "chord.foldLevel" as Chord["labelKey"],
    command: `view:foldLevel:${i + 1}`,
  })),
]

/** How the modifiers are written for a reader, per platform. */
const GLYPH: Record<string, string> = { Mod: mod, Ctrl: ctrl, Alt: alt, Shift: shift, Meta: "Meta" }

/** And the keys whose names are longer than the symbol everyone knows them by. */
const KEY_GLYPH: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Enter: "↵",
  Backspace: "⌫",
  Escape: "Esc",
}

/** A canonical combo as the reader sees it: `Mod+Shift+O` → `⌘⇧O`. */
export function comboLabel(combo: Combo): string {
  const parts = combo.split("+")
  // A trailing "+" is the key itself (`Mod++`), not an empty modifier.
  const key = parts.pop() || "+"
  return `${parts.map((p) => GLYPH[p] ?? p).join("")}${KEY_GLYPH[key] ?? key}`
}

/**
 * Which keystroke runs a command right now, written for a reader.
 *
 * Derived rather than typed out beside each command: a palette row that spells
 * its own shortcut is a second copy of the binding table, and it goes stale
 * silently — the fold commands advertised `⌘⌥⇧[` for a year after they moved to
 * `⌘K ⌘0`, and a rebound key was never reflected at all.
 */
export function shortcutFor(command: string, userLines?: string[]): string | undefined {
  for (const [combo, id] of activeBindings(userLines)) {
    if (id === command) return comboLabel(combo)
  }
  const chord = CHORDS.find((c) => c.command === command)
  if (chord) {
    const second = chord.key.length === 1 ? chord.key.toUpperCase() : chord.key
    return `${mod}K ${chord.mod ? mod : ""}${second}`
  }
  return undefined
}
