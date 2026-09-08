// File-tree ordering and the on-screen filter. Both are pure, and both have an
// invariant that is easy to break by accident: directories come first in every
// mode, and an expanded directory is never filtered out from under the subtree
// it is showing.
import { describe, expect, it } from "vitest"
import type { DirEntry } from "@/lib/api"
import { filterEntries, sortEntries } from "@/lib/treeSort"

const file = (name: string, modified?: number): DirEntry => ({
  name,
  path: `/p/${name}`,
  isDir: false,
  modified,
})
const dir = (name: string): DirEntry => ({ name, path: `/p/${name}`, isDir: true })
const names = (entries: DirEntry[]) => entries.map((e) => e.name)

describe("sortEntries", () => {
  it("puts directories first in every mode", () => {
    const entries = [file("a.ts", 3), dir("z"), file("b.ts", 1), dir("a")]
    for (const mode of ["name", "type", "modified"] as const) {
      const sorted = sortEntries(entries, mode)
      expect(
        sorted.slice(0, 2).every((e) => e.isDir),
        mode,
      ).toBe(true)
    }
  })

  it("orders by name naturally, so file10 follows file9", () => {
    expect(names(sortEntries([file("file10.ts"), file("file9.ts")], "name"))).toEqual([
      "file9.ts",
      "file10.ts",
    ])
  })

  it("groups by extension in type mode, and by name inside each group", () => {
    const entries = [file("b.ts"), file("a.css"), file("a.ts"), file("b.css")]
    expect(names(sortEntries(entries, "type"))).toEqual(["a.css", "b.css", "a.ts", "b.ts"])
  })

  it("treats a dotfile's name as a name, not an extension", () => {
    // `.gitignore` has no extension: the leading dot is part of the name, so it
    // must not be grouped with `*.gitignore`-alikes.
    const entries = [file("a.ts"), file(".gitignore")]
    expect(names(sortEntries(entries, "type"))).toEqual([".gitignore", "a.ts"])
  })

  it("puts the newest first in modified mode, with unknown times last", () => {
    const entries = [file("old.ts", 10), file("unknown.ts"), file("new.ts", 99)]
    expect(names(sortEntries(entries, "modified"))).toEqual(["new.ts", "old.ts", "unknown.ts"])
  })

  it("does not mutate what it is given", () => {
    const entries = [file("b.ts"), file("a.ts")]
    sortEntries(entries, "name")
    expect(names(entries)).toEqual(["b.ts", "a.ts"])
  })
})

describe("filterEntries", () => {
  const never = () => false

  it("passes everything through for an empty filter", () => {
    const entries = [file("a.ts"), dir("src")]
    expect(filterEntries(entries, "   ", never)).toBe(entries)
  })

  it("matches case-insensitively, anywhere in the name", () => {
    const entries = [file("Reader.tsx"), file("writer.ts")]
    expect(names(filterEntries(entries, "READ", never))).toEqual(["Reader.tsx"])
    expect(names(filterEntries(entries, "ite", never))).toEqual(["writer.ts"])
  })

  it("keeps an expanded directory even when its own name doesn't match", () => {
    // Otherwise the folder disappears and takes the matching rows inside it with
    // it — the filter would hide exactly what it just found.
    const entries = [dir("src"), dir("dist"), file("a.ts")]
    const expanded = (e: DirEntry) => e.name === "src"
    expect(names(filterEntries(entries, "zzz", expanded))).toEqual(["src"])
  })
})
