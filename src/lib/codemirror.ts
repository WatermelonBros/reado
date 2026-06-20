/**
 * CodeMirror 6 theme and syntax highlighting for Reado.
 *
 * Both the editor chrome and the highlight style reference the CSS custom
 * properties defined in `tokens.css` via `var(--…)`. Because CodeMirror injects
 * its styles into the document, those `var()`s resolve against the active
 * `data-theme`, so a live theme switch needs no editor reconfiguration.
 *
 * The highlight style is deliberately restrained (≤6 semantic colours, ordered
 * by eye-tracking salience) per the project's reading research.
 */
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** Maps Lezer highlight tags to Reado's semantic syntax colours. */
const highlightStyle = HighlightStyle.define([
  // 1. Control-flow keywords — most salient.
  { tag: [t.controlKeyword, t.moduleKeyword], color: "var(--syn-control)" },
  // 2. Other keywords / storage.
  {
    tag: [t.keyword, t.modifier, t.operatorKeyword, t.definitionKeyword],
    color: "var(--syn-keyword)",
  },
  // 3. Definitions (function & type names).
  {
    tag: [t.function(t.definition(t.variableName)), t.definition(t.variableName)],
    color: "var(--syn-definition)",
  },
  {
    tag: [t.typeName, t.className, t.namespace],
    color: "var(--syn-definition)",
  },
  // 4. Strings.
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--syn-string)" },
  // 5. Numbers / constants.
  {
    tag: [t.number, t.bool, t.atom, t.constant(t.variableName)],
    color: "var(--syn-number)",
  },
  // 6. Comments — deliberately de-emphasised.
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
  // Punctuation / operators stay near the base text colour.
  {
    tag: [t.punctuation, t.operator, t.bracket, t.derefOperator],
    color: "var(--syn-punctuation)",
  },
  { tag: [t.propertyName, t.attributeName], color: "var(--text)" },
  { tag: [t.tagName], color: "var(--syn-control)" },
  { tag: [t.link, t.url], color: "var(--accent)", textDecoration: "underline" },
  { tag: [t.heading], color: "var(--syn-definition)", fontWeight: "600" },
  { tag: [t.invalid], color: "var(--marker)" },
]);

/** Editor chrome theme (gutters, selection, active line, landing highlight). */
const editorTheme = EditorView.theme({
  "&": {
    color: "var(--text)",
    backgroundColor: "transparent",
    height: "100%",
    fontSize: "var(--text-md)",
  },
  ".cm-scroller": {
    fontFamily: "var(--code-font, var(--font-code))",
    lineHeight: "var(--code-line-height)",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    padding: "var(--space-4) 0",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-faint)",
    border: "none",
    paddingRight: "var(--space-2)",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-muted)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--bg-elevated) 60%, transparent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection)",
  },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--bg-overlay)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    borderRadius: "var(--radius-sm)",
    padding: "0 6px",
  },
  // Soft landing highlight applied transiently after a jump (see Editor.tsx).
  ".cm-landing-line": {
    backgroundColor: "var(--landing)",
    transition: "background-color 1.2s var(--ease)",
  },
  // Cmd/Ctrl-hover affordance: the symbol is click-to-navigate.
  ".cm-goto-link": {
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    textDecorationColor: "var(--accent)",
    cursor: "pointer",
  },

  // Find & replace panel — themed to sit quietly inside Reado's surfaces.
  ".cm-panels": {
    backgroundColor: "var(--bg-elevated)",
    color: "var(--text)",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-search": {
    padding: "var(--space-2) var(--space-3)",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--space-2)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-sm)",
  },
  ".cm-search label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    color: "var(--text-muted)",
    fontSize: "var(--text-xs)",
  },
  ".cm-textfield": {
    backgroundColor: "var(--bg-surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "3px 8px",
    outline: "none",
  },
  ".cm-textfield:focus": { borderColor: "var(--border-strong)" },
  ".cm-button": {
    backgroundColor: "var(--bg-surface)",
    backgroundImage: "none",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "3px 9px",
    cursor: "pointer",
  },
  ".cm-button:hover": { backgroundColor: "var(--bg-overlay)" },
  ".cm-panel.cm-search [name=close]": {
    color: "var(--text-muted)",
    fontSize: "var(--text-md)",
    cursor: "pointer",
  },
  ".cm-panel.cm-search [name=close]:hover": { color: "var(--text)" },
});

/** All extensions implementing Reado's reading-focused appearance. */
export const readoAppearance = [syntaxHighlighting(highlightStyle), editorTheme];
