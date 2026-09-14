// Reado's in-editor find/replace panel: a plain-DOM CodeMirror panel, so it is
// driven here the way the user drives it — typing, clicking and pressing keys.
import {
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  search,
  searchPanelOpen,
} from "@codemirror/search"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"
import { readoSearchPanel } from "@/lib/searchPanel"
import { scopeOf, searchScope } from "@/lib/searchScope"

let view: EditorView

/** Mount an editor with Reado's panel and open it, as Cmd/Ctrl+F does. */
function openPanel(doc = "alpha beta\nalpha gamma", selection?: { anchor: number; head: number }) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection,
      extensions: [search({ top: true, createPanel: readoSearchPanel }), searchScope],
    }),
    parent: document.body,
  })
  openSearchPanel(view)
  return view.dom.querySelector<HTMLElement>(".cm-reado-search") as HTMLElement
}

const fields = (panel: HTMLElement) => panel.querySelectorAll("textarea")
const buttonByLabel = (panel: HTMLElement, label: string) =>
  panel.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) as HTMLButtonElement
const type = (ta: HTMLTextAreaElement, value: string) => {
  ta.value = value
  ta.dispatchEvent(new Event("input", { bubbles: true }))
}
const press = (el: HTMLElement, init: KeyboardEventInit) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))

afterEach(() => view?.destroy())

describe("the panel", () => {
  it("offers a search field and a replace field", () => {
    const panel = openPanel()
    expect(fields(panel)).toHaveLength(2)
  })

  it("focuses the query field on open, and again on a second Cmd+F", () => {
    const panel = openPanel()
    const query = fields(panel)[0]
    expect(document.activeElement).toBe(query)
    // Clicking into the document moves focus away; ⌘F again must bring it back.
    // CodeMirror finds the field by its `main-field` attribute.
    view.focus()
    openSearchPanel(view)
    expect(document.activeElement).toBe(query)
  })

  it("labels every button, so it is usable without seeing the icons", () => {
    const panel = openPanel()
    const buttons = [...panel.querySelectorAll("button")]
    expect(buttons.length).toBeGreaterThanOrEqual(8)
    expect(buttons.every((b) => b.getAttribute("aria-label"))).toBe(true)
  })

  it("seeds the query from a single-line selection, VS Code style", () => {
    const panel = openPanel("alpha beta\nalpha gamma", { anchor: 0, head: 5 })
    expect(fields(panel)[0].value).toBe("alpha")
    expect(getSearchQuery(view.state).search).toBe("alpha")
  })

  it("opens empty when nothing is selected", () => {
    const panel = openPanel()
    expect(fields(panel)[0].value).toBe("")
    expect(fields(panel)[1].value).toBe("")
  })

  it("keeps editor shortcuts from firing while you type in it", () => {
    const panel = openPanel()
    const outer = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "f" })
    const seen: unknown[] = []
    view.dom.addEventListener("keydown", (e) => seen.push(e))
    fields(panel)[0].dispatchEvent(outer)
    expect(seen).toHaveLength(0)
  })
})

describe("typing a query", () => {
  it("commits what you type to the editor's search state", () => {
    const panel = openPanel()
    type(fields(panel)[0], "beta")
    expect(getSearchQuery(view.state).search).toBe("beta")
  })

  it("grows the field with the query, up to six rows", () => {
    const panel = openPanel()
    const input = fields(panel)[0]
    type(input, "a\nb\nc")
    expect(Number(input.rows)).toBe(3)
    type(input, "x\n".repeat(20))
    expect(Number(input.rows)).toBe(6) // capped, so the panel can't eat the editor
  })
})

describe("the flag toggles", () => {
  it("carry their state for assistive tech and apply it to the query", () => {
    const panel = openPanel()
    type(fields(panel)[0], "alpha")
    const caseBtn = [...panel.querySelectorAll("button")].find((b) => b.textContent === "Aa")!
    expect(caseBtn.getAttribute("aria-pressed")).toBe("false")
    caseBtn.click()
    expect(caseBtn.getAttribute("aria-pressed")).toBe("true")
    expect(getSearchQuery(view.state).caseSensitive).toBe(true)
    caseBtn.click()
    expect(getSearchQuery(view.state).caseSensitive).toBe(false)
  })

  it("covers whole-word and regex too", () => {
    const panel = openPanel()
    type(fields(panel)[0], "alpha")
    const byLabel = (text: string) =>
      [...panel.querySelectorAll("button")].find((b) => b.textContent === text)!
    byLabel("ab").click()
    expect(getSearchQuery(view.state).wholeWord).toBe(true)
    byLabel(".*").click()
    expect(getSearchQuery(view.state).regexp).toBe(true)
  })
})

describe("finding and replacing", () => {
  it("Enter in the search field walks the matches", () => {
    const panel = openPanel()
    type(fields(panel)[0], "alpha")
    press(fields(panel)[0], { key: "Enter" })
    expect([view.state.selection.main.from, view.state.selection.main.to]).toEqual([0, 5])
    press(fields(panel)[0], { key: "Enter" })
    expect(view.state.selection.main.from).toBe(11) // the second "alpha"
  })

  it("Shift+Enter types a newline instead of searching", () => {
    const panel = openPanel()
    const before = view.state.selection.main.from
    type(fields(panel)[0], "alpha")
    const e = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      shiftKey: true,
    })
    fields(panel)[0].dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    // A triggered search would select the match at 0..5, whose `from` is also
    // 0 — it is the empty selection that says no search ran.
    expect([view.state.selection.main.from, view.state.selection.main.to]).toEqual([before, before])
  })

  /** Put a query and its replacement into the panel. Only the search field
   *  commits, so it is typed last — as it is when a user fills both in. */
  const query = (panel: HTMLElement, search: string, replace: string) => {
    fields(panel)[1].value = replace
    fields(panel)[1].dispatchEvent(new Event("input", { bubbles: true }))
    type(fields(panel)[0], search)
  }

  it("replaces one match, then all of them", () => {
    const panel = openPanel()
    query(panel, "alpha", "omega")
    // The first press selects the match; the second replaces it (CodeMirror
    // replaces the *current* match, so nothing is rewritten unseen).
    buttonByLabel(panel, "Replace").click()
    expect(view.state.doc.toString()).not.toContain("omega")
    buttonByLabel(panel, "Replace").click()
    expect(view.state.doc.toString()).toContain("omega")
    buttonByLabel(panel, "Replace all").click()
    expect(view.state.doc.toString()).not.toContain("alpha")
  })

  it("Enter in the replace field replaces the current match", () => {
    const panel = openPanel()
    query(panel, "alpha", "omega")
    press(fields(panel)[1], { key: "Enter" })
    press(fields(panel)[1], { key: "Enter" })
    expect(view.state.doc.toString()).toContain("omega")
  })

  it("walks backwards with the previous button", () => {
    const panel = openPanel()
    type(fields(panel)[0], "alpha")
    // "alpha beta\nalpha gamma" — matches at 0..5 and 11..16.
    const sel = () => [view.state.selection.main.from, view.state.selection.main.to]
    buttonByLabel(panel, "Next match").click()
    buttonByLabel(panel, "Next match").click()
    expect(sel()).toEqual([11, 16])
    buttonByLabel(panel, "Previous match").click()
    expect(sel()).toEqual([0, 5])
  })
})

describe("find in selection", () => {
  const doc = "alpha one\nalpha two\nalpha three"
  //           0        9 10      19 20

  it("a multi-line selection is a scope, not a search term", () => {
    const panel = openPanel(doc, { anchor: 0, head: 19 })
    expect(scopeOf(view.state)).toEqual({ from: 0, to: 19 })
    // The selected text is three lines: putting it in the search field would be
    // searching for the thing you were pointing at.
    expect(fields(panel)[0].value).toBe("")
    expect(buttonByLabel(panel, "Find in selection").getAttribute("aria-pressed")).toBe("true")
  })

  it("replaces only inside the range", () => {
    const panel = openPanel(doc, { anchor: 0, head: 19 })
    fields(panel)[1].value = "omega"
    fields(panel)[1].dispatchEvent(new Event("input", { bubbles: true }))
    type(fields(panel)[0], "alpha")
    buttonByLabel(panel, "Replace all").click()
    expect(view.state.doc.toString()).toBe("omega one\nomega two\nalpha three")
  })

  it("counts, and walks, only the matches inside the range", () => {
    const panel = openPanel(doc, { anchor: 0, head: 19 })
    type(fields(panel)[0], "alpha")
    const counter = panel.querySelector("span") as HTMLElement
    expect(counter.textContent).toContain("2")
    expect(counter.textContent).not.toContain("3")

    const sel = () => [view.state.selection.main.from, view.state.selection.main.to]
    buttonByLabel(panel, "Next match").click()
    expect(sel()).toEqual([0, 5])
    buttonByLabel(panel, "Next match").click()
    expect(sel()).toEqual([10, 15])
    // Wraps at the range's end, never at the document's.
    buttonByLabel(panel, "Next match").click()
    expect(sel()).toEqual([0, 5])
    // And selecting a match inside the range did not destroy the range.
    expect(scopeOf(view.state)).toEqual({ from: 0, to: 19 })
  })

  it("the range follows edits made inside it", () => {
    const panel = openPanel(doc, { anchor: 0, head: 19 })
    fields(panel)[1].value = "much-longer"
    fields(panel)[1].dispatchEvent(new Event("input", { bubbles: true }))
    type(fields(panel)[0], "alpha")
    buttonByLabel(panel, "Replace all").click()
    // Two replacements, each six characters longer: the end moved with them,
    // so the last line is still outside.
    expect(scopeOf(view.state)).toEqual({ from: 0, to: 31 })
    expect(view.state.doc.toString()).toContain("alpha three")
  })

  it("the toggle turns the scope off", () => {
    const panel = openPanel(doc, { anchor: 0, head: 19 })
    buttonByLabel(panel, "Find in selection").click()
    expect(scopeOf(view.state)).toBeNull()
  })

  it("closing the panel drops the scope", () => {
    openPanel(doc, { anchor: 0, head: 19 })
    expect(scopeOf(view.state)).not.toBeNull()
    // Blur first: this environment fires `selectionchange` synchronously as the
    // panel's field goes away, which CodeMirror sees as an update inside an
    // update. The browser fires it after the fact.
    ;(document.activeElement as HTMLElement | null)?.blur()
    closeSearchPanel(view)
    expect(scopeOf(view.state)).toBeNull()
  })

  it("without a range, replace all still rewrites the whole document", () => {
    const panel = openPanel(doc)
    expect(scopeOf(view.state)).toBeNull()
    fields(panel)[1].value = "omega"
    fields(panel)[1].dispatchEvent(new Event("input", { bubbles: true }))
    type(fields(panel)[0], "alpha")
    buttonByLabel(panel, "Replace all").click()
    expect(view.state.doc.toString()).toBe("omega one\nomega two\nomega three")
  })
})

describe("closing", () => {
  it("Escape closes the panel and returns focus to the editor", () => {
    const panel = openPanel()
    const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" })
    fields(panel)[0].dispatchEvent(e)
    expect(searchPanelOpen(view.state)).toBe(false)
    expect(document.activeElement).toBe(view.contentDOM)
    // Swallowed, so the same Escape doesn't also reach whatever else listens
    // for it (a dialog, the palette).
    expect(e.defaultPrevented).toBe(true)
  })

  it("the close button closes it too", () => {
    const panel = openPanel()
    buttonByLabel(panel, "Close").click()
    expect(searchPanelOpen(view.state)).toBe(false)
  })
})
