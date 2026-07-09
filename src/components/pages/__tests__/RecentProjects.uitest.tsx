// The launcher screen: an "open folder" action plus a list of recent projects.
// react-i18next is stubbed globally (t(k) => k). The window edges that actually
// open a project / show the folder picker (openProjectHere, pickFolderAndOpen)
// are mocked so we assert wiring, not Tauri; the useRecents store is real and
// seeded per test.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { openProjectHere, pickFolderAndOpen } = vi.hoisted(() => ({
  openProjectHere: vi.fn(),
  pickFolderAndOpen: vi.fn(),
}));
vi.mock("../../../lib/window", () => ({ openProjectHere, pickFolderAndOpen }));

import { RecentProjects } from "../RecentProjects";
import { useRecents, type RecentProject } from "../../../lib/store";

const rp = (path: string, name: string): RecentProject => ({
  path,
  name,
  openedAt: 1,
});

beforeEach(() => {
  openProjectHere.mockClear();
  pickFolderAndOpen.mockClear();
  useRecents.setState({ projects: [] });
});

describe("RecentProjects", () => {
  it("renders the launcher/empty state when there are no recents", () => {
    render(<RecentProjects />);
    expect(screen.getByRole("heading", { name: "Reado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recents\.open/ })).toBeInTheDocument();
    // The empty copy, and no project rows.
    expect(screen.getByText("recents.empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "recents.remove" })).not.toBeInTheDocument();
  });

  it("lists each seeded recent with its name and path", () => {
    useRecents.setState({
      projects: [rp("/home/me/alpha", "alpha"), rp("/home/me/beta", "beta")],
    });
    render(<RecentProjects />);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("/home/me/alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("/home/me/beta")).toBeInTheDocument();
    // No empty-state copy once there are recents.
    expect(screen.queryByText("recents.empty")).not.toBeInTheDocument();
  });

  it("clicking a recent opens it by its path", async () => {
    useRecents.setState({ projects: [rp("/home/me/alpha", "alpha")] });
    render(<RecentProjects />);
    await userEvent.click(screen.getByRole("button", { name: /alpha/ }));
    expect(openProjectHere).toHaveBeenCalledTimes(1);
    expect(openProjectHere).toHaveBeenCalledWith("/home/me/alpha");
  });

  it("the remove (X) button removes the entry from the recents store", async () => {
    useRecents.setState({
      projects: [rp("/home/me/alpha", "alpha"), rp("/home/me/beta", "beta")],
    });
    render(<RecentProjects />);
    const removes = screen.getAllByRole("button", { name: "recents.remove" });
    expect(removes).toHaveLength(2);
    // First remove button belongs to the first row (alpha).
    await userEvent.click(removes[0]);
    expect(useRecents.getState().projects.map((p) => p.path)).toEqual([
      "/home/me/beta",
    ]);
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("the open-folder button triggers the folder picker/open flow", async () => {
    render(<RecentProjects />);
    await userEvent.click(screen.getByRole("button", { name: /recents\.open/ }));
    expect(pickFolderAndOpen).toHaveBeenCalledTimes(1);
    expect(openProjectHere).not.toHaveBeenCalled();
  });
});
