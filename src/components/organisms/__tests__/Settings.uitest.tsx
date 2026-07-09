// The Settings drawer (Ark Dialog + a vertical SegmentedControl of tabs). i18n is
// stubbed globally (t(k) => k). The settings/palette stores are the real ones —
// we assert against them — while every Tauri/lib side effect the component pulls
// in is mocked so import never touches a missing webview host. Ark's dialog
// content only mounts under REAL timers, so we open it and `await findBy…`.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- Tauri / lib edges the component imports (mocked at module load) ----------
const { getVersion, installCli, cliInstalled, checkForUpdates, logPath, makeDefaultApp, revealItemInDir, tourRun } =
  vi.hoisted(() => ({
    getVersion: vi.fn(async () => "1.2.3"),
    installCli: vi.fn(async () => "/home/u/.local/bin/reado"),
    cliInstalled: vi.fn(async () => false),
    checkForUpdates: vi.fn(async () => {}),
    logPath: vi.fn(async () => "/tmp/reado.log"),
    makeDefaultApp: vi.fn(async () => {}),
    revealItemInDir: vi.fn(async () => {}),
    tourRun: vi.fn(),
  }));

vi.mock("@tauri-apps/api/app", () => ({ getVersion }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir }));
vi.mock("../../../lib/api", () => ({ installCli, cliInstalled }));
vi.mock("../../../lib/updater", () => ({ checkForUpdates }));
vi.mock("../../../lib/logger", () => ({ logPath }));
vi.mock("../../../lib/defaults", () => ({ makeDefaultApp }));
vi.mock("../../../lib/tour", () => ({ useTourGuide: { getState: () => ({ run: tourRun }) } }));

import { Settings } from "../Settings";
import { usePalette, useSettings } from "../../../lib/store";

beforeEach(() => {
  usePalette.setState({ settingsOpen: true });
});

describe("Settings", () => {
  it("renders the tab rail and the Appearance tab by default when open", async () => {
    render(<Settings />);

    // The drawer header mounts (real timers → Ark dialog content is present).
    expect(await screen.findByRole("heading", { name: "settings.title" })).toBeInTheDocument();

    // The vertical tab rail carries every tab label.
    for (const key of [
      "settings.tabs.appearance",
      "settings.tabs.editor",
      "settings.tabs.interface",
      "settings.tabs.files",
      "settings.tabs.system",
    ]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }

    // Appearance content is shown by default (theme-mode + language fields).
    expect(screen.getByText("settings.themeMode")).toBeInTheDocument();
    expect(screen.getByText("settings.language")).toBeInTheDocument();
    // …and no Editor-only control has mounted yet.
    expect(screen.queryByText("settings.fontSize")).not.toBeInTheDocument();
  });

  it("switches tabs — clicking Editor reveals Editor-only controls", async () => {
    render(<Settings />);

    await userEvent.click(await screen.findByText("settings.tabs.editor"));

    // A field unique to the Editor tab appears; the Appearance-only field is gone.
    expect(await screen.findByText("settings.fontSize")).toBeInTheDocument();
    expect(screen.getByText("settings.ruler")).toBeInTheDocument();
    expect(screen.queryByText("settings.themeMode")).not.toBeInTheDocument();
  });

  it("changing a control updates useSettings", async () => {
    useSettings.getState().set({ wrap: true });
    render(<Settings />);

    // Go to the Editor tab, then toggle the "wrap" checkbox off.
    await userEvent.click(await screen.findByText("settings.tabs.editor"));
    const wrap = await screen.findByRole("checkbox", { name: "editor.wrap" });
    await userEvent.click(wrap);

    expect(useSettings.getState().wrap).toBe(false);
  });

  it("the close button toggles the drawer shut", async () => {
    render(<Settings />);

    await userEvent.click(await screen.findByRole("button", { name: "settings.close" }));

    expect(usePalette.getState().settingsOpen).toBe(false);
  });
});
