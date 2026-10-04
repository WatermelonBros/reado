# The `tour.json` format

A project can ship guided tours through its own code: open this file, look at this
exact expression, here is why it matters. The tours live in one file, `tour.json`,
at the root of the repository, committed with the code they describe — so a checkout
of an old commit has the tours that matched it.

The format is open. It names no product, and this specification and its
[JSON Schema](./tour.schema.json) are dedicated to the public domain
([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)): any editor, IDE or
documentation site may read and write `tour.json` without asking. Reado is one
reader and writer of it.

## Example

```json
{
  "$schema": "https://reado.watermelon-studio.it/schema/tour/v1.json",
  "version": 1,
  "tours": [
    {
      "id": "request-lifecycle",
      "name": "Request lifecycle",
      "description": "From the socket to the database and back.",
      "onboarding": true,
      "author": "Luca",
      "steps": [
        {
          "file": "src/server.ts",
          "title": "Where requests come in",
          "body": "Every route is mounted here. Read the middleware order: auth runs **before** rate limiting."
        },
        {
          "file": "src/api.ts",
          "span": { "from": { "line": 41, "col": 9 }, "to": { "line": 41, "col": 22 } },
          "text": "retry(req, 3)",
          "title": "Retries",
          "body": "Idempotent calls are retried three times; anything else fails fast."
        }
      ]
    }
  ]
}
```

## The file

| Field | Type | |
|---|---|---|
| `$schema` | string | Optional. Tools that write the file should set it. |
| `version` | integer | Required. The format's **major** version — `1`. |
| `tours` | array of tours | Required. |

A file named `tour.json` is a tour file when its top level has an integer `version`
and an array `tours`. Anything else with that name belongs to some other tool:
readers ignore it, writers never overwrite it.

## A tour

| Field | Type | |
|---|---|---|
| `id` | string | Required, unique in the file, stable across edits. |
| `name` | string | Required. |
| `description` | string | Optional. |
| `onboarding` | boolean | Optional. The project's tour for newcomers. If several tours set it, the first one wins. |
| `author` | string | Optional display name. |
| `steps` | array of steps | Required, at least one. |

## A step

| Field | Type | |
|---|---|---|
| `file` | string | Required. Relative to the project root, `/`-separated. It never starts with `/` or a drive letter and contains no `..` segment; readers skip a step that does. |
| `span` | `{ from, to }` | Optional. Without it the step is about the whole file. |
| `text` | string | Optional, recommended with `span`: the exact code the span covered when it was written. |
| `title` | string | Required. |
| `body` | string | Required. CommonMark with GFM extensions. Rendered without raw HTML. |
| `placement` | `"auto"`, `"right"`, `"left"`, `"top"`, `"bottom"` | Optional. Where the explanation sits relative to the code. |

### Positions

`from` and `to` are `{ "line": n, "col": m }`.

- Lines are 1-based.
- Columns are 1-based and counted in **Unicode code points** (not bytes, not UTF-16
  units), so every tool highlights the same characters.
- `to.col` is **exclusive**: `{ "line": 41, "col": 9 }` to `{ "line": 41, "col": 22 }`
  covers 13 characters.
- Without `col`, a position means the whole line: `from` at its start, `to` at its
  end. `{ "from": { "line": 40 }, "to": { "line": 52 } }` is lines 40 to 52.

### Finding a step again

Code moves. A reader locates a step in this order:

1. If `text` is present, find it in the file — exactly, then ignoring differences in
   whitespace. With several matches, take the one nearest to `span`.
2. If `text` is absent, use `span` if it still fits the file.
3. If `text` is present but no longer in the file, the code is gone: show the file and
   say the step is out of date. Never highlight whatever now sits on the old lines.

## Versioning and extensions

- `version` changes only for incompatible changes. A reader that meets a higher
  `version` than it knows must not guess: it plays nothing and says the tours need a
  newer version of the format.
- New optional fields can appear within a version. Readers ignore fields they don't
  know.
- Tool-specific data goes under keys starting with `x-` — `"x-mytool": { … }` — on the
  file, a tour or a step.
- **Writers keep what they don't understand.** When a tool rewrites `tour.json`, it
  keeps every field it didn't set, `x-` or not, and every tour it didn't edit.
