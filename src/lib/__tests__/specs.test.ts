import { describe, it, expect } from "vitest";
import { groupSpecs } from "../specs";

describe("groupSpecs", () => {
  it("groups changes (docs + capability specs) and standalone specs", () => {
    const groups = groupSpecs([
      "src/main.ts",
      "openspec/changes/add-mvp/tasks.md",
      "openspec/changes/add-mvp/proposal.md",
      "openspec/changes/add-mvp/specs/cli/spec.md",
      "openspec/changes/add-mvp/specs/auth/spec.md",
      "openspec/specs/billing/spec.md",
      "README.md",
    ]);

    expect(groups.map((g) => `${g.kind}:${g.title}`)).toEqual([
      "change:add-mvp",
      "spec:billing",
    ]);
    // Documents first (proposal → tasks), then capability specs A→Z by name.
    expect(groups[0].items.map((i) => i.label)).toEqual([
      "proposal.md",
      "tasks.md",
      "auth",
      "cli",
    ]);
    expect(groups[0].items.map((i) => i.isSpec)).toEqual([false, false, true, true]);
  });

  it("supports speckit features (top-level specs/ + .specify/)", () => {
    const groups = groupSpecs([
      "src/app.ts",
      "specs/001-login/tasks.md",
      "specs/001-login/spec.md",
      "specs/001-login/plan.md",
      ".specify/memory/constitution.md",
    ]);
    expect(groups.map((g) => `${g.kind}:${g.title}`)).toEqual([
      "change:001-login",
      "spec:memory",
    ]);
    // spec → plan → tasks order.
    expect(groups[0].items.map((i) => i.label)).toEqual(["spec.md", "plan.md", "tasks.md"]);
    expect(groups[1].items.map((i) => i.label)).toEqual(["constitution.md"]);
  });

  it("does not treat a bare specs/ folder as speckit", () => {
    // No .specify and no plan.md → not a speckit plan, so ignore it.
    expect(groupSpecs(["specs/notes/spec.md", "src/a.ts"])).toEqual([]);
  });

  it("returns nothing for a project without specs", () => {
    expect(groupSpecs(["src/a.ts", "docs/readme.md"])).toEqual([]);
  });
});
