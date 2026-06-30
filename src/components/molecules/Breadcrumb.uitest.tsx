// The active-file breadcrumb: path segments, nav back/forward (with disabled
// edges), the dirty dot, and the synopsis / blame / diff toggles gated on git
// and diff state. Stores are real; the Tauri edge and synopsis side effect are
// stubbed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const { gitRefs } = vi.hoisted(() => ({
  gitRefs: vi.fn(async () => ({ branches: ["main"], commits: [] })),
}));
vi.mock("../../lib/api", () => ({ gitRefs }));

import { Breadcrumb } from "./Breadcrumb";
import { useProject, useEditorActions } from "../../lib/store";
import { useSynopsis } from "../../lib/synopsis";

function setProject(over: Partial<ReturnType<typeof useProject.getState>> = {}) {
  useProject.setState({
    root: "/repo",
    active: "/repo/src/app/main.ts",
    git: { isRepo: true, branch: "main" },
    navStack: [{ path: "/repo/src/app/main.ts" }],
    navIndex: 0,
    ...over,
  });
}

beforeEach(() => {
  gitRefs.mockClear();
  useEditorActions.setState({
    diffing: false,
    diffBase: "HEAD",
    blame: false,
    dirty: false,
  });
  useSynopsis.setState({ show: vi.fn() });
  setProject();
});

describe("Breadcrumb", () => {
  it("renders nothing without an active file", () => {
    setProject({ active: null });
    const { container } = render(<Breadcrumb />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each relative path segment", () => {
    render(<Breadcrumb />);
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(screen.getByText("app")).toBeInTheDocument();
    expect(screen.getByText("main.ts")).toBeInTheDocument();
  });

  it("disables back at the start of history and forward at the end", () => {
    render(<Breadcrumb />);
    expect(screen.getByRole("button", { name: "nav.back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "nav.forward" })).toBeDisabled();
  });

  it("enables back when there is earlier history and navigates", async () => {
    setProject({
      navStack: [{ path: "/repo/a.ts" }, { path: "/repo/src/app/main.ts" }],
      navIndex: 1,
    });
    render(<Breadcrumb />);
    const back = screen.getByRole("button", { name: "nav.back" });
    expect(back).toBeEnabled();
    await userEvent.click(back);
    expect(useProject.getState().navIndex).toBe(0);
  });

  it("shows the dirty dot only when there are unsaved changes", () => {
    const { rerender } = render(<Breadcrumb />);
    expect(screen.queryByTitle("Unsaved changes")).not.toBeInTheDocument();
    useEditorActions.setState({ dirty: true });
    rerender(<Breadcrumb />);
    expect(screen.getByTitle("Unsaved changes")).toBeInTheDocument();
  });

  it("opens the synopsis for the active file", async () => {
    render(<Breadcrumb />);
    await userEvent.click(screen.getByRole("button", { name: "synopsis.open" }));
    expect(useSynopsis.getState().show).toHaveBeenCalledWith("src/app/main.ts");
  });

  it("toggles blame on (git repo, not diffing)", async () => {
    render(<Breadcrumb />);
    const blame = screen.getByRole("button", { name: "blame.toggle" });
    expect(blame).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(blame);
    expect(useEditorActions.getState().blame).toBe(true);
  });

  it("toggles diff on, which loads diff refs", async () => {
    render(<Breadcrumb />);
    await userEvent.click(screen.getByRole("button", { name: "diff.toggle" }));
    expect(useEditorActions.getState().diffing).toBe(true);
    expect(gitRefs).toHaveBeenCalledWith("/repo");
  });

  it("hides git-only controls when the project is not a repo", () => {
    setProject({ git: { isRepo: false, branch: null } });
    render(<Breadcrumb />);
    expect(screen.queryByRole("button", { name: "blame.toggle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "diff.toggle" })).not.toBeInTheDocument();
    // The non-git synopsis affordance still shows.
    expect(screen.getByRole("button", { name: "synopsis.open" })).toBeInTheDocument();
  });

  it("while diffing, swaps the synopsis button for the diff-base picker", () => {
    useEditorActions.setState({ diffing: true });
    render(<Breadcrumb />);
    // The synopsis affordance is replaced by the diff-base Select (labelled via
    // ariaLabel), while the diff toggle itself stays available.
    expect(screen.queryByRole("button", { name: "synopsis.open" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("diff.base")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "diff.toggle" })).toBeInTheDocument();
  });
});
