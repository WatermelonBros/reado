// Reado Anywhere pairing dialog: the disabled (tagline) state, enabling the
// server (renders the QR + stop control), copying the URL, and disabling again.
// `../../lib/api` is mocked at the three Anywhere commands; i18n is mocked to keys.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const anywhereStatus = vi.fn();
const anywhereEnable = vi.fn();
const anywhereDisable = vi.fn();
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  anywhereStatus: () => anywhereStatus(),
  anywhereEnable: () => anywhereEnable(),
  anywhereDisable: () => anywhereDisable(),
}));

import { AnywhereDialog } from "../AnywhereDialog";
import { usePalette } from "../../../lib/store";

const info = {
  url: "https://192.168.1.5:7000",
  token: "tok",
  fingerprint: "AA:BB:CC",
};

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  usePalette.setState({ anywhereOpen: false });
  anywhereStatus.mockResolvedValue(null);
  anywhereEnable.mockResolvedValue(info);
  anywhereDisable.mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnywhereDialog", () => {
  it("renders nothing while closed", () => {
    render(<AnywhereDialog />);
    expect(screen.queryByText("anywhere.title")).not.toBeInTheDocument();
  });

  it("shows the tagline and an enable button when the server is off", async () => {
    usePalette.setState({ anywhereOpen: true });
    render(<AnywhereDialog />);
    expect(await screen.findByText("anywhere.tagline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "anywhere.enable" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "anywhere.qrLabel" })).not.toBeInTheDocument();
  });

  it("enabling the server renders the QR and the stop control", async () => {
    usePalette.setState({ anywhereOpen: true });
    render(<AnywhereDialog />);
    await userEvent.click(await screen.findByRole("button", { name: "anywhere.enable" }));
    expect(anywhereEnable).toHaveBeenCalledOnce();
    expect(await screen.findByRole("img", { name: "anywhere.qrLabel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "anywhere.stop" })).toBeInTheDocument();
  });

  it("reflects an already-running server, copies the URL, and can stop it", async () => {
    anywhereStatus.mockResolvedValue(info);
    usePalette.setState({ anywhereOpen: true });
    render(<AnywhereDialog />);
    // The URL button (its label is the URL) appears once status resolves.
    const urlBtn = await screen.findByRole("button", { name: info.url });
    await userEvent.click(urlBtn);
    expect(writeText).toHaveBeenCalledWith(info.url);

    await userEvent.click(screen.getByRole("button", { name: "anywhere.stop" }));
    expect(anywhereDisable).toHaveBeenCalledOnce();
    expect(await screen.findByText("anywhere.tagline")).toBeInTheDocument();
  });

  it("the footer close button toggles the palette shut", async () => {
    usePalette.setState({ anywhereOpen: true });
    render(<AnywhereDialog />);
    await userEvent.click(await screen.findByRole("button", { name: "common.close" }));
    expect(usePalette.getState().anywhereOpen).toBe(false);
  });
});
