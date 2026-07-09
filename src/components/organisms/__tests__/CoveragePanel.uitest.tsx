// The Reading coverage panel (render side). The aggregation is covered in
// lib/__tests__/coverage.uitest.ts; here we verify it renders the overall figure,
// folder rows and the changed-since-read list from mocked file/read state.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { listFiles } = vi.hoisted(() => ({ listFiles: vi.fn() }));
vi.mock("../../../lib/api", () => ({ listFiles }));

import { CoveragePanel } from "../CoveragePanel";
import { useProject } from "../../../lib/store";
import { useReadProgress } from "../../../lib/readProgress";

beforeEach(() => {
  listFiles.mockReset();
  useProject.setState({ root: "/repo", treeNonce: 0, open: vi.fn() });
  useReadProgress.setState({ read: new Set(), changed: new Set() });
});

describe("CoveragePanel", () => {
  it("shows the overall percentage and a per-folder breakdown", async () => {
    listFiles.mockResolvedValue(["README.md", "src/a.ts", "src/b.ts"]);
    useReadProgress.setState({ read: new Set(["src/a.ts"]), changed: new Set() });

    render(<CoveragePanel />);

    // 1 of 3 read → 33%.
    expect(await screen.findByText("33%")).toBeInTheDocument();
    expect(screen.getByText(/1\/3/)).toBeInTheDocument();
    // The "src" folder row (largest area) appears with its 1/2 count.
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(screen.getByText("coverage.rootBucket")).toBeInTheDocument();
  });

  it("surfaces the changed-since-read list", async () => {
    listFiles.mockResolvedValue(["src/a.ts", "src/b.ts"]);
    useReadProgress.setState({ read: new Set(["src/a.ts"]), changed: new Set(["src/a.ts"]) });

    render(<CoveragePanel />);
    expect(await screen.findByText("coverage.changed")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
  });

  it("shows the empty state for a project with no readable files", async () => {
    listFiles.mockResolvedValue([]);
    render(<CoveragePanel />);
    expect(await screen.findByText("coverage.noFiles")).toBeInTheDocument();
  });
});
