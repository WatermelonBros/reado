// The settings as text, and the way back in. The property that matters is that
// a hand-edited document can never write nonsense into the store: an unknown key
// or a value of the wrong shape is reported and skipped, never applied.
import { beforeEach, describe, expect, it } from "vitest"
import { applySettingsJson, parseSettingsJson, settingsToJson } from "@/lib/settingsJson"
import { useSettings } from "@/lib/store"

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
