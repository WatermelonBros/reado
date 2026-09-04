// Git blame in the editor: the compact annotation text, and the two extensions
// that place it (the full column, and the quiet cursor-line one).
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BlameLine } from "@/lib/api"
import { blameGutter, inlineBlame, inlineBlameText } from "@/lib/blameGutter"

const NOW = new Date("2026-03-12T12:00:00Z")
const daysAgo = (n: number) => Math.floor(NOW.getTime() / 1000 - n * 86400)

const line = (over: Partial<BlameLine> = {}): BlameLine => ({
  line: 1,
  hash: "a1b2c3d",
  author: "Ada Lovelace",
  time: daysAgo(3),
  summary: "fix the gutter",
  ...over,
})

let view: EditorView | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  view?.destroy()
  view = undefined
  vi.useRealTimers()
})

describe("inlineBlameText", () => {
  it("says nothing for a line with no blame", () => {
    expect(inlineBlameText(undefined)).toBeNull()
  })

  it("uses the author's first name, an age and the subject", () => {
    expect(inlineBlameText(line())).toBe("Ada · 3d · fix the gutter")
  })

  it("falls back to the whole author when the split yields nothing", () => {
    // A leading space makes the first segment empty, which is the only input
    // that actually exercises the `|| author` fallback.
    expect(inlineBlameText(line({ author: " dependabot" }))).toBe(
      " dependabot · 3d · fix the gutter",
    )
  })

  it("switches from days to months at exactly 30", () => {
    expect(inlineBlameText(line({ time: daysAgo(29) }))).toContain("· 29d ·")
    expect(inlineBlameText(line({ time: daysAgo(30) }))).toContain("· 1mo ·")
  })

  it("treats only an all-zero hash as uncommitted, not any hash starting with 0", () => {
    // Roughly one commit in sixteen has a hash starting with "0"; a loose test
    // would render all of them as the user's own uncommitted line.
    expect(inlineBlameText(line({ hash: "0abc1234" }))).not.toContain("uncommitted")
    expect(inlineBlameText(line({ hash: "00000000" }))).toContain("uncommitted")
  })

  it("calls today's work today, not 0d", () => {
    expect(inlineBlameText(line({ time: daysAgo(0.2) }))).toContain("· today ·")
  })

  it("scales the age to days, months and years", () => {
    expect(inlineBlameText(line({ time: daysAgo(29) }))).toContain("· 29d ·")
    expect(inlineBlameText(line({ time: daysAgo(60) }))).toContain("· 2mo ·")
    expect(inlineBlameText(line({ time: daysAgo(400) }))).toContain("· 1y ·")
  })

  it("marks an uncommitted line as yours, with no hash or subject", () => {
    expect(inlineBlameText(line({ hash: "0000000000" }))).toBe("You · uncommitted")
  })
})

describe("blameGutter", () => {
  it("annotates each blamed line with author and age", () => {
    view = new EditorView({
      doc: "one\ntwo\nthree",
      extensions: [blameGutter([line({ line: 1 }), line({ line: 3, author: "Grace Hopper" })])],
      parent: document.body,
    })
    const marks = [...view.dom.querySelectorAll(".reado-blame")].map((n) => n.textContent)
    expect(marks).toEqual(["Ada · 3d", "Grace · 3d"])
  })

  it("puts the subject, hash, full author and date in the hover", () => {
    view = new EditorView({
      doc: "one",
      extensions: [blameGutter([line()])],
      parent: document.body,
    })
    const title = view.dom.querySelector<HTMLElement>(".reado-blame")?.title
    expect(title).toContain("fix the gutter")
    // The date is formatted in the user's locale, so match its parts, not a
    // fixed en-US/en-GB rendering (this suite runs on three OSes).
    expect(title).toContain("a1b2c3d · Ada Lovelace · ")
    expect(title).toMatch(/Mar\D+9\D+2026|9\D+Mar\D+2026/)
  })

  it("marks an uncommitted line as yours, muted", () => {
    view = new EditorView({
      doc: "one",
      extensions: [blameGutter([line({ hash: "0000000" })])],
      parent: document.body,
    })
    const el = view.dom.querySelector<HTMLElement>(".reado-blame")
    expect(el?.textContent).toBe("You · uncommitted")
    expect(el?.className).toContain("reado-blame-muted")
    expect(el?.title).toBe("Not committed yet")
  })

  it("leaves unblamed lines bare", () => {
    view = new EditorView({
      doc: "one\ntwo",
      extensions: [blameGutter([line({ line: 2 })])],
      parent: document.body,
    })
    expect(view.dom.querySelectorAll(".reado-blame")).toHaveLength(1)
  })
})

describe("inlineBlame", () => {
  /** Mount with the plugin and return the decoration set it built. */
  const mount = (doc: string, lines: BlameLine[], at = 0) => {
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: at },
        extensions: [inlineBlame(lines)],
      }),
      parent: document.body,
    })
    return view
  }

  it("annotates only the cursor's line", () => {
    const v = mount("one\ntwo", [line({ line: 1 }), line({ line: 2, author: "Grace Hopper" })])
    expect(v.dom.querySelectorAll(".reado-inline-blame")).toHaveLength(1)
    expect(v.dom.querySelector(".reado-inline-blame")?.textContent).toBe(
      "Ada · 3d · fix the gutter",
    )
  })

  it("follows the cursor to another line", () => {
    const v = mount("one\ntwo", [line({ line: 1 }), line({ line: 2, author: "Grace Hopper" })])
    v.dispatch({ selection: { anchor: v.state.doc.line(2).from } })
    expect(v.dom.querySelector(".reado-inline-blame")?.textContent).toContain("Grace")
  })

  it("stays out of the accessibility tree — it's scenery, not content", () => {
    const v = mount("one", [line()])
    expect(v.dom.querySelector(".reado-inline-blame")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("says nothing on an empty line, where it would read as content", () => {
    const v = mount("\ntwo", [line({ line: 1 })])
    expect(v.dom.querySelectorAll(".reado-inline-blame")).toHaveLength(0)
  })

  it("says nothing on a line with no blame", () => {
    const v = mount("one\ntwo", [line({ line: 2 })])
    expect(v.dom.querySelectorAll(".reado-inline-blame")).toHaveLength(0)
  })
})
