// The credential scripts are strings that run inside someone else's page, so they
// are tested the way the page will run them: evaluated against a real DOM.
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  type FillResult,
  fillLoginScript,
  fillNewPasswordScript,
  fillOtpScript,
  PAGE_STATE_JS,
  type PageState,
  pageString,
  redact,
} from "@/lib/vault"

/** Evaluate a built script the way `preview_eval` does, and hand back its result. */
const run = <T>(js: string): T => new Function(`return ${js}`)() as T

beforeEach(() => {
  document.body.innerHTML = ""
  // happy-dom measures everything as 0×0; the scripts skip invisible fields, so
  // give elements a box. Fields explicitly marked hidden get a zero one.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const hidden = this.getAttribute("data-hidden") !== null
    return { width: hidden ? 0 : 100, height: hidden ? 0 : 20 } as DOMRect
  })
})

describe("filling a login", () => {
  it("fills the password and the username field above it", () => {
    document.body.innerHTML = `
      <form><input name="user" type="text"><input name="pass" type="password"></form>`
    const res = run<FillResult>(fillLoginScript("me@example.com", "s3cr3t!"))
    expect(res.ok).toBe(true)
    expect(document.querySelector<HTMLInputElement>("[name=user]")?.value).toBe("me@example.com")
    expect(document.querySelector<HTMLInputElement>("[name=pass]")?.value).toBe("s3cr3t!")
  })

  it("prefers the labelled username over a nearer plain text input", () => {
    document.body.innerHTML = `
      <input name="email" autocomplete="username">
      <input name="search" type="text">
      <input type="password">`
    run(fillLoginScript("u", "p"))
    expect(document.querySelector<HTMLInputElement>("[name=email]")?.value).toBe("u")
    expect(document.querySelector<HTMLInputElement>("[name=search]")?.value).toBe("")
  })

  it("dispatches the events a framework-controlled input listens for", () => {
    document.body.innerHTML = `<input type="text"><input type="password">`
    const seen: string[] = []
    for (const el of document.querySelectorAll("input")) {
      el.addEventListener("input", () => seen.push("input"))
      el.addEventListener("change", () => seen.push("change"))
    }
    run(fillLoginScript("u", "p"))
    expect(seen).toEqual(["input", "change", "input", "change"])
  })

  it("ignores a hidden password field and reports an unreadable form", () => {
    document.body.innerHTML = `<input type="password" data-hidden>`
    expect(run<FillResult>(fillLoginScript("u", "p"))).toEqual({ ok: false, missing: "password" })
  })

  it("says which field it could not find", () => {
    document.body.innerHTML = `<input type="password">`
    expect(run<FillResult>(fillLoginScript("u", "p"))).toEqual({ ok: false, missing: "username" })
  })
})

describe("filling a one-time code", () => {
  it("fills a single field", () => {
    document.body.innerHTML = `<input autocomplete="one-time-code">`
    expect(run<FillResult>(fillOtpScript("123456")).ok).toBe(true)
    expect(document.querySelector("input")?.value).toBe("123456")
  })

  it("spreads the code across split boxes, one character each", () => {
    document.body.innerHTML = Array.from(
      { length: 6 },
      (_, i) => `<input name="otp${i}" maxlength="1">`,
    ).join("")
    expect(run<FillResult>(fillOtpScript("482915")).filled).toBe(6)
    expect([...document.querySelectorAll("input")].map((i) => i.value).join("")).toBe("482915")
  })

  it("reports a page with no code field", () => {
    document.body.innerHTML = `<input type="text" name="unrelated">`
    expect(run<FillResult>(fillOtpScript("123456"))).toEqual({ ok: false, missing: "otp" })
  })
})

describe("a new credential", () => {
  it("fills the password and its confirmation with the same value", () => {
    document.body.innerHTML = `<input type="password"><input type="password">`
    expect(run<FillResult>(fillNewPasswordScript("gen3rated!")).filled).toBe(2)
    expect([...document.querySelectorAll("input")].every((i) => i.value === "gen3rated!")).toBe(
      true,
    )
  })
})

describe("the gate probe", () => {
  it("reports a password field holding a value, with the page it asked about", () => {
    document.body.innerHTML = `<input type="password">`
    expect(run<PageState>(PAGE_STATE_JS).hasSecret).toBe(false)
    document.querySelector("input")!.value = "typed by hand"
    const state = run<PageState>(PAGE_STATE_JS)
    expect(state.hasSecret).toBe(true)
    expect(state.href).toBe(location.href)
  })
})

describe("a value read back from the page", () => {
  it("is trimmed when it is a string, and empty for anything else", () => {
    expect(pageString('" me@example.com "')).toBe("me@example.com")
    expect(pageString("null")).toBe("")
    expect(pageString('{"ok":true}')).toBe("")
    expect(pageString("")).toBe("")
    expect(pageString("not json")).toBe("")
  })
})

describe("redaction", () => {
  it("replaces every occurrence of a registered secret", () => {
    const body = JSON.stringify({ user: "me", password: "s3cr3t!", retry: "s3cr3t!" })
    expect(redact(body, ["s3cr3t!"])).toBe(
      JSON.stringify({ user: "me", password: "«redacted»", retry: "«redacted»" }),
    )
  })

  it("leaves text alone when nothing is registered", () => {
    expect(redact("nothing to hide", [])).toBe("nothing to hide")
  })

  it("does not match on a value too short to be meaningful", () => {
    // A three-character "secret" would eat unrelated text everywhere.
    expect(redact("a cat sat", ["cat"])).toBe("a cat sat")
  })
})
