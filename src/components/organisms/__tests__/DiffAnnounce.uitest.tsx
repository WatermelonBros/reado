// How a changed region is counted for the announcement. Caught in the running
// app: every count was one too high, because a chunk's end offset points past
// its trailing newline and the untouched line after it was being counted.
// Nothing on screen shows this number, so only an assertion can hold it.
import { Text } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import { chunkLines } from "@/components/organisms/DiffView"

const doc = (s: string) => Text.of(s.split("\n"))

describe("counting a changed region's lines", () => {
  it("counts one line when the chunk is one line and its newline", () => {
    const d = doc("alpha\nbravo\ncharlie\n")
    // "alpha\n" — offsets 0..6, where 6 is the start of "bravo".
    expect(chunkLines(d, 0, 6)).toBe(1)
  })

  it("counts two lines when the chunk spans two", () => {
    const d = doc("alpha\nbravo\ncharlie\n")
    expect(chunkLines(d, 0, 12)).toBe(2)
  })

  it("counts nothing for an empty chunk — a pure insertion has no other side", () => {
    const d = doc("alpha\nbravo\n")
    expect(chunkLines(d, 6, 6)).toBe(0)
  })

  it("counts a chunk that runs to the end of a document with no trailing newline", () => {
    const d = doc("alpha\nbravo")
    expect(chunkLines(d, 6, d.length)).toBe(1)
  })

  it("does not run past the end when the offset would", () => {
    const d = doc("alpha\n")
    expect(chunkLines(d, 0, 9_999)).toBe(1)
  })
})
