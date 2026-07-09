// Reading-coverage aggregation (pure). Runs on all 3 OSes.
import { describe, it, expect } from "vitest";
import { computeCoverage } from "../coverage";

const files = [
  "README.md",
  "package.json",
  "src/a.ts",
  "src/b.ts",
  "src/nested/c.ts",
  "docs/guide.md",
];

describe("computeCoverage", () => {
  it("counts overall read/total and percentage", () => {
    const cov = computeCoverage(files, new Set(["src/a.ts", "README.md", "docs/guide.md"]), new Set());
    expect(cov.total).toBe(6);
    expect(cov.read).toBe(3);
    expect(cov.pct).toBe(50);
  });

  it("groups by top-level folder, largest area first, with a root bucket", () => {
    const cov = computeCoverage(files, new Set(["src/a.ts"]), new Set());
    // src has 3 files (a, b, nested/c) → largest; then root (2) and docs (1)
    expect(cov.folders[0]).toMatchObject({ path: "src", total: 3, read: 1 });
    const root = cov.folders.find((f) => f.path === "");
    expect(root).toMatchObject({ total: 2, read: 0 });
    const docs = cov.folders.find((f) => f.path === "docs");
    expect(docs).toMatchObject({ total: 1, read: 0 });
  });

  it("reports a fully-read area at 100%", () => {
    const cov = computeCoverage(files, new Set(["docs/guide.md"]), new Set());
    const docs = cov.folders.find((f) => f.path === "docs")!;
    expect(docs.read).toBe(docs.total);
  });

  it("lists changed-since-read only for files still in the tree", () => {
    const cov = computeCoverage(
      files,
      new Set(["src/a.ts", "src/b.ts"]),
      new Set(["src/a.ts", "deleted/old.ts"]),
    );
    expect(cov.changed).toEqual(["src/a.ts"]); // the deleted one is dropped
  });

  it("handles an empty project without dividing by zero", () => {
    const cov = computeCoverage([], new Set(), new Set());
    expect(cov).toMatchObject({ total: 0, read: 0, pct: 0 });
    expect(cov.folders).toEqual([]);
  });
});
