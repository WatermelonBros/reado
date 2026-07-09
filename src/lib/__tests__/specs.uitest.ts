// useSpecs store: load() groups the project's spec markdown (groupSpecs is unit-
// tested separately in specs.test.ts; here we cover the store + its error branch).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api", () => ({ listFiles: vi.fn() }));

import { useSpecs } from "../specs";
import { listFiles } from "../api";

beforeEach(() => {
  vi.clearAllMocks();
  useSpecs.setState({ groups: [] });
});

describe("load", () => {
  it("groups the listed files", async () => {
    vi.mocked(listFiles).mockResolvedValue([
      "openspec/changes/add-mvp/proposal.md",
      "openspec/specs/billing/spec.md",
    ]);
    await useSpecs.getState().load("/root");
    expect(listFiles).toHaveBeenCalledWith("/root");
    const groups = useSpecs.getState().groups;
    expect(groups.map((g) => `${g.kind}:${g.title}`)).toEqual(["change:add-mvp", "spec:billing"]);
  });

  it("resets to empty when listing throws", async () => {
    useSpecs.setState({ groups: [{ title: "stale", kind: "spec", items: [] }] });
    vi.mocked(listFiles).mockRejectedValue(new Error("no project"));
    await useSpecs.getState().load("/root");
    expect(useSpecs.getState().groups).toEqual([]);
  });
});

// Group-expansion state (`expanded` Set). Groups are collapsed by default, so a
// change shows only its name until toggled open — these guard that add/delete and
// the bulk expand/collapse actions keep the Set in sync.
describe("expansion", () => {
  beforeEach(() => useSpecs.setState({ expanded: new Set() }));

  it("toggleExpanded adds then removes a key", () => {
    const s = () => useSpecs.getState();
    s().toggleExpanded("change:add-mvp");
    expect([...s().expanded]).toEqual(["change:add-mvp"]);
    // Toggling the same key again removes it (collapse).
    s().toggleExpanded("change:add-mvp");
    expect(s().expanded.has("change:add-mvp")).toBe(false);
    expect(s().expanded.size).toBe(0);
  });

  it("toggleExpanded is independent per key", () => {
    const s = () => useSpecs.getState();
    s().toggleExpanded("change:a");
    s().toggleExpanded("spec:b");
    expect([...s().expanded].sort()).toEqual(["change:a", "spec:b"]);
    s().toggleExpanded("change:a"); // collapse only a
    expect([...s().expanded]).toEqual(["spec:b"]);
  });

  it("expandAll sets exactly the given keys", () => {
    const s = () => useSpecs.getState();
    s().toggleExpanded("stale:key"); // pre-existing expansion is replaced, not merged
    s().expandAll(["change:a", "spec:b", "change:c"]);
    expect([...s().expanded].sort()).toEqual(["change:a", "change:c", "spec:b"]);
  });

  it("collapseAll clears every expansion", () => {
    const s = () => useSpecs.getState();
    s().expandAll(["change:a", "spec:b"]);
    s().collapseAll();
    expect(s().expanded.size).toBe(0);
  });
});
