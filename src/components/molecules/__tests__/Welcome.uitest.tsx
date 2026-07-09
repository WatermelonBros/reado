// The empty-editor Welcome screen: a static teaching panel. react-i18next is
// mocked globally so `t` echoes the key — we assert on the copy keys it renders
// plus the real shortcut labels/combos from lib/shortcuts.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Welcome } from "../Welcome";
import { SHORTCUTS } from "../../../lib/shortcuts";

describe("Welcome", () => {
  it("renders the brand, tagline and section headings", () => {
    render(<Welcome />);
    expect(screen.getByRole("heading", { name: "Reado" })).toBeInTheDocument();
    expect(screen.getByText("app.tagline")).toBeInTheDocument();
    expect(screen.getByText("welcome.how")).toBeInTheDocument();
    expect(screen.getByText("welcome.shortcuts")).toBeInTheDocument();
  });

  it("lists all three how-it-works steps", () => {
    render(<Welcome />);
    expect(screen.getByText("welcome.step1")).toBeInTheDocument();
    expect(screen.getByText("welcome.step2")).toBeInTheDocument();
    expect(screen.getByText("welcome.step3")).toBeInTheDocument();
  });

  it("renders every canonical shortcut with its label and combo", () => {
    render(<Welcome />);
    for (const s of SHORTCUTS) {
      expect(screen.getByText(s.labelKey)).toBeInTheDocument();
      const kbd = screen.getByText(s.combo);
      expect(kbd).toBeInTheDocument();
      expect(kbd.tagName).toBe("KBD");
    }
  });
});
