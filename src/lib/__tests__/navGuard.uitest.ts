// The keys a webview reads as navigation. Getting this wrong either loses the
// whole session (Backspace escaping) or breaks typing (Backspace swallowed).
import { describe, expect, it } from "vitest"
import { guardNavigationKeys, isNavigationKey } from "@/lib/navGuard"

/** A keydown aimed at `target`, dispatched for real so `target` is set. */
function press(target: Element, init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

const mount = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

describe("the navigation-key guard", () => {
  it("cancels a bare Backspace outside a text field", () => {
    guardNavigationKeys(window)
    const e = press(mount("div"), { key: "Backspace" })
    expect(e.defaultPrevented).toBe(true)
  })

  it("leaves Backspace alone wherever text is typed", () => {
    expect(isNavigationKey(press(mount("input"), { key: "Backspace" }))).toBe(false)
    expect(isNavigationKey(press(mount("textarea"), { key: "Backspace" }))).toBe(false)
    // CodeMirror's document: a contenteditable, and the caret can be in a child.
    const editor = mount("div", { contenteditable: "true" })
    const line = document.createElement("span")
    editor.appendChild(line)
    expect(isNavigationKey(press(line, { key: "Backspace" }))).toBe(false)
  })

  it("cancels Alt+Arrow, which is back/forward, but not the arrows themselves", () => {
    const div = mount("div")
    expect(isNavigationKey(press(div, { key: "ArrowLeft", altKey: true }))).toBe(true)
    expect(isNavigationKey(press(div, { key: "ArrowLeft" }))).toBe(false)
    // Alt+← moves by word in a field, and ⌥⌘← is a Reado shortcut.
    expect(isNavigationKey(press(mount("input"), { key: "ArrowLeft", altKey: true }))).toBe(false)
    expect(isNavigationKey(press(div, { key: "ArrowLeft", altKey: true, metaKey: true }))).toBe(
      false,
    )
  })
})
