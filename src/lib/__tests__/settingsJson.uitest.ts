// The settings as text, and the way back in. The property that matters is that
// a hand-edited document can never write nonsense into the store: an unknown key
// or a value of the wrong shape is reported and skipped, never applied.
import { beforeEach, describe, expect, it } from "vitest"
import { applySettingsJson, parseSettingsJson, settingsToJson } from "@/lib/settingsJson"
import { ENUM_VALUES, NUMBER_RANGES, useSettings } from "@/lib/store"

beforeEach(() => {
  useSettings.getState().reset()
})

describe("settingsToJson", () => {
  it("dumps the settings in a stable key order, so two dumps diff cleanly", () => {
    const keys = Object.keys(JSON.parse(settingsToJson()))
    expect(keys).toEqual([...keys].sort())
  })

  it("leaves out the store's actions and the machine-local fields", () => {
    const dumped = JSON.parse(settingsToJson())
    for (const key of ["set", "reset", "zenMode", "zenRestore", "defaultAppsDismissed"]) {
      expect(dumped, key).not.toHaveProperty(key)
    }
    expect(dumped).toHaveProperty("fontSize")
  })

  it("round-trips: what it prints is what it accepts back", () => {
    useSettings.getState().set({ fontSize: 17, wrap: false, excludeGlobs: ["dist"] })
    const parsed = parseSettingsJson(settingsToJson())
    expect(parsed?.rejected).toEqual([])
    expect(parsed?.patch).toMatchObject({ fontSize: 17, wrap: false, excludeGlobs: ["dist"] })
  })
})

describe("parseSettingsJson", () => {
  it("refuses anything that isn't a JSON object", () => {
    expect(parseSettingsJson("{ not json")).toBeNull()
    expect(parseSettingsJson("[]")).toBeNull()
    expect(parseSettingsJson("null")).toBeNull()
    expect(parseSettingsJson('"a string"')).toBeNull()
  })

  it("reports a key Reado doesn't have instead of writing it", () => {
    const parsed = parseSettingsJson('{"fontSize": 15, "notASetting": 1}')
    expect(parsed?.patch).toEqual({ fontSize: 15 })
    expect(parsed?.rejected).toEqual(["notASetting"])
  })

  it("reports a value of the wrong shape", () => {
    const parsed = parseSettingsJson('{"fontSize": "big", "wrap": 1, "excludeGlobs": "dist"}')
    expect(parsed?.patch).toEqual({})
    expect(parsed?.rejected).toEqual(["fontSize", "wrap", "excludeGlobs"])
  })

  it("accepts a string array for a list setting, and nothing else", () => {
    expect(parseSettingsJson('{"excludeGlobs": ["a", "b"]}')?.rejected).toEqual([])
    expect(parseSettingsJson('{"excludeGlobs": [1, 2]}')?.rejected).toEqual(["excludeGlobs"])
  })

  it("accepts a name or nothing for an optional setting", () => {
    // `iconTheme` ships as null and holds a theme id. Rejecting every
    // null-defaulted field dropped it from its own round-trip.
    expect(parseSettingsJson('{"iconTheme": "Pub.ext"}')?.patch).toEqual({ iconTheme: "Pub.ext" })
    expect(parseSettingsJson('{"iconTheme": null}')?.patch).toEqual({ iconTheme: null })
    expect(parseSettingsJson('{"iconTheme": 3}')?.rejected).toEqual(["iconTheme"])
  })

  it("never takes null for a setting that always has a value", () => {
    expect(parseSettingsJson('{"fontSize": null}')?.rejected).toEqual(["fontSize"])
  })

  it("won't let the machine-local fields back in through the text", () => {
    // They are excluded from the dump; accepting them on the way back would be
    // a hole in the same rule.
    const parsed = parseSettingsJson('{"zenMode": true, "defaultAppsDismissed": true}')
    expect(parsed?.patch).toEqual({})
    expect(parsed?.rejected.sort()).toEqual(["defaultAppsDismissed", "zenMode"])
  })
})

describe("numeric settings out of range", () => {
  // Right type, wrong magnitude used to sail through: `shapeMatches` compared
  // `typeof` and nothing else, so `terminalScrollback: -5` was accepted, stored,
  // and then thrown by xterm inside <Terminal>'s render — which took the whole
  // window to the root error boundary, not just the pane. The limits the UI
  // controls have always shown now live next to the defaults and apply here too.
  it("clamps a negative value instead of accepting it", () => {
    const parsed = parseSettingsJson('{"terminalScrollback": -5}')
    expect(parsed?.rejected).toEqual([])
    expect(parsed?.patch.terminalScrollback).toBe(NUMBER_RANGES.terminalScrollback.min)
  })

  it("clamps every numeric setting, not just the one that crashed", () => {
    const parsed = parseSettingsJson(
      '{"fontSize": -99, "autoSaveDelay": -1, "largeFileGuardMb": -3, "rulerColumn": -10, "zoom": 99}',
    )
    expect(parsed?.patch).toEqual({
      fontSize: NUMBER_RANGES.fontSize.min,
      autoSaveDelay: NUMBER_RANGES.autoSaveDelay.min,
      largeFileGuardMb: NUMBER_RANGES.largeFileGuardMb.min,
      rulerColumn: NUMBER_RANGES.rulerColumn.min,
      zoom: NUMBER_RANGES.zoom.max,
    })
  })

  it("leaves a value inside its range exactly as written", () => {
    const parsed = parseSettingsJson('{"fontSize": 14, "terminalScrollback": 5000}')
    expect(parsed?.patch).toEqual({ fontSize: 14, terminalScrollback: 5000 })
  })
})

describe("a value that is not one of the shipped words", () => {
  // `shapeMatches` compares `typeof`, so a wrong word is a string like any
  // other. `colorVision: "protanopia"` was accepted, stored, and then looked up
  // in a palette table that has no such mode — reading a token off `undefined`
  // took the whole window to the root error boundary, and the value survived a
  // restart because it had been persisted.
  it("is rejected, not stored", () => {
    const parsed = parseSettingsJson('{"colorVision": "protanopia"}')
    expect(parsed?.rejected).toEqual(["colorVision"])
    expect(parsed?.patch).toEqual({})
  })

  it("still accepts the words that are shipped", () => {
    const parsed = parseSettingsJson('{"colorVision": "red-green", "cursorStyle": "block"}')
    expect(parsed?.rejected).toEqual([])
    expect(parsed?.patch).toEqual({ colorVision: "red-green", cursorStyle: "block" })
  })

  it("covers every enum-valued setting, not just the one that crashed", () => {
    const wrong = Object.fromEntries(Object.keys(ENUM_VALUES).map((k) => [k, "nonsense"]))
    const parsed = parseSettingsJson(JSON.stringify(wrong))
    expect(parsed?.patch).toEqual({})
    expect(parsed?.rejected.sort()).toEqual(Object.keys(ENUM_VALUES).sort())
  })
})

describe("applySettingsJson", () => {
  it("writes the accepted values and reports how many", () => {
    const parsed = parseSettingsJson('{"fontSize": 19, "nope": true}')
    expect(parsed && applySettingsJson(parsed)).toBe(1)
    expect(useSettings.getState().fontSize).toBe(19)
  })

  it("writes nothing when every key was rejected", () => {
    const before = useSettings.getState().fontSize
    const parsed = parseSettingsJson('{"fontSize": "big"}')
    expect(parsed && applySettingsJson(parsed)).toBe(0)
    expect(useSettings.getState().fontSize).toBe(before)
  })
})
