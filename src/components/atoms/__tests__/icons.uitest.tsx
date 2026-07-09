// Smoke tests for the icon set: a sample of the Phosphor wrappers render an
// <svg> and forward className; a bespoke brand mark renders an <svg>; and
// FileIcon renders a glyph for both directories and a couple of file
// extensions. Deliberately a light sample — not an enumeration of every icon.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  SearchIcon,
  CloseIcon,
  FilesIcon,
  ClaudeIcon,
  FileIcon,
} from "../icons";

describe("wrapped Phosphor icons", () => {
  it("render an <svg>", () => {
    for (const Icon of [SearchIcon, CloseIcon, FilesIcon]) {
      const { container } = render(<Icon />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    }
  });

  it("forward className to the rendered svg", () => {
    const { container } = render(<SearchIcon className="text-accent size-5" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("text-accent", "size-5");
  });
});

describe("brand marks", () => {
  it("ClaudeIcon renders an <svg>", () => {
    const { container } = render(<ClaudeIcon />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("a brand mark forwards className", () => {
    const { container } = render(<ClaudeIcon className="text-brand" />);
    expect(container.querySelector("svg")).toHaveClass("text-brand");
  });
});

describe("FileIcon", () => {
  // Phosphor maps its `color` prop onto the svg's `fill` attribute, so the
  // language tint (and the accent for folders) is observable there. Asserting
  // the fill — not just "an svg exists" — is what catches a broken
  // extension→colour (or extension→glyph) map: every Phosphor glyph is an svg,
  // but only the right one carries the right tint.

  it("renders a folder glyph tinted with the accent for a directory", () => {
    const { container } = render(<FileIcon isDir name="src" />);
    expect(container.querySelector("svg")).toHaveAttribute("fill", "var(--accent)");
  });

  it("tints the glyph by language colour, differing per extension", () => {
    // Default mode is "colored"; ts and py map to distinct linguist colours.
    const ts = render(<FileIcon isDir={false} name="module.ts" />);
    expect(ts.container.querySelector("svg")).toHaveAttribute("fill", "#3178C6");

    const py = render(<FileIcon isDir={false} name="script.py" />);
    expect(py.container.querySelector("svg")).toHaveAttribute("fill", "#3572A5");
  });

  it("falls back to the neutral faint colour for an unknown extension", () => {
    const { container } = render(<FileIcon isDir={false} name="data.xyz" />);
    expect(container.querySelector("svg")).toHaveAttribute("fill", "var(--text-faint)");
  });

  it("drops the language tint in 'mono' mode regardless of extension", () => {
    // The ts colour must NOT leak through when tinting is off.
    const { container } = render(<FileIcon isDir={false} mode="mono" name="module.ts" />);
    expect(container.querySelector("svg")).toHaveAttribute("fill", "var(--text-faint)");
  });
});
