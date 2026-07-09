// The Input atom: variant surface, value/onChange, ref forwarding, className override.
import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "../Input";

describe("Input", () => {
  it("defaults to a bordered text input and forwards value/onChange", async () => {
    const onChange = vi.fn();
    render(<Input aria-label="q" value="" onChange={onChange} />);
    const el = screen.getByLabelText("q");
    expect(el).toHaveAttribute("type", "text");
    expect(el.className).toContain("border-line");
    await userEvent.type(el, "x");
    expect(onChange).toHaveBeenCalled();
  });

  it("applies the plain variant (transparent, no border)", () => {
    render(<Input aria-label="q" variant="plain" readOnly />);
    const el = screen.getByLabelText("q");
    expect(el.className).toContain("bg-transparent");
    expect(el.className).not.toContain("border-line");
  });

  it("lets className override a default (bg)", () => {
    render(<Input aria-label="q" className="bg-canvas" readOnly />);
    const el = screen.getByLabelText("q");
    expect(el.className).toContain("bg-canvas");
    // twMerge dropped the variant's bg-surface in favour of bg-canvas.
    expect(el.className).not.toContain("bg-surface");
  });

  it("forwards a ref to the underlying element (React 19 ref-as-prop)", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input aria-label="q" ref={ref} readOnly />);
    expect(ref.current).toBe(screen.getByLabelText("q"));
  });
});
