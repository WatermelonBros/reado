## Why

Two gaps survive `openvsx-marketplace`, and they are the same gap.

Highlighting is Lezer-based, so a language with no CodeMirror language pack
renders as plain text. The `code-reading` spec accepts that ("Unknown language
degrades gracefully"), which is right as a floor and wrong as a ceiling for a
tool whose whole premise is reading code. Terraform, Nix, Dockerfile, Prisma,
Elixir, Astro, Zig — a long tail where Reado currently shows grey text.

And a contributed colour theme's syntax colours are keyed on **TextMate
scopes**. Without a scope-producing tokenizer, `openvsx-marketplace` can only
approximate them by mapping common scopes onto Lezer tags. Imported themes
therefore look approximately right, never exactly right — and "approximately
right colours" is the kind of thing a user notices every second of every day.

TextMate grammars solve both, and they are already in the packages Reado now
installs: `contributes.grammars` is data, like the rest. This is the last
declarative contribution kind worth having, and the only one that needs real
machinery rather than a JSON mapping — a regex engine and an incremental
tokenizer wired into the editor.

## What Changes

- **Grammars join the contribution whitelist.** An installed extension's
  TextMate grammars are registered for the languages they declare, from the same
  packages, through the same confined install path.
- **A grammar-based highlighter, as the fallback layer only.** Lezer stays the
  default wherever a language pack exists: the syntax tree drives the outline,
  focus block, syntax-aware selection and nesting cues, and a token stream
  cannot replace it. Grammars fill the gap where there is no pack.
- **Themes get exact syntax colours.** With real scopes available, a contributed
  theme's token rules apply as written, superseding the interim tag mapping.
- **Tokenization is bounded by construction.** Grammar regexes come from
  untrusted packages and the format is famously capable of catastrophic
  backtracking, so tokenization runs against a time budget per line, a maximum
  line length, and a viewport-limited work window — and gives up to plain text
  instead of freezing the editor. The existing large-file performance
  requirement is the bar this must not break.

## Capabilities

### Modified Capabilities

- `code-reading`: syntax highlighting is provided by CodeMirror/Lezer language
  packs where one exists, and by contributed TextMate grammars where none does.
- `extensions`: adds the grammar contribution kind, and makes contributed themes
  colour syntax by real scopes rather than by the interim tag approximation.

## Out of Scope

- Replacing Lezer where a language pack exists.
- Semantic-token highlighting from language servers (a separate, later concern).
- Grammar-derived folding, indentation, or structure. Reado's outline, focus
  block and nesting cues stay Lezer-backed; grammar-only languages keep the
  index-based navigation they have today.
