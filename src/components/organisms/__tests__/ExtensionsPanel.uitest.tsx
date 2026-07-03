// UI test: the Extensions (language servers) panel reflects install status,
// toggles enable/disable, and installs via the terminal. The PATH probe and
// terminal submission are mocked; the extensions/terminals stores are real.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));
const lspInstalled = vi.fn<(server: string) => Promise<boolean>>();
const submitToTerminal = vi.fn();
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  lspInstalled: (server: string) => lspInstalled(server),
  linuxPackageManager: vi.fn(async () => null),
  submitToTerminal: (...a: unknown[]) => submitToTerminal(...a),
}));

import { ExtensionsPanel } from "../ExtensionsPanel";
import { useExtensions } from "../../../lib/extensions";
import { useTerminals } from "../../../lib/terminals";

const TS = "TypeScript / JavaScript / React";

function tsRow() {
  return within(screen.getByText(TS).closest("li") as HTMLElement);
}

beforeEach(() => {
  lspInstalled.mockReset();
  submitToTerminal.mockReset();
  lspInstalled.mockResolvedValue(false);
  useExtensions.setState({ disabled: [] });
  useTerminals.setState({ sessions: [], activeId: null, groups: [], activeGroupId: null });
});

describe("ExtensionsPanel", () => {
  it("lists the language servers with a recheck control", async () => {
    render(<ExtensionsPanel />);
    expect(screen.getByText(TS)).toBeInTheDocument();
    expect(screen.getByText("Rust")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ext.recheck" })).toBeInTheDocument();
    await waitFor(() => expect(lspInstalled).toHaveBeenCalled());
  });

  it("shows the installed badge for servers detected on PATH", async () => {
    lspInstalled.mockImplementation(async (id) => id === "typescript");
    render(<ExtensionsPanel />);
    await waitFor(() => expect(tsRow().getByText("ext.installed")).toBeInTheDocument());
  });

  it("shows an install button when a server is missing and runs it in the terminal", async () => {
    render(<ExtensionsPanel />);
    const installBtn = await waitFor(() => tsRow().getByRole("button", { name: "ext.install" }));
    await userEvent.click(installBtn);
    expect(submitToTerminal).toHaveBeenCalledTimes(1);
    // The TypeScript server installs via npm.
    expect(submitToTerminal.mock.calls[0][1]).toContain("typescript-language-server");
  });

  it("toggling the enabled checkbox disables the server in the store", async () => {
    render(<ExtensionsPanel />);
    await waitFor(() => expect(lspInstalled).toHaveBeenCalled());
    await userEvent.click(tsRow().getByText("ext.enabled"));
    expect(useExtensions.getState().disabled).toContain("typescript");
  });

  it("recheck re-probes the servers", async () => {
    render(<ExtensionsPanel />);
    await waitFor(() => expect(lspInstalled).toHaveBeenCalled());
    const before = lspInstalled.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "ext.recheck" }));
    await waitFor(() => expect(lspInstalled.mock.calls.length).toBeGreaterThan(before));
  });
});
