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
