// The custom window title bar. We force a non-mac OS so the Win/Linux branch
// renders the min/max/close controls (macOS uses native traffic lights and shows
// none). currentOS is read at module load, so it is mocked before importing the
// component. getCurrentWindow returns one shared window object with spied
// controls; MenuBar and the opener plugin are stubbed to keep the test on the
// button wiring. react-i18next is stubbed globally (t(k) => k), so titles equal
// their keys.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../../lib/extensions", () => ({ currentOS: () => "windows" }));

const { win } = vi.hoisted(() => ({
  win: {
    minimize: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(false)),
    onResized: vi.fn(() => Promise.resolve(() => {})),
    setDecorations: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("../../molecules/MenuBar", () => ({ MenuBar: () => <div data-testid="menu-bar" /> }));

import { TitleBar } from "../TitleBar";

beforeEach(() => {
  win.minimize.mockClear();
  win.toggleMaximize.mockClear();
  win.close.mockClear();
});

describe("TitleBar", () => {
  it("renders the given project name in the command-center pill", () => {
    render(<TitleBar projectName="my-project" />);
    expect(screen.getByText("my-project")).toBeInTheDocument();
  });

  it("falls back to the Reado label when no project name is given", () => {
    render(<TitleBar projectName={null} />);
    expect(screen.getByText("Reado")).toBeInTheDocument();
  });

  it("the minimize button minimizes the window", async () => {
    render(<TitleBar projectName="my-project" />);
    await userEvent.click(screen.getByTitle("window.minimize"));
    expect(win.minimize).toHaveBeenCalledTimes(1);
  });

  it("the maximize button toggles the window maximize state", async () => {
    render(<TitleBar projectName="my-project" />);
    await userEvent.click(screen.getByTitle("window.maximize"));
    expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("the close button closes the window", async () => {
    render(<TitleBar projectName="my-project" />);
    await userEvent.click(screen.getByTitle("window.close"));
    expect(win.close).toHaveBeenCalledTimes(1);
  });
});
