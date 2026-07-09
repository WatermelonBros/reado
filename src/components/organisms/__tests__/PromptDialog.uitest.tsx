// The reusable one-line input dialog (New File / Save As / Rename). It's driven
// by the promise-based `prompt()` store in lib/prompt: `prompt(opts)` opens it
// and resolves with the entered text (trimmed) or null on cancel/escape/empty.
// The store is real; i18n is stubbed globally (t(k) => k).
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PromptDialog } from "../PromptDialog";
import { prompt, usePrompt } from "../../../lib/prompt";

beforeEach(() => {
  // Reset to the closed initial state so a prior test's pending prompt can't leak.
  usePrompt.setState({
    open: false,
    title: "",
    placeholder: "",
    value: "",
    confirmLabel: "OK",
    resolve: null,
  });
});

describe("PromptDialog", () => {
  it("renders nothing while closed", () => {
    render(<PromptDialog />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the title, placeholder and input once opened", () => {
    void prompt({ title: "New File", placeholder: "name.txt", confirmLabel: "Create" });
    render(<PromptDialog />);
    expect(screen.getByRole("heading", { name: "New File" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "name.txt");
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("keeps confirm disabled until the field has non-empty text", async () => {
    void prompt({ title: "New File", confirmLabel: "Create" });
    render(<PromptDialog />);
    const confirm = screen.getByRole("button", { name: "Create" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), "foo.ts");
    expect(confirm).toBeEnabled();
  });

  it("typing then confirming resolves with the entered (trimmed) value", async () => {
    const result = prompt({ title: "New File", confirmLabel: "Create" });
    render(<PromptDialog />);
    await userEvent.type(screen.getByRole("textbox"), "  hello.ts  ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await expect(result).resolves.toBe("hello.ts");
  });

  it("pressing Enter in the field submits and resolves the value", async () => {
    const result = prompt({ title: "Rename", confirmLabel: "OK" });
    render(<PromptDialog />);
    await userEvent.type(screen.getByRole("textbox"), "world{Enter}");
    await expect(result).resolves.toBe("world");
  });

  it("Cancel resolves null and closes", async () => {
    const result = prompt({ title: "New File" });
    render(<PromptDialog />);
    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    await expect(result).resolves.toBeNull();
    expect(usePrompt.getState().open).toBe(false);
  });

  it("Escape resolves null even with text present", async () => {
    const result = prompt({ title: "New File" });
    render(<PromptDialog />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "typed");
    await userEvent.keyboard("{Escape}");
    await expect(result).resolves.toBeNull();
  });
});
