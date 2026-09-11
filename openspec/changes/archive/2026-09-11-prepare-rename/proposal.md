## Why

F2 asks the server to rename the symbol under the cursor, but *which* text is the
symbol is decided here, by CodeMirror's `wordAt()`. A "word" is letters, digits
and underscore — so on `@Component` the range is `Component`, on `$scope` it is
`scope`, on a CSS `--brand-color` it is one of three fragments, and on a Rust
lifetime `'a` it is `a`. The server is then asked to rename a position it agrees
with but a range the user didn't select, and the result is either a refusal or a
rename the user has to go and check.

The server already answers this exactly: `textDocument/prepareRename` returns the
range it would rename, or nothing at all when the symbol cannot be renamed (a
keyword, a symbol from a dependency, a literal). Reado asks it after the user has
typed a new name; asking before is what makes the prompt show the right current
name and lets a refusal arrive *before* the user is made to type.

## What Changes

- Before opening the rename prompt, Reado asks the server for the rename range
  with `textDocument/prepareRename`, and uses that range as both the prompt's
  starting value and the position sent to `textDocument/rename`.
- A server that answers "this cannot be renamed" says so immediately, instead of
  opening a prompt whose answer is thrown away.
- A server without `prepareProvider`, or one that errors, keeps today's behaviour
  exactly: `wordAt()` guesses the range, and nothing is lost.

## Capabilities

### Added Capabilities

- `language-intelligence`: the rename contract, written down for the first time —
  rename asks the server for the range it will rewrite before prompting, and
  reports an un-renameable symbol before asking for a name. (Cross-file rename
  itself has worked since 2026-09-10; the capability's spec never described it.)
