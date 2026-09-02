// The two git signals that sit in the editor: the cursor-line blame annotation
// and the changed-line gutter. Both are thin builders over data the backend
// already returns, so the tests are about what they choose to say (and not say).
import { describe, expect, it } from "vitest"
import type { BlameLine } from "@/lib/api"
import { inlineBlameText } from "@/lib/blameGutter"
import { diffGutter } from "@/lib/changedLines"

const line = (over: Partial<BlameLine> = {}): BlameLine => ({
  line: 1,
  hash: "abc1234",
  author: "Matteo Poli",
  time: Math.floor(Date.now() / 1000) - 3 * 86400,
  summary: "Fix the anchor drift",
  ...over,
})

describe("inline blame text", () => {
  it("names the author by first name, the age, and the commit subject", () => {
    expect(inlineBlameText(line())).toBe("Matteo · 3d · Fix the anchor drift")
  })

  it("says an uncommitted line is yours, without inventing a commit", () => {
    const text = inlineBlameText(line({ hash: "0000000000000000000000000000000000000000" }))
    expect(text).toBe("You · uncommitted")
  })

  it("has nothing to say about a line with no blame", () => {
    expect(inlineBlameText(undefined)).toBeNull()
  })

  it("falls back to the whole author when there is no first name to take", () => {
    expect(inlineBlameText(line({ author: "dependabot[bot]" }))).toContain("dependabot[bot]")
  })
})

describe("diff gutter", () => {
  it("adds nothing at all when the file matches HEAD", () => {
    // Not an empty gutter column — no gutter, so the editor keeps its width.
    expect(diffGutter([])).toEqual([])
  })

  it("builds a gutter once there is a range to mark", () => {
    expect(diffGutter([[3, 5]])).not.toEqual([])
  })
})
