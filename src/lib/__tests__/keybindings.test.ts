// The keystroke → command table. What matters here is that a keystroke always
// canonicalises to the same string whatever the layout produced, and that an
// override can rebind, add *and* remove — an editor you can only add keys to is
// not one you can make your own.
import { describe, expect, it } from "vitest"
import {
  bindingsToText,
  CHORDS,
  comboOf,
  DEFAULT_BINDINGS,
  normalizeCombo,
  overridesFor,
  parseKeybindings,
  resolveBindings,
  shortcutFor,
  unknownCommands,
} from "@/lib/keybindings"
import { knownCommands } from "@/lib/menu"
import { alt, isMacUA, mod, shift } from "@/lib/shortcuts"

/** A keydown as the browser would deliver it. `code` is what the key *is*. */
const key = (init: Partial<KeyboardEvent> & { key: string }) =>
  ({
    code: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...init,
  }) as KeyboardEvent

/** Whichever physical modifier is "Mod" here — the test has to pass on all
 *  three platforms, which is the property the module exists for. */
const MOD = isMacUA ? { metaKey: true } : { ctrlKey: true }

describe("comboOf", () => {
  it("reads the physical key, not the character the layout produced", () => {
    // ⌥Z composes to "Ω" on macOS; matching on `e.key` lost the binding.
    expect(comboOf(key({ key: "Ω", altKey: true, code: "KeyZ" }))).toBe("Alt+Z")
    expect(comboOf(key({ key: "z", altKey: true, code: "KeyZ" }))).toBe("Alt+Z")
  })

  it("names the command modifier `Mod`, so one binding serves every platform", () => {
    expect(comboOf(key({ key: "p", ...MOD, code: "KeyP" }))).toBe("Mod+P")
  })

  it("puts the modifiers in a fixed order", () => {
    const combo = comboOf(key({ key: "p", ...MOD, altKey: true, shiftKey: true, code: "KeyP" }))
    expect(combo).toBe("Mod+Alt+Shift+P")
  })

  it("keeps punctuation and named keys as the layout means them", () => {
    expect(comboOf(key({ key: ",", ...MOD }))).toBe("Mod+,")
    expect(comboOf(key({ key: "F8" }))).toBe("F8")
    expect(comboOf(key({ key: "ArrowLeft", ...MOD, altKey: true }))).toBe("Mod+Alt+ArrowLeft")
    // Ctrl+Shift+` is Ctrl on every platform — off macOS that *is* Mod.
    expect(comboOf(key({ key: "~", ctrlKey: true, shiftKey: true, code: "Backquote" }))).toBe(
      isMacUA ? "Ctrl+Shift+`" : "Mod+Shift+`",
    )
  })
})

describe("normalizeCombo", () => {
  it("accepts a combo however it was written", () => {
    for (const written of ["mod+shift+p", "Shift+Mod+P", " MOD + shift + p "]) {
      expect(normalizeCombo(written), written).toBe("Mod+Shift+P")
    }
  })

  it("takes the aliases people actually type", () => {
    expect(normalizeCombo("cmd+s")).toBe("Mod+S")
    expect(normalizeCombo("CmdOrCtrl+S")).toBe("Mod+S")
    expect(normalizeCombo("option+z")).toBe("Alt+Z")
  })

  it("keeps a combo whose key is itself `=`", () => {
    // `Mod+= = zoom:in` binds the `=` key; splitting on the first `=` parsed
    // the combo as "Mod+" and lost the binding.
    expect(normalizeCombo("Mod+=")).toBe("Mod+=")
    expect(parseKeybindings(["Mod+= = zoom:in"])).toEqual([{ combo: "Mod+=", command: "zoom:in" }])
    expect(parseKeybindings(["Mod+= ="])).toEqual([{ combo: "Mod+=", command: "" }])
  })

  it("refuses an empty combo instead of inventing one", () => {
    expect(normalizeCombo("")).toBeNull()
    expect(normalizeCombo("  +  ")).toBeNull()
  })
})

describe("parseKeybindings", () => {
  it("reads `combo = command`, and treats an empty command as an unbind", () => {
    expect(parseKeybindings(["Mod+B = view:sidebar", "Mod+J ="])).toEqual([
      { combo: "Mod+B", command: "view:sidebar" },
      { combo: "Mod+J", command: "" },
    ])
  })

  it("ignores comments, blank lines and junk", () => {
    expect(
      parseKeybindings(["# a note", "", "not a binding", "Mod+B = view:sidebar # why"]),
    ).toEqual([{ combo: "Mod+B", command: "view:sidebar" }])
  })

  it("survives a missing list, which is what an older settings blob has", () => {
    expect(parseKeybindings(undefined)).toEqual([])
  })
})

describe("resolveBindings", () => {
  it("ships a working set on its own", () => {
    const map = resolveBindings([])
    expect(map.get("Mod+P")).toBe("palette:files")
    expect(map.get("Mod+S")).toBe("save")
  })

  it("lets an override replace a default", () => {
    expect(resolveBindings(["Mod+P = palette:commands"]).get("Mod+P")).toBe("palette:commands")
  })

  it("lets a key be given back to the editor entirely", () => {
    // Not "bound to nothing" — removed, so the keystroke falls through.
    expect(resolveBindings(["Mod+B ="]).has("Mod+B")).toBe(false)
  })

  it("lets a new key be added without disturbing the rest", () => {
    const map = resolveBindings(["Mod+Alt+P = palette:files"])
    expect(map.get("Mod+Alt+P")).toBe("palette:files")
    expect(map.get("Mod+P")).toBe("palette:files")
  })

  it("normalises the override, so how it was typed doesn't matter", () => {
    expect(resolveBindings(["shift+mod+p = save"]).get("Mod+Shift+P")).toBe("save")
  })
})

describe("the shipped table", () => {
  it("is in the same canonical form the parser produces", () => {
    // A key written `Shift+Alt+F` (modifiers out of order) or `Ctrl+Shift+\``
    // (Ctrl *is* Mod off macOS) would never match what `comboOf` computes: the
    // shortcut just wouldn't work, and opening the dialog would look like you
    // had overridden it.
    for (const combo of Object.keys(DEFAULT_BINDINGS)) {
      expect(normalizeCombo(combo), combo).toBe(combo)
    }
  })

  it("survives being written out and read back", () => {
    // The round trip the dialog does on every save.
    expect(resolveBindings(bindingsToText([]).trim().split("\n"))).toEqual(
      new Map(Object.entries(DEFAULT_BINDINGS)),
    )
  })

  it("only names commands the dispatcher answers to", () => {
    // A default pointing at a typo would silently do nothing forever.
    const known = knownCommands()
    for (const [combo, command] of Object.entries(DEFAULT_BINDINGS)) {
      expect(known, `${combo} → ${command}`).toContain(command)
    }
  })

  it("binds each keystroke to exactly one command", () => {
    const combos = Object.keys(DEFAULT_BINDINGS)
    expect(new Set(combos).size).toBe(combos.length)
  })
})

describe("the ⌘K chords", () => {
  it("only name commands the dispatcher answers to", () => {
    // No menu item names most of these, so nothing else would catch a typo —
    // and `settings:json` and the fold levels were in fact missing from the
    // registry, which made the editor call a working shortcut unknown.
    const known = knownCommands()
    for (const chord of CHORDS) {
      expect(known, `${mod}K ${chord.key} → ${chord.command}`).toContain(chord.command)
    }
  })

  it("resolves each second key to exactly one chord", () => {
    const seen = CHORDS.map((c) => `${c.mod ? "Mod+" : ""}${c.key}`)
    expect(new Set(seen).size).toBe(seen.length)
  })
})

describe("shortcutFor", () => {
  it("reads the single-key bindings", () => {
    expect(shortcutFor("palette:files")).toBe(`${mod}P`)
    expect(shortcutFor("comment:new")).toBe(`${mod}${shift}M`)
  })

  it("falls through to the chords, which no combo covers", () => {
    expect(shortcutFor("view:foldAll")).toBe(`${mod}K ${mod}0`)
    expect(shortcutFor("settings:json")).toBe(`${mod}K J`)
  })

  it("follows an override, and reports nothing once a key is given back", () => {
    expect(shortcutFor("view:sidebar", ["Mod+B = ", "Mod+Alt+9 = view:sidebar"])).toBe(
      `${mod}${alt}9`,
    )
    expect(shortcutFor("zoom:in", ["Mod+= = "])).toBeUndefined()
  })

  it("says nothing at all for a command no key reaches", () => {
    expect(shortcutFor("help:website")).toBeUndefined()
  })
})

describe("overridesFor", () => {
  /** The document the dialog shows, with `edit` applied to it. */
  const edited = (edit: (lines: string[]) => string[]) =>
    overridesFor(edit(bindingsToText([]).trim().split("\n")))

  it("stores nothing when nothing was changed", () => {
    // The dialog shows the defaults; saving without touching them must not
    // freeze today's defaults into the user's settings, or a new default in a
    // later release would never reach anyone who had opened this dialog.
    expect(edited((l) => l)).toEqual([])
  })

  it("stores only the line that changed", () => {
    const out = edited((l) => l.map((x) => (x.startsWith("Mod+P =") ? "Mod+P = save" : x)))
    expect(out).toEqual(["Mod+P = save"])
  })

  it("stores an added binding", () => {
    expect(edited((l) => [...l, "Mod+Alt+P = palette:files"])).toEqual([
      "Mod+Alt+P = palette:files",
    ])
  })

  it("records a deleted line as an explicit unbind, so it stays deleted", () => {
    // Just leaving it out would let the default come straight back on reload.
    const out = edited((l) => l.filter((x) => !x.startsWith("Mod+B =")))
    expect(out).toEqual(["Mod+B = "])
    expect(resolveBindings(out).has("Mod+B")).toBe(false)
  })

  it("round-trips: what it stores rebuilds what was on screen", () => {
    const changed = bindingsToText([])
      .trim()
      .split("\n")
      .map((x) => (x.startsWith("Mod+J =") ? "Mod+J = view:sidebar" : x))
      .filter((x) => !x.startsWith("Mod+B ="))
    const stored = overridesFor(changed)
    expect(bindingsToText(stored).trim().split("\n")).toEqual([...changed].sort())
  })
})

describe("unknownCommands", () => {
  const known = new Set(["save", "view:sidebar"])

  it("names a command the dispatcher doesn't answer to", () => {
    expect(unknownCommands(["Mod+S = saev"], known)).toEqual(["saev"])
  })

  it("says nothing about a valid line, or an unbind", () => {
    expect(unknownCommands(["Mod+S = save", "Mod+B ="], known)).toEqual([])
  })

  it("reports each unknown command once, however many keys point at it", () => {
    expect(unknownCommands(["Mod+S = nope", "Mod+D = nope"], known)).toEqual(["nope"])
  })
})

describe("bindingsToText", () => {
  it("shows what is in force, defaults included, so there is something to edit", () => {
    const text = bindingsToText([])
    expect(text).toContain("Mod+P = palette:files")
    expect(text.trim().split("\n")).toHaveLength(Object.keys(DEFAULT_BINDINGS).length)
  })

  it("round-trips through the parser", () => {
    const text = bindingsToText(["Mod+P = palette:commands"])
    expect(resolveBindings(text.split("\n")).get("Mod+P")).toBe("palette:commands")
  })
})
