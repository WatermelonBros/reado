// The Tooltip atom (Ark-backed). We assert the safe, deterministic behaviours:
// an empty label renders the child bare (no tooltip machinery), and with a label
// the trigger child still renders and stays interactive. (The hover bubble itself
// is Ark/portal + delay driven and not asserted here.)
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "../Tooltip";

describe("Tooltip", () => {
  it("renders the child bare when there is no label", () => {
    render(
      <Tooltip>
        <button type="button">Hi</button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button", { name: "Hi" });
    expect(btn).toBeInTheDocument();
    // No Ark tooltip trigger wiring when there's no label.
    expect(btn).not.toHaveAttribute("data-scope", "tooltip");
  });

  it("keeps the trigger child interactive when a label is set", async () => {
    const onClick = vi.fn();
    render(
      <Tooltip label="Explain">
        <button type="button" onClick={onClick}>
          Trigger
        </button>
      </Tooltip>,
    );
    const btn = screen.getByRole("button", { name: "Trigger" });
    // With a label the child becomes Ark's tooltip trigger (mirror of the
    // negative assertion above): the anatomy data-attributes are wired onto it.
    expect(btn).toHaveAttribute("data-scope", "tooltip");
    expect(btn).toHaveAttribute("data-part", "trigger");
    // ...and it stays a working button.
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
