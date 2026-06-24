> Runs through the **terminal agent**: it reviews `git diff` and writes proposed
> comments to `.reado/pre-review.json`; Reado lists them as drafts the human curates.
> Implemented as a separate draft store (not a new state on the shared comment
> model), so the comment schema / CLI contract is untouched.

## 1. Drafts

- [x] 1.1 `usePreReview` store: drafts `{ id, file, line, type, body }` parsed from
      `.reado/pre-review.json`; loaded on project open; persisted on approve/discard.

## 2. Run (via the agent)

- [x] 2.1 `generate()` dispatches the agent to review the current `git diff` and
      write the JSON proposals; Reado polls for them. Explicit trigger (palette +
      panel button). The agent is told NOT to modify any source file.

## 3. Curate

- [x] 3.1 `PreReviewPanel` lists drafts (type, file:line, body), click to open the
      location.
- [x] 3.2 Approve → creates a real anchored comment (`useComments.create`, kind
      task) and drops the draft; Discard → drops the draft. No auto-post.

## 4. Glue

- [x] 4.1 `prereview` Tool + panel + ActivityBar entry (with count) when drafts
      exist; palette command to run.
- [x] 4.2 EN + IT (`prereview.*`); typecheck + cargo check + build green.
