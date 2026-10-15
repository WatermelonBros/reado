// The keys a webview reads as navigation. Getting this wrong either loses the
// whole session (Backspace escaping) or breaks typing (Backspace swallowed).
import { describe, expect, it } from "vitest"
import {
  guardLinkClicks,
  guardNavigationKeys,
  isNavigationKey,
  linkDestination,
} from "@/lib/navGuard"

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

describe("the link-click guard", () => {
  const origin = "tauri://localhost/"

  it("sends web and mail links out, keeps app-relative ones and anchors home", () => {
    expect(linkDestination("https://github.com/x/y", origin)).toBe("external")
    expect(linkDestination("mailto:a@b.c", origin)).toBe("external")
    expect(linkDestination("docs/guide.md", origin)).toBe("stay")
    expect(linkDestination("javascript:alert(1)", origin)).toBe("stay")
    expect(linkDestination("#install", origin)).toBe("anchor")
    // On Windows the app itself is served from http://tauri.localhost.
    expect(linkDestination("/x.md", "http://tauri.localhost/")).toBe("stay")
  })

  it("opens a clicked web link outside and keeps the window where it is", () => {
    const opened: string[] = []
    guardLinkClicks(window, (u) => opened.push(u))
    const a = mount("a", { href: "https://github.com/WatermelonBros/reado" })
    const span = document.createElement("span")
    a.appendChild(span)
    const e = new MouseEvent("click", { bubbles: true, cancelable: true })
    span.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(opened).toEqual(["https://github.com/WatermelonBros/reado"])
  })

  it("scrolls to an anchor without touching the hash, which is Reado's route", () => {
    guardLinkClicks(window, () => {})
    const hash = location.hash
    const target = mount("h2", { id: "user-content-install" })
    let scrolled = false
    target.scrollIntoView = () => {
      scrolled = true
    }
    const a = mount("a", { href: "#install" })
    const e = new MouseEvent("click", { bubbles: true, cancelable: true })
    a.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(location.hash).toBe(hash)
    expect(scrolled).toBe(true)
  })

  it("leaves a click some handler already took", () => {
    const opened: string[] = []
    guardLinkClicks(window, (u) => opened.push(u))
    const a = mount("a", { href: "https://example.com" })
    a.addEventListener("click", (e) => e.preventDefault())
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    expect(opened).toEqual([])
  })
})
