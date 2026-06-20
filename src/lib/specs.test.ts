import { describe, it, expect } from "vitest";
import { groupSpecs } from "./specs";

describe("groupSpecs", () => {
  it("groups OpenSpec changes and specs, well-known files first", () => {
    const groups = groupSpecs([
      "src/main.ts",
      "openspec/changes/add-mvp/tasks.md",
      "openspec/changes/add-mvp/proposal.md",
      "openspec/changes/add-mvp/specs/cli/spec.md",
      "openspec/specs/auth/spec.md",
      "README.md",
    ]);

    expect(groups.map((g) => `${g.kind}:${g.title}`)).toEqual([
      "change:add-mvp",
      "spec:auth",
    ]);
    // proposal.md ranks before tasks.md; the nested spec comes last.
    expect(groups[0].items.map((i) => i.label)).toEqual([
      "proposal.md",
      "tasks.md",
      "specs/cli/spec.md",
    ]);
  });

  it("returns nothing for a project without specs", () => {
    expect(groupSpecs(["src/a.ts", "docs/readme.md"])).toEqual([]);
  });
});
