import { describe, it, expect } from "vitest";
import { toRelative, commentsForFile, openCount } from "../comments";
import type { Comment } from "../api";

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
});

describe("comment helpers", () => {
  it("makes paths project-relative with forward slashes", () => {
    expect(toRelative("/p", "/p/src/a.ts")).toBe("src/a.ts");
    expect(toRelative("/p", "/p/a.ts")).toBe("a.ts");
    // Already relative / outside root is passed through, normalised.
    expect(toRelative("/p", "other/a.ts")).toBe("other/a.ts");
  });

  it("filters comments to a file", () => {
    const list = [comment("src/a.ts", "open"), comment("src/b.ts", "open")];
    expect(commentsForFile(list, "src/a.ts")).toHaveLength(1);
    expect(commentsForFile(list, "src/a.ts")[0].anchor.file).toBe("src/a.ts");
  });

  it("counts only open comments", () => {
    const list = [
      comment("a", "open"),
      comment("b", "open"),
      comment("c", "in-progress"),
      comment("d", "discarded"),
    ];
    expect(openCount(list)).toBe(2);
  });
});
