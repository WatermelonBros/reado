/**
 * Custom in-editor search panel (Cmd/Ctrl+F).
 *
 * Replaces CodeMirror's default find UI with one that matches Reado: arrow
 * buttons for previous/next, the same Aa / ab / .* toggles as the global search,
 * and multi-line search/replace boxes (Shift+Enter inserts a newline; Enter finds
 * the next match). Plain DOM (a CodeMirror panel isn't a React tree) styled with
 * the app's Tailwind utilities.
 */
import { EditorView, type Panel } from "@codemirror/view";
import {
  SearchQuery,
  getSearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  closeSearchPanel,
} from "@codemirror/search";
import { t } from "../i18n";

const svg = (path: string) =>
  `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const CHEVRON_UP = svg('<path d="M6 15l6-6 6 6"/>');
const CHEVRON_DOWN = svg('<path d="M6 9l6 6 6-6"/>');
const CLOSE = svg('<path d="M6 6l12 12M18 6L6 18"/>');
// Replace (swap arrows) and replace-all (swap + "all" lines).
const REPLACE = svg(
  '<path d="M14 4l3 3-3 3"/><path d="M17 7H9a4 4 0 0 0-4 4"/><path d="M10 20l-3-3 3-3"/><path d="M7 17h8a4 4 0 0 0 4-4"/>',
);
const REPLACE_ALL = svg('<path d="M4 6h11"/><path d="M4 12h11"/><path d="M4 18h11"/><path d="M18 4l3 3-3 3"/>');

const FLAG_BASE =
  "grid h-6 w-6 flex-none place-items-center rounded border font-mono text-[11px] font-semibold transition-colors";
const FLAG_ON =
  "border-accent bg-[color-mix(in_oklch,var(--accent)_18%,transparent)] text-accent";
const FLAG_OFF = "border-line text-muted hover:bg-surface hover:text-ink";
const ICON_BTN =
  "grid h-6 w-6 flex-none place-items-center rounded text-muted transition-colors hover:bg-surface hover:text-ink";
const FIELD =
  "min-w-0 flex-1 resize-none rounded-md border border-line bg-canvas px-2 py-1 font-mono text-sm text-ink outline-none placeholder:font-sans placeholder:text-faint focus:border-line-strong";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  init?: Partial<HTMLElementTagNameMap[K]>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (init) Object.assign(node, init);
  return node;
}

/** Grow a textarea with its content, 1–6 rows. */
const autoRows = (ta: HTMLTextAreaElement) => {
  ta.rows = Math.min(6, Math.max(1, ta.value.split("\n").length));
};

/** Build Reado's search panel for a CodeMirror `search({ createPanel })` config. */
export function readoSearchPanel(view: EditorView): Panel {
  const initial = getSearchQuery(view.state);
  let caseSensitive = initial.caseSensitive;
  let wholeWord = initial.wholeWord;
  let regexp = initial.regexp;

  const searchInput = el("textarea", FIELD, {
    rows: 1,
    placeholder: t("search.placeholder"),
    spellcheck: false,
    value: initial.search,
  });
  const replaceInput = el("textarea", FIELD, {
    rows: 1,
    placeholder: t("search.replacePlaceholder"),
    spellcheck: false,
    value: initial.replace,
  });

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
    });
  };

  searchInput.addEventListener("input", () => {
    autoRows(searchInput);
    commit();
  });
  replaceInput.addEventListener("input", () => autoRows(replaceInput));

  // Enter finds the next match; Shift+Enter inserts a newline; Escape closes.
  const onKeydown = (e: KeyboardEvent, onEnter: () => void) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearchPanel(view);
      view.focus();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onEnter();
    }
  };
  searchInput.addEventListener("keydown", (e) => onKeydown(e, () => findNext(view)));
  replaceInput.addEventListener("keydown", (e) => onKeydown(e, () => replaceNext(view)));

  const flag = (label: string, title: string, get: () => boolean, set: (v: boolean) => void) => {
    const btn = el("button", `${FLAG_BASE} ${get() ? FLAG_ON : FLAG_OFF}`, {
      type: "button",
      title,
      textContent: label,
    });
    btn.setAttribute("aria-label", title);
    btn.setAttribute("aria-pressed", String(get()));
    btn.addEventListener("click", () => {
      set(!get());
      btn.className = `${FLAG_BASE} ${get() ? FLAG_ON : FLAG_OFF}`;
      btn.setAttribute("aria-pressed", String(get()));
      commit();
      searchInput.focus();
    });
    return btn;
  };

  const iconBtn = (html: string, title: string, onClick: () => void) => {
    const btn = el("button", ICON_BTN, { type: "button", title, innerHTML: html });
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", onClick);
    return btn;
  };

  const caseBtn = flag("Aa", t("search.caseSensitive"), () => caseSensitive, (v) => (caseSensitive = v));
  const wordBtn = flag("ab", t("search.wholeWord"), () => wholeWord, (v) => (wholeWord = v));
  const reBtn = flag(".*", t("search.regex"), () => regexp, (v) => (regexp = v));

  const prevBtn = iconBtn(CHEVRON_UP, t("search.prev"), () => findPrevious(view));
  const nextBtn = iconBtn(CHEVRON_DOWN, t("search.next"), () => findNext(view));
  const closeBtn = iconBtn(CLOSE, t("settings.close"), () => {
    closeSearchPanel(view);
    view.focus();
  });

  const replaceBtn = iconBtn(REPLACE, t("search.replaceOne"), () => replaceNext(view));
  const replaceAllBtn = iconBtn(REPLACE_ALL, t("search.replaceAll"), () => replaceAll(view));

  const toggles = el("div", "flex flex-none items-center gap-0.5");
  toggles.append(caseBtn, wordBtn, reBtn);
  const nav = el("div", "flex flex-none items-center gap-0.5");
  nav.append(prevBtn, nextBtn, closeBtn);

  const row1 = el("div", "flex items-start gap-1.5");
  row1.append(searchInput, toggles, nav);
  const row2 = el("div", "flex items-start gap-1.5");
  row2.append(replaceInput, replaceBtn, replaceAllBtn);

  const dom = el("div", "cm-reado-search flex flex-col gap-1 border-b border-line bg-surface p-1.5");
  dom.append(row1, row2);
  // Don't let editor shortcuts (Cmd+F etc.) fire while typing in the panel.
  dom.addEventListener("keydown", (e) => e.stopPropagation());

  return {
    dom,
    top: true,
    mount() {
      // Seed from a single-line selection if the field is empty (VS Code-like).
      if (!searchInput.value) {
        const sel = view.state.sliceDoc(
          view.state.selection.main.from,
          view.state.selection.main.to,
        );
        if (sel && !sel.includes("\n")) {
          searchInput.value = sel;
          commit();
        }
      }
      autoRows(searchInput);
      autoRows(replaceInput);
      searchInput.focus();
      searchInput.select();
    },
  };
}
