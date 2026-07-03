// Call/type hierarchy panel store: just the defaults + the generic set patch.
import { describe, it, expect, beforeEach } from "vitest";
import { useHierarchy } from "../hierarchy";
import type { HierNode } from "../lsp";

const node = (name: string): HierNode =>
  ({ name } as unknown as HierNode);

beforeEach(() =>
  useHierarchy.setState({
    mode: "call",
    direction: "incoming",
    root: null,
    results: [],
    loading: false,
    unsupported: false,
  }),
);

describe("useHierarchy", () => {
  it("has sensible defaults", () => {
    const s = useHierarchy.getState();
    expect(s.mode).toBe("call");
    expect(s.direction).toBe("incoming");
    expect(s.root).toBeNull();
    expect(s.results).toEqual([]);
    expect(s.loading).toBe(false);
    expect(s.unsupported).toBe(false);
  });

  it("applies a partial patch via set", () => {
    useHierarchy.getState().set({ mode: "type", direction: "super", loading: true });
    const s = useHierarchy.getState();
    expect(s.mode).toBe("type");
    expect(s.direction).toBe("super");
    expect(s.loading).toBe(true);
    // untouched keys keep their value
    expect(s.unsupported).toBe(false);
  });

  it("can set the root + results and the unsupported flag", () => {
    const root = node("foo");
    useHierarchy.getState().set({ root, results: [node("a"), node("b")], unsupported: true });
    const s = useHierarchy.getState();
    expect(s.root).toBe(root);
    expect(s.results).toHaveLength(2);
    expect(s.unsupported).toBe(true);
  });
});
