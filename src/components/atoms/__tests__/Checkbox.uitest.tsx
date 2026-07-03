// The themed checkbox wraps Ark UI's headless control. We assert the accessible
// checkbox role, label association and the controlled onChange contract.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "../Checkbox";

describe("Checkbox", () => {
  it("renders an accessible checkbox with its label", () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Don't ask again" />);
    expect(screen.getByText("Don't ask again")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("reflects the checked state", () => {
    render(<Checkbox checked onChange={() => {}} label="On" />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("calls onChange(true) when toggled on", async () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Toggle me" />);
    await userEvent.click(screen.getByText("Toggle me"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChange(false) when toggled off", async () => {
    const onChange = vi.fn();
    render(<Checkbox checked onChange={onChange} label="Toggle me" />);
    await userEvent.click(screen.getByText("Toggle me"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("forwards the title attribute", () => {
    render(
      <Checkbox checked={false} onChange={() => {}} label="L" title="explainer" />,
    );
    expect(screen.getByTitle("explainer")).toBeInTheDocument();
  });
});
