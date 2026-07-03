// The resolve-loop status bar reflects a running batch's progress and status
// tone, and hides entirely when no loop is active. Drives the real Zustand
// store; the Tauri edge (persistence/publish) is mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// resolveLoop's clear() persists via these api wrappers; stub the Tauri edge.
vi.mock("../../../lib/api", () => ({
  createFile: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
  readFile: vi.fn(async () => null),
  anywherePublishLoop: vi.fn(async () => {}),
}));

import { ResolveLoopBar } from "../ResolveLoopBar";
import { useResolveLoop, type LoopState } from "../../../lib/resolveLoop";
import { useProject } from "../../../lib/store";

const loop = (over: Partial<LoopState> = {}): LoopState => ({
  ids: ["a", "b", "c", "d"],
  resolvedIds: ["a", "b"],
  status: "running",
  startedAt: 0,
  lastProgressAt: 0,
  ...over,
});

beforeEach(() => {
  useProject.setState({ root: "/repo" });
  useResolveLoop.setState({ active: null });
});

describe("ResolveLoopBar", () => {
  it("renders nothing when no loop is active", () => {
    const { container } = render(<ResolveLoopBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows running progress and the cancel action", () => {
    useResolveLoop.setState({ active: loop() });
    render(<ResolveLoopBar />);
    expect(screen.getByText("loop.running")).toBeInTheDocument();
    expect(screen.getByText("loop.progress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "loop.cancel" })).toBeInTheDocument();
  });

  it("shows the needs-approval state with a hint", () => {
    useResolveLoop.setState({ active: loop({ status: "needs_approval" }) });
    render(<ResolveLoopBar />);
    expect(screen.getByText("loop.needsApproval")).toBeInTheDocument();
    expect(screen.getByText("loop.hint")).toBeInTheDocument();
  });

  it("shows the finished state with a dismiss action and no hint", () => {
    useResolveLoop.setState({
      active: loop({ status: "finished", resolvedIds: ["a", "b", "c", "d"] }),
    });
    render(<ResolveLoopBar />);
    expect(screen.getByText("loop.finished")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "loop.dismiss" })).toBeInTheDocument();
    expect(screen.queryByText("loop.hint")).not.toBeInTheDocument();
  });

  it("clears the loop when the action is clicked", async () => {
    useResolveLoop.setState({ active: loop() });
    render(<ResolveLoopBar />);
    await userEvent.click(screen.getByRole("button", { name: "loop.cancel" }));
    expect(useResolveLoop.getState().active).toBeNull();
  });
});
