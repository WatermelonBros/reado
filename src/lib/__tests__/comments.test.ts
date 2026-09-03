import { describe, expect, it } from "vitest"
import type { Comment } from "@/lib/api"
import { commentsForFile, openCount, toRelative } from "@/lib/comments"

const comment = (file: string, state: Comment["state"]): Comment => ({
  id: file + state,
  type: "note",
  state,
  kind: "task",
  anchor: { file, scope: "range", startLine: 1, endLine: 1 },
  context: { snippet: "", before: "", after: "" },
  links: [],
  author: "user",
  orphan: false,
  createdAt: 0,
  updatedAt: 0,
  messages: [{ author: "user", createdAt: 0, body: "x" }],
  archived: false,
})

describe("comment helpers", () => {
  it("makes paths project-relative with forward slashes", () => {
    expect(toRelative("/p", "/p/src/a.ts")).toBe("src/a.ts")
    expect(toRelative("/p", "/p/a.ts")).toBe("a.ts")
    // Already relative / outside root is passed through, normalised.
    expect(toRelative("/p", "other/a.ts")).toBe("other/a.ts")
  })

  it("doesn't claim a sibling directory that shares the root's prefix", () => {
    // Without the trailing separator, `/home/me/proj-backup/a.ts` would come
    // back as `-backup/a.ts` and anchor every comment to a path that isn't in
    // the project.
    // Passed through unchanged (bar the leading separator every result drops)
    // — emphatically not the "-backup/a.ts" a prefix match would produce.
    expect(toRelative("/home/me/proj", "/home/me/proj-backup/a.ts")).toBe(
      "home/me/proj-backup/a.ts",
    )
    // A root that already ends in a separator behaves the same.
    expect(toRelative("/home/me/proj/", "/home/me/proj-backup/a.ts")).toBe(
      "home/me/proj-backup/a.ts",
    )
    // …and a Windows root, whose separator is the other one.
    expect(toRelative("C:\\repo", "C:\\repo\\src\\a.ts")).toBe("src/a.ts")
    expect(toRelative("C:\\repo", "C:\\repo-backup\\a.ts")).toBe("C:/repo-backup/a.ts")
  })

  it("filters comments to a file", () => {
    const list = [comment("src/a.ts", "open"), comment("src/b.ts", "open")]
    expect(commentsForFile(list, "src/a.ts")).toHaveLength(1)
    expect(commentsForFile(list, "src/a.ts")[0].anchor.file).toBe("src/a.ts")
  })

  it("counts only open comments", () => {
    const list = [
      comment("a", "open"),
      comment("b", "open"),
      comment("c", "in-progress"),
      comment("d", "discarded"),
    ]
    expect(openCount(list)).toBe(2)
  })
})
