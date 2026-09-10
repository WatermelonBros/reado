// UI test: the results editor is a CodeMirror view created into a host that
// `Modal` (Ark, `lazyMount`) mounts a commit *after* `open` turns true. Keying
// its creation on a `useRef` meant it was never created at all — the dialog
// opened with a header, a hint and "Apply 0 changes" over an empty box.
//
// jsdom does not reproduce that ordering (the ref is already set by the time
// effects run here), so this guards the outcome rather than the race: if the
// dialog ever opens without its editor again, this fails. The race itself was
// caught by driving the real app.

import { render, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SearchResultsEditor } from "@/components/organisms/SearchResultsEditor"
import type { SearchMatch } from "@/lib/api"

const MATCHES: SearchMatch[] = [
  { path: "/repo/src/a.ts", line: 3, column: 0, text: "const greet = 1" },
  { path: "/repo/src/b.ts", line: 9, column: 0, text: "greet()" },
]

describe("the search results editor", () => {
  it("puts the matching lines on screen when it opens", async () => {
    render(<SearchResultsEditor matches={MATCHES} open onClose={() => {}} onApplied={() => {}} />)
    await waitFor(() => {
      const cm = document.querySelector(".cm-content")
      expect(cm, "no editor was created inside the dialog").toBeTruthy()
      expect(cm?.textContent).toContain("greet")
    })
  })
})
