## Why

Go to Symbol in Project searches Reado's own index. That index is built by
scanning files with regexes: it finds what is written literally in the project's
own source, and nothing else. It cannot see a symbol that a macro or a code
generator produces, a symbol exported by a dependency, or a name spelled
differently from its declaration.

The language server has the real answer — `workspace/symbol` — and the servers for
every language Reado supports implement it.

## What Changes

- Go to Symbol in Project asks every attached language server as well as the
  index, merges the answers, and drops the duplicates (same name, same file, same
  line).
- The index still answers, and answers first: it is instant and works with no
  server at all. Server results arrive into the same list as they come back, so a
  slow server never delays the picker.
- Each result says where it came from only in the sense that matters: the file and
  line it will open. No new UI.

## Capabilities

### Modified Capabilities

- `navigation-search`: workspace symbol search also asks the language servers, not
  only Reado's index.
