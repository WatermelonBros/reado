/**
 * Custom in-editor search panel (Cmd/Ctrl+F).
 *
 * Replaces CodeMirror's default find UI with one that matches Reado: arrow
 * buttons for previous/next, the same Aa / ab / .* toggles as the global search,
 * and multi-line search/replace boxes (Shift+Enter inserts a newline; Enter finds
 * the next match). Plain DOM (a CodeMirror panel isn't a React tree) styled with
 * the app's Tailwind utilities.
 */

import { closeSearchPanel, getSearchQuery, SearchQuery, setSearchQuery } from "@codemirror/search"
import type { EditorView, Panel } from "@codemirror/view"
import { t } from "@/i18n"
import {
  countIn,
  findNextInScope,
  findPrevInScope,
  replaceAllInScope,
  replaceNextInScope,
  scopeOf,
  setSearchScope,
} from "./searchScope"

const svg = (path: string) =>
  `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
const CHEVRON_UP = svg('<path d="M6 15l6-6 6 6"/>')
const CHEVRON_DOWN = svg('<path d="M6 9l6 6 6-6"/>')
const CLOSE = svg('<path d="M6 6l12 12M18 6L6 18"/>')
// Replace (swap arrows) and replace-all (swap + "all" lines).
const REPLACE = svg(
  '<path d="M14 4l3 3-3 3"/><path d="M17 7H9a4 4 0 0 0-4 4"/><path d="M10 20l-3-3 3-3"/><path d="M7 17h8a4 4 0 0 0 4-4"/>',
)
const REPLACE_ALL = svg(
  '<path d="M4 6h11"/><path d="M4 12h11"/><path d="M4 18h11"/><path d="M18 4l3 3-3 3"/>',
)

const FLAG_BASE =
  "grid h-6 w-6 flex-none place-items-center rounded border font-mono text-[11px] font-semibold transition-colors"
const FLAG_ON = "border-accent bg-[color-mix(in_oklch,var(--accent)_18%,transparent)] text-accent"
const FLAG_OFF = "border-line text-muted hover:bg-surface hover:text-ink"
const COUNT = "flex-none px-1 text-[11px] text-faint tabular-nums whitespace-nowrap"
const ICON_BTN =
  "grid h-6 w-6 flex-none place-items-center rounded text-muted transition-colors hover:bg-surface hover:text-ink"
const FIELD =
  "min-w-0 flex-1 resize-none rounded-md border border-line bg-canvas px-2 py-1 font-mono text-sm text-ink outline-none placeholder:font-sans placeholder:text-faint focus:border-line-strong"

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  init?: Partial<HTMLElementTagNameMap[K]>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (init) Object.assign(node, init)
  return node
}

/** Grow a textarea with its content, 1–6 rows. */
const autoRows = (ta: HTMLTextAreaElement) => {
  ta.rows = Math.min(6, Math.max(1, ta.value.split("\n").length))
}

/** Build Reado's search panel for a CodeMirror `search({ createPanel })` config. */
export function readoSearchPanel(view: EditorView): Panel {
  const initial = getSearchQuery(view.state)
  let caseSensitive = initial.caseSensitive
  let wholeWord = initial.wholeWord
  let regexp = initial.regexp

  // The library seeds the query with whatever is selected, newlines and all.
  // When that selection is a *scope* (see `searchScope`), the field starts empty
  // instead — the region was the point, not the text in it.
  const scoped = scopeOf(view.state) !== null
  const searchInput = el("textarea", FIELD, {
    rows: 1,
    placeholder: t("search.placeholderFile"),
    spellcheck: false,
    value: scoped ? "" : initial.search,
  })
  // CodeMirror finds the panel's query field by this attribute (`getSearchInput`),
  // which is how a second ⌘F while the panel is open puts the caret back in it.
  searchInput.setAttribute("main-field", "")
  const replaceInput = el("textarea", FIELD, {
    rows: 1,
    placeholder: t("search.replacePlaceholder"),
    spellcheck: false,
    value: initial.replace,
  })

  const commit = () => {
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({
          search: searchInput.value,
          replace: replaceInput.value,
          caseSensitive,
          wholeWord,
          regexp,
        }),
      ),
    })
  }

  searchInput.addEventListener("input", () => {
    autoRows(searchInput)
    commit()
  })
  replaceInput.addEventListener("input", () => autoRows(replaceInput))

  // Enter finds the next match; Shift+Enter inserts a newline; Escape closes.
  const onKeydown = (e: KeyboardEvent, onEnter: () => void) => {
    if (e.key === "Escape") {
      e.preventDefault()
      closeSearchPanel(view)
      view.focus()
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onEnter()
    }
  }
  searchInput.addEventListener("keydown", (e) => onKeydown(e, () => findNextInScope(view)))
  replaceInput.addEventListener("keydown", (e) => onKeydown(e, () => replaceNextInScope(view)))

  /** A toggle's look and its announced state, in one place — the panel repaints
   *  the selection toggle from the editor's own state as well as on click. */
  const repaint = (btn: HTMLButtonElement, on: boolean) => {
    btn.className = `${FLAG_BASE} ${on ? FLAG_ON : FLAG_OFF}`
    btn.setAttribute("aria-pressed", String(on))
  }

  const flag = (label: string, title: string, get: () => boolean, set: (v: boolean) => void) => {
    const btn = el("button", `${FLAG_BASE} ${get() ? FLAG_ON : FLAG_OFF}`, {
      type: "button",
      title,
      textContent: label,
    })
    btn.setAttribute("aria-label", title)
    btn.setAttribute("aria-pressed", String(get()))
    btn.addEventListener("click", () => {
      set(!get())
      repaint(btn, get())
      commit()
      searchInput.focus()
    })
    return btn
  }

  const iconBtn = (html: string, title: string, onClick: () => void) => {
    const btn = el("button", ICON_BTN, { type: "button", title, innerHTML: html })
    btn.setAttribute("aria-label", title)
    btn.addEventListener("click", onClick)
    return btn
  }

  const caseBtn = flag(
    "Aa",
    t("search.caseSensitive"),
    () => caseSensitive,
    (v) => (caseSensitive = v),
  )
  const wordBtn = flag(
    "ab",
    t("search.wholeWord"),
    () => wholeWord,
    (v) => (wholeWord = v),
  )
  const reBtn = flag(
    ".*",
    t("search.regex"),
    () => regexp,
    (v) => (regexp = v),
  )

  // Find in selection. Not part of the `SearchQuery` — the library has no notion
  // of a scope — so it sets a range in the editor's state that every command in
  // this panel honours. The selection is frozen at the moment it is turned on:
  // the first Find Next selects a match *inside* the range, and a scope that
  // followed the selection would destroy itself on its own first use.
  const scopeOn = () => scopeOf(view.state) !== null
  const setScope = (on: boolean) => {
    const sel = view.state.selection.main
    view.dispatch({
      effects: setSearchScope.of(on && !sel.empty ? { from: sel.from, to: sel.to } : null),
    })
  }
  const scopeBtn = flag("[]", t("search.inSelection"), scopeOn, setScope)

  // "3 of 17", like every other editor's find bar. Counting is capped: on a
  // very large document an exact total is not worth a full scan per keystroke,
  // so past the cap it reads "1000+" instead of lying or stalling.
  const COUNT_CAP = 1000
  const counter = el("span", COUNT)
  const renderCount = () => {
    const query = getSearchQuery(view.state)
    if (!query.search || !query.valid) {
      counter.textContent = ""
      return
    }
    const range = scopeOf(view.state)
    if (range) {
      const { current, total } = countIn(view.state, range)
      counter.textContent = total ? t("search.count", { current, total }) : t("search.noResults")
      return
    }
    const sel = view.state.selection.main
    const cursor = query.getCursor(view.state)
    let total = 0
    let current = 0
    for (let it = cursor.next(); !it.done; it = cursor.next()) {
      total++
      if (it.value.from === sel.from && it.value.to === sel.to) current = total
      if (total >= COUNT_CAP) {
        counter.textContent = t("search.countCapped", { cap: COUNT_CAP })
        return
      }
    }
    counter.textContent = total ? t("search.count", { current, total }) : t("search.noResults")
  }

  const prevBtn = iconBtn(CHEVRON_UP, t("search.prev"), () => findPrevInScope(view))
  const nextBtn = iconBtn(CHEVRON_DOWN, t("search.next"), () => findNextInScope(view))
  const closeBtn = iconBtn(CLOSE, t("settings.close"), () => {
    closeSearchPanel(view)
    view.focus()
  })

  const replaceBtn = iconBtn(REPLACE, t("search.replaceOne"), () => replaceNextInScope(view))
  const replaceAllBtn = iconBtn(REPLACE_ALL, t("search.replaceAll"), () => replaceAllInScope(view))

  const toggles = el("div", "flex flex-none items-center gap-0.5")
  toggles.append(caseBtn, wordBtn, reBtn, scopeBtn)
  const nav = el("div", "flex flex-none items-center gap-0.5")
  nav.append(prevBtn, nextBtn, closeBtn)

  const row1 = el("div", "flex items-start gap-1.5")
  row1.append(searchInput, counter, toggles, nav)
  const row2 = el("div", "flex items-start gap-1.5")
  row2.append(replaceInput, replaceBtn, replaceAllBtn)

  const dom = el("div", "cm-reado-search flex flex-col gap-1 border-b border-line bg-surface p-1.5")
  dom.append(row1, row2)
  // Don't let editor shortcuts (Cmd+F etc.) fire while typing in the panel.
  dom.addEventListener("keydown", (e) => e.stopPropagation())

  return {
    dom,
    top: true,
    update(u) {
      // The count depends on the document, the query, and which match is
      // selected — recompute on exactly those, not on every scroll.
      if (
        u.docChanged ||
        u.selectionSet ||
        u.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))
      ) {
        renderCount()
      }
      // The scope can end from outside the panel (an edit that collapses it), so
      // the toggle reads the editor rather than remembering.
      repaint(scopeBtn, scopeOn())
      // A scope needs something to scope: with no range and an empty selection
      // there is nothing the button could mean.
      scopeBtn.disabled = !scopeOn() && u.state.selection.main.empty
    },
    mount() {
      // Take the library's seeded query back when the selection was a scope. A
      // panel is mounted during an editor update, where dispatching is refused —
      // hence the microtask.
      if (scoped && initial.search) queueMicrotask(commit)
      else if (!searchInput.value) {
        const sel = view.state.sliceDoc(
          view.state.selection.main.from,
          view.state.selection.main.to,
        )
        if (sel && !sel.includes("\n")) {
          searchInput.value = sel
          queueMicrotask(commit)
        }
      }
      autoRows(searchInput)
      autoRows(replaceInput)
      renderCount()
      searchInput.focus()
      searchInput.select()
    },
  }
}
