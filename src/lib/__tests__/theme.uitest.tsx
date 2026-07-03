// Cross-OS UI test: the interface theme is applied to <html data-theme>.
// Establishes the Tauri-mock pattern for component tests. Runs on all 3 OSes.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Tauri's window API isn't present in a simulated DOM — mock it.
const setTheme = vi.fn(() => Promise.resolve());
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme }),
}));

import { useApplyTheme } from "../hooks";
import { useSettings } from "../store";

function Probe() {
  useApplyTheme();
  return null;
}

beforeEach(() => {
  // deterministic matchMedia (used by "system" mode)
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /dark/.test(q) ? true : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

describe("interface theme applies to <html data-theme>", () => {
  it("manual mode honours the chosen theme", () => {
    useSettings.setState({ mode: "manual", theme: "reado-sepia" });
    render(<Probe />);
    expect(document.documentElement.dataset.theme).toBe("reado-sepia");
  });

  it("manual mode switches to high-contrast", () => {
    useSettings.setState({ mode: "manual", theme: "reado-high-contrast" });
    render(<Probe />);
    expect(document.documentElement.dataset.theme).toBe("reado-high-contrast");
  });

  it("system mode resolves to the dark-theme pair when the OS prefers dark", () => {
    useSettings.setState({ mode: "system", darkTheme: "reado-dark", lightTheme: "reado-light" });
    render(<Probe />);
    expect(document.documentElement.dataset.theme).toBe("reado-dark");
  });
});
