// Shortcuts reference dialog: renders the grouped binding list when the palette
// flag is on, and the close button toggles it shut. i18n is mocked to keys.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { ShortcutsDialog } from "./ShortcutsDialog";
import { usePalette } from "../../lib/store";

beforeEach(() => {
  usePalette.setState({ shortcutsOpen: false });
});

describe("ShortcutsDialog", () => {
  it("renders nothing while closed", () => {
    render(<ShortcutsDialog />);
    expect(screen.queryByRole("heading", { name: "sc.title" })).not.toBeInTheDocument();
  });

  it("renders the grouped shortcuts when open", () => {
    usePalette.setState({ shortcutsOpen: true });
    render(<ShortcutsDialog />);
    expect(screen.getByRole("heading", { name: "sc.title" })).toBeInTheDocument();
    // A group title (localized key) and a literal binding label + combo.
    expect(screen.getByText("sc.navigation")).toBeInTheDocument();
    expect(screen.getByText("Go to File")).toBeInTheDocument();
    expect(screen.getByText("Command Palette")).toBeInTheDocument();
  });

  it("the close button toggles the palette shut", async () => {
    usePalette.setState({ shortcutsOpen: true });
    render(<ShortcutsDialog />);
    await userEvent.click(screen.getByRole("button", { name: "settings.close" }));
    expect(usePalette.getState().shortcutsOpen).toBe(false);
    expect(screen.queryByRole("heading", { name: "sc.title" })).not.toBeInTheDocument();
  });
});
