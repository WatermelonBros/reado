// The first-run "make Reado the default app" prompt. It self-opens (after a short
// mount delay) only on the main window, in production builds, and only until the
// user has dealt with it once (the persisted `defaultAppsDismissed` flag). The
// settings store is real; the side effects (makeDefaultApp) and the Tauri window
// api are mocked, and `import.meta.env.PROD` is stubbed on. i18n is stubbed
// globally (t(k) => k).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { makeDefaultApp } = vi.hoisted(() => ({ makeDefaultApp: vi.fn(async () => {}) }));
vi.mock("../../../lib/defaults", () => ({ makeDefaultApp }));

const { windowLabel } = vi.hoisted(() => ({ windowLabel: { value: "main" } }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: windowLabel.value }),
}));

import { DefaultAppPrompt } from "../DefaultAppPrompt";
import { useSettings } from "../../../lib/store";

// Fire the ~1.5s mount timer under fake timers, then hand back to real timers so
// Ark's dialog machine mounts the portal content (it doesn't advance under faked
// timers). Interactions/assertions then run against the open modal.
async function renderAndOpen() {
  render(<DefaultAppPrompt />);
  act(() => {
    vi.advanceTimersByTime(1600);
  });
  vi.useRealTimers();
}

beforeEach(() => {
  makeDefaultApp.mockClear();
  windowLabel.value = "main";
  vi.stubEnv("PROD", true);
  useSettings.setState({ defaultAppsDismissed: false });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("DefaultAppPrompt", () => {
  it("opens on the main production window when not yet dismissed", async () => {
    await renderAndOpen();
    expect(await screen.findByText("defaultApp.title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "defaultApp.set" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "defaultApp.later" })).toBeInTheDocument();
  });

  it("stays closed once the choice has been dismissed", async () => {
    useSettings.setState({ defaultAppsDismissed: true });
    await renderAndOpen();
    expect(screen.queryByText("defaultApp.title")).not.toBeInTheDocument();
  });

  it("stays closed on non-main windows", async () => {
    windowLabel.value = "secondary";
    await renderAndOpen();
    expect(screen.queryByText("defaultApp.title")).not.toBeInTheDocument();
  });

  it("the Set button makes Reado the default and persists the dismissal", async () => {
    await renderAndOpen();
    await userEvent.click(await screen.findByRole("button", { name: "defaultApp.set" }));
    expect(makeDefaultApp).toHaveBeenCalledOnce();
    expect(useSettings.getState().defaultAppsDismissed).toBe(true);
  });

  it("Later dismisses this run without setting the default or the persisted flag", async () => {
    await renderAndOpen();
    await userEvent.click(await screen.findByRole("button", { name: "defaultApp.later" }));
    expect(makeDefaultApp).not.toHaveBeenCalled();
    expect(useSettings.getState().defaultAppsDismissed).toBe(false);
  });

  it("ticking 'don't ask again' before Later persists the opt-out", async () => {
    await renderAndOpen();
    await userEvent.click(await screen.findByText("defaultApp.dontAsk"));
    await userEvent.click(screen.getByRole("button", { name: "defaultApp.later" }));
    expect(makeDefaultApp).not.toHaveBeenCalled();
    expect(useSettings.getState().defaultAppsDismissed).toBe(true);
  });
});
