// The find bar's "3 of 17": which match is selected, of how many, counting no
// further than the cap so a huge document never costs a full scan per keystroke.
import { SearchQuery } from "@codemirror/search"
import { EditorSelection, EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"
import { countMatches } from "@/lib/searchScope"

const at = (doc: string, from: number, to: number) =>
  EditorState.create({ doc, selection: EditorSelection.single(from, to) })

describe("countMatches", () => {
  const q = new SearchQuery({ search: "ab" })

  it("counts every match, and says which one is selected", () => {
    // "ab ab ab": the selection is on the second one.
    expect(countMatches(at("ab ab ab", 3, 5), q, 1000)).toEqual({
      current: 2,
      total: 3,
      capped: false,
    })
  })

  it("reads 0 of n when the selection is not a match", () => {
    expect(countMatches(at("ab ab", 0, 0), q, 1000)).toEqual({
      current: 0,
      total: 2,
      capped: false,
    })
  })

  it("stops at the cap and says so", () => {
    expect(countMatches(at("ab ab ab ab", 0, 2), q, 2)).toEqual({
      current: 1,
      total: 2,
      capped: true,
    })
  })

  it("finds nothing in a document without the text", () => {
    expect(countMatches(at("xyz", 0, 0), q, 1000)).toEqual({
      current: 0,
      total: 0,
      capped: false,
    })
  })
})
