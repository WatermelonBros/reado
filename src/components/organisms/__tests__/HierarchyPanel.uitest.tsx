// UI test: the Hierarchy panel renders its empty/loading/unsupported states,
// lists the resolved hierarchy nodes with a direction toggle, and jumps to a
// node on click. Stores are seeded directly; the docInfo/LSP edge is mocked so
// no language server is touched.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The direction toggle calls into docInfo (→ LSP); stub that edge out.
vi.mock("../../../lib/docInfo", () => ({
  setHierarchyDirection: vi.fn(),
}));

import { HierarchyPanel } from "../HierarchyPanel";
import { useHierarchy } from "../../../lib/hierarchy";
import { useProject } from "../../../lib/store";
import type { HierNode, HierItem } from "../../../lib/lsp";

const ROOT = "/repo";

function node(over: Partial<HierNode> = {}): HierNode {
  const path = over.path ?? "src/a.ts";
  const item: HierItem = { name: over.name ?? "fn", uri: `file://${path}` };
  return { name: "fn", path, line: 10, item, ...over };
}

function seedProject() {
  const open = vi.fn();
  useProject.setState({ root: ROOT, open });
  return { open };
}

beforeEach(() => {
  useHierarchy.setState({
    mode: "call",
    direction: "incoming",
    root: null,
    results: [],
    loading: false,
    unsupported: false,
  });
});

describe("HierarchyPanel", () => {
  it("shows the unsupported state when the server lacks the capability", () => {
    seedProject();
    useHierarchy.setState({ unsupported: true });
    render(<HierarchyPanel />);
    expect(screen.getByText("hier.unsupported")).toBeInTheDocument();
  });

  it("shows the empty state when there is no root and it is not loading", () => {
    seedProject();
    render(<HierarchyPanel />);
    expect(screen.getByText("hier.empty")).toBeInTheDocument();
  });

  it("shows the loading state while resolving", () => {
    seedProject();
    useHierarchy.setState({ loading: true, root: null });
    render(<HierarchyPanel />);
    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });

  it("lists the hierarchy nodes and the direction toggle", () => {
    seedProject();
    useHierarchy.setState({
      root: node({ name: "root", path: "src/root.ts", line: 1 }),
      results: [
        node({ name: "caller-a", path: "src/a.ts", line: 10 }),
        node({ name: "caller-b", path: "src/b.ts", line: 20 }),
      ],
    });
    render(<HierarchyPanel />);

    // Root header + both nodes.
    expect(screen.getByText("root")).toBeInTheDocument();
    expect(screen.getByText("caller-a")).toBeInTheDocument();
    expect(screen.getByText("caller-b")).toBeInTheDocument();

    // The call-mode direction SegmentedControl (incoming/outgoing).
    expect(screen.getByText("hier.incoming")).toBeInTheDocument();
    expect(screen.getByText("hier.outgoing")).toBeInTheDocument();
  });

  it("shows the no-results row when a root resolved with no children", () => {
    seedProject();
    useHierarchy.setState({ root: node({ name: "root" }), results: [] });
    render(<HierarchyPanel />);
    expect(screen.getByText("hier.none")).toBeInTheDocument();
  });

  it("clicking a node opens it at its line", async () => {
    const { open } = seedProject();
    useHierarchy.setState({
      root: node({ name: "root" }),
      results: [node({ name: "caller-a", path: "src/a.ts", line: 42 })],
    });
    render(<HierarchyPanel />);

    await userEvent.click(screen.getByText("caller-a"));
    expect(open).toHaveBeenCalledWith("src/a.ts", 42);
  });
});
