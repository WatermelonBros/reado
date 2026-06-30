// The right-side drawer wraps Ark UI's headless Dialog with unmountOnExit, so
// content only exists in the tree while open. We assert both states and the
// dismissal contract.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Drawer } from "./Drawer";

describe("Drawer", () => {
  it("renders nothing while closed (unmountOnExit)", () => {
    render(
      <Drawer open={false} onOpenChange={() => {}} ariaLabel="Settings">
        <p>Panel body</p>
      </Drawer>,
    );
    expect(screen.queryByText("Panel body")).not.toBeInTheDocument();
  });

  it("renders the labelled dialog with its children when open", () => {
    render(
      <Drawer open onOpenChange={() => {}} ariaLabel="Settings">
        <p>Panel body</p>
      </Drawer>,
    );
    expect(screen.getByText("Panel body")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
  });

  it("requests close on Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <Drawer open onOpenChange={onOpenChange} ariaLabel="Settings">
        <p>Panel body</p>
      </Drawer>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
