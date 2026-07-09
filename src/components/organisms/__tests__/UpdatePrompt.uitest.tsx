// Custom in-app update experience: the available-update modal (notes + later /
// install), the dismissed "update available" indicator, and the auto-dismissing
// toast. The store's async install is stubbed via setState so nothing touches the
// real updater/process plugins; those plugins and i18n are mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({}));

import { UpdatePrompt } from "../UpdatePrompt";
import { useUpdate } from "../../../lib/update";

// A minimal stand-in for the Tauri `Update` handle.
const fakeUpdate = { version: "1.2.3", body: "release notes" } as never;

beforeEach(() => {
  useUpdate.setState({
    update: null,
    version: null,
    notes: null,
    open: false,
    dismissed: false,
    installing: false,
    toast: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("UpdatePrompt", () => {
  it("renders nothing when there is no update", () => {
    render(<UpdatePrompt />);
    expect(screen.queryByText("update.title")).not.toBeInTheDocument();
    expect(screen.queryByText("update.indicator")).not.toBeInTheDocument();
  });

  it("shows the modal with version, notes, and actions when open", () => {
    useUpdate.setState({ update: fakeUpdate, version: "1.2.3", notes: "## What's new", open: true });
    render(<UpdatePrompt />);
    expect(screen.getByRole("heading", { name: "update.title" })).toBeInTheDocument();
    expect(screen.getByText("update.available")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What's new" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "update.install" })).toBeInTheDocument();
  });

  it("the Later button dismisses the modal and leaves the indicator", async () => {
    useUpdate.setState({ update: fakeUpdate, version: "1.2.3", open: true });
    render(<UpdatePrompt />);
    // Both the header X (aria-label) and the footer button carry "update.later".
    const [closeBtn] = screen.getAllByRole("button", { name: "update.later" });
    await userEvent.click(closeBtn);
    expect(useUpdate.getState().open).toBe(false);
    expect(useUpdate.getState().dismissed).toBe(true);
    // Indicator now shows (available + dismissed + not open).
    expect(screen.getByText("update.indicator")).toBeInTheDocument();
  });

  it("the Install button triggers the install action", async () => {
    const install = vi.fn();
    useUpdate.setState({ update: fakeUpdate, version: "1.2.3", open: true, install });
    render(<UpdatePrompt />);
    await userEvent.click(screen.getByRole("button", { name: "update.install" }));
    expect(install).toHaveBeenCalledOnce();
  });

  it("clicking the dismissed indicator reopens the modal", async () => {
    useUpdate.setState({ update: fakeUpdate, version: "1.2.3", open: false, dismissed: true });
    render(<UpdatePrompt />);
    await userEvent.click(screen.getByRole("button", { name: "update.indicator" }));
    expect(useUpdate.getState().open).toBe(true);
  });

  it("renders a status toast and auto-dismisses it after the timeout", () => {
    vi.useFakeTimers();
    useUpdate.setState({ toast: { kind: "info", text: "Up to date" } });
    render(<UpdatePrompt />);
    expect(screen.getByRole("status")).toHaveTextContent("Up to date");
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(useUpdate.getState().toast).toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("styles an error toast distinctly from an info toast", () => {
    // Error tone: the marker colour + the strong border.
    useUpdate.setState({ toast: { kind: "error", text: "Boom" } });
    const { unmount } = render(<UpdatePrompt />);
    const errorToast = screen.getByRole("status");
    expect(errorToast).toHaveTextContent("Boom");
    expect(errorToast.className).toContain("text-marker");
    expect(errorToast.className).toContain("border-line-strong");
    expect(errorToast.className).not.toContain("text-ink");
    unmount();

    // Info tone: the neutral ink colour, never the error marker / strong border.
    // (An error↔info regression flips exactly these classes, so it fails here.)
    useUpdate.setState({ toast: { kind: "info", text: "Up to date" } });
    render(<UpdatePrompt />);
    const infoToast = screen.getByRole("status");
    expect(infoToast).toHaveTextContent("Up to date");
    expect(infoToast.className).toContain("text-ink");
    expect(infoToast.className).not.toContain("text-marker");
    expect(infoToast.className).not.toContain("border-line-strong");
  });
});
