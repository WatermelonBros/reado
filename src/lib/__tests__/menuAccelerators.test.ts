// The accelerator table (`lib/appMenu.ts`) and the native macOS menu
// (`src-tauri/src/menu.rs`) describe the same keystrokes in two languages, and
// nothing at runtime would notice them drifting: macOS would show one shortcut
// and Windows another, or a key would be claimed natively with no menu hint to
// explain why. This is the guard that makes them one list.
import { describe, expect, it } from "vitest"
import menuRs from "../../../src-tauri/src/menu.rs?raw"
import { ACCELERATORS, APP_MENUS, acceleratorHint } from "../appMenu"

/** Every `acc!(app, "id", "label", "accel")` in the native menu, id → accelerator. */
function nativeAccelerators(): Record<string, string> {
  const out: Record<string, string> = {}
  const call = /acc!\(\s*app,\s*"([^"]+)",\s*"[^"]*",\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  for (const m of menuRs.matchAll(call)) {
    // Rust source escapes, undone so the comparison is against the value the
    // menu actually gets ("CmdOrCtrl+\\\\" in the file is one backslash).
    out[m[1]] = m[2].replace(/\\\\/g, "\\")
  }
  return out
}

describe("menu accelerators", () => {
  it("say the same thing in the Rust menu and the TypeScript table", () => {
    expect(nativeAccelerators()).toEqual(ACCELERATORS)
  })

  it("only name commands the dispatcher and the rendered menu both know", () => {
    const known = new Set(
      APP_MENUS.flatMap((m) => m.items).flatMap((it) => ("id" in it ? [it.id] : [])),
    )
    // `settings` and `window:new` live in the macOS app menu, which the rendered
    // bar puts under File — everything else must appear in the model verbatim.
    for (const id of Object.keys(ACCELERATORS)) expect(known, id).toContain(id)
  })

  it("never claims a key the app binds to something else elsewhere", () => {
    // A native accelerator is global: it fires the menu command wherever focus
    // is. These combos mean different things in different places (⌘Z undoes an
    // edit in the editor and a file operation outside it; ⌘D adds a cursor in
    // the editor and duplicates a row in the tree), so binding them natively
    // would kill one of the two meanings.
    for (const claimed of ["CmdOrCtrl+Z", "CmdOrCtrl+Shift+Z", "CmdOrCtrl+D"]) {
      expect(Object.values(ACCELERATORS)).not.toContain(claimed)
    }
  })

  it("renders Windows/Linux hints with the platform's own modifier name", () => {
    expect(acceleratorHint("save")).toBe("Ctrl+S")
    expect(acceleratorHint("go:peek")).toBe("Alt+F12")
    expect(acceleratorHint("closeProject")).toBeUndefined()
  })
})
