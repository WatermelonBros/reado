// The Badge atom: renders its content with the tone surface, className-overridable.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>7</Badge>);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("applies the tone surface", () => {
    render(<Badge tone="marker">3</Badge>);
    expect(screen.getByText("3").className).toContain("bg-marker");
  });

  it("defaults to the accent tone", () => {
    render(<Badge>1</Badge>);
    expect(screen.getByText("1").className).toContain("bg-accent");
  });

  it("merges an override className (position/size)", () => {
    render(<Badge className="absolute h-3.5">2</Badge>);
    const el = screen.getByText("2");
    expect(el.className).toContain("absolute");
    // twMerge keeps the override height over the default h-4.
    expect(el.className).toContain("h-3.5");
    expect(el.className).not.toContain("h-4");
  });
});
