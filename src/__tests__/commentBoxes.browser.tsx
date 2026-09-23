// Browser test: the comment boxes the editor floats over the code — the composer
// for a new comment, and an existing comment's thread — opened on the last line
// the editor shows, where there is the least room under it. They must stay
// inside the editor, above whatever sits below it (the bottom panel), and not
// run past its edge.

import { EditorView } from "@codemirror/view"
import { screen, waitFor } from "@testing-library/react"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { page } from "vitest/browser"
import { type Locale, useLocale } from "@/i18n"
import type { Comment } from "@/lib/api"
import { useComments } from "@/lib/comments"
import { useEditorActions, useSettings } from "@/lib/store"
import { installFakeBackend, uninstallFakeBackend } from "@/test/fakeBackend"
import { coveredBy } from "@/test/layoutChecks"
import { openFromTree, prepareWorkspace, renderApp } from "@/test/workspace"

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(() => {
  prepareWorkspace()
  installFakeBackend()
})
afterAll(() => uninstallFakeBackend())

const COMBOS: { width: number; height: number; zoom: number; locale: Locale }[] = [
  { width: 1280, height: 832, zoom: 1, locale: "en" },
  { width: 800, height: 600, zoom: 1.5, locale: "it" },
]

describe.each(COMBOS)(
  "at $width×$height, zoom $zoom, $locale",
  ({ width, height, zoom, locale }) => {
    let view: EditorView
    /** The last line fully inside the editor's visible area. */
    let lastLine: number

    beforeEach(async () => {
      await page.viewport(width, height)
      useSettings.setState({ zoom })
      useLocale.getState().setLocale(locale)
      renderApp()
      await openFromTree("src/long.ts")
      // CodeMirror splits a line into token spans, so wait on the editor, not a text.
      const editor = await waitFor(
        () => {
          const el = document.querySelector<HTMLElement>(".cm-editor")
          if (!el?.textContent?.includes("line1 =")) throw new Error("long.ts not shown yet")
          return el
        },
        { timeout: 5000 },
      )
      await wait(300)
      view = EditorView.findFromDOM(editor) as EditorView
      const bottom = view.scrollDOM.getBoundingClientRect().bottom
      const lines = [...editor.querySelectorAll(".cm-line")].filter(
        (l) => l.getBoundingClientRect().bottom <= bottom,
      )
      const last = lines[lines.length - 1]
      lastLine = view.state.doc.lineAt(view.posAtDOM(last)).number
    })

    /** The box is inside the editor's own area and nothing is painted over it. */
    function expectFits(box: HTMLElement) {
      const area = (box.offsetParent as HTMLElement).getBoundingClientRect()
      const r = box.getBoundingClientRect()
      expect(r.bottom, "runs past the editor's bottom edge").toBeLessThanOrEqual(area.bottom + 1)
      expect(r.top, "runs past the editor's top edge").toBeGreaterThanOrEqual(area.top - 1)
      expect(coveredBy(box)).toBeNull()
    }

    it("the new-comment composer opens inside the editor on its last visible line", async () => {
      view.dispatch({ selection: { anchor: view.state.doc.line(lastLine).from } })
      useEditorActions.getState().requestCompose()
      const textarea = await screen.findByPlaceholderText(
        /Leave a comment|Lascia un commento/,
        {},
        { timeout: 3000 },
      )
      await wait(200)
      expectFits(textarea.closest("div.absolute") as HTMLElement)
    })

    it("a comment's thread opens inside the editor on its last visible line", async () => {
      const now = Date.now()
      const comment: Comment = {
        id: "c-bottom",
        type: "bug",
        state: "open",
        kind: "task",
        anchor: { file: "src/long.ts", scope: "range", startLine: lastLine, endLine: lastLine },
        context: { snippet: "", before: "", after: "" },
        links: [],
        author: "me",
        orphan: false,
        createdAt: now,
        updatedAt: now,
        messages: [{ author: "me", createdAt: now, body: "Right at the bottom of the editor" }],
        archived: false,
      }
      useComments.setState({ comments: [comment] })
      useComments.getState().setActive(comment.id)
      const body = await screen.findByText(
        "Right at the bottom of the editor",
        {},
        { timeout: 3000 },
      )
      await wait(300)
      expectFits(body.closest("div.absolute") as HTMLElement)
    })
  },
)
