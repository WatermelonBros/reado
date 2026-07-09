// The themed modal wraps Ark UI's headless Dialog with unmountOnExit, so its
// content only exists in the tree while open (via a Portal into document.body).
// We assert both render states and the dismissal contract.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../Modal";

describe("Modal", () => {
  it("renders nothing while closed (unmountOnExit)", () => {
    render(
      <Modal open={false} onOpenChange={() => {}} ariaLabel="Confirm">
        <p>Dialog body</p>
      </Modal>,
    );
    expect(screen.queryByText("Dialog body")).not.toBeInTheDocument();
  });

  it("renders the labelled dialog with its children when open", () => {
    render(
      <Modal open onOpenChange={() => {}} ariaLabel="Confirm">
        <p>Dialog body</p>
      </Modal>,
    );
    expect(screen.getByText("Dialog body")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Confirm" })).toBeInTheDocument();
  });

  it("requests close on Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} ariaLabel="Confirm">
        <p>Dialog body</p>
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
