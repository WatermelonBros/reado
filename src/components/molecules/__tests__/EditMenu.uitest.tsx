// UI test: EditMenu is a document-level right-click menu for plain text fields.
// A contextmenu over an editable input/textarea opens Cut/Copy/Paste/Select All;
// a disabled/read-only or non-editable target opens nothing; selecting an action
// runs the matching clipboard / selection op and dismisses the menu. The Tauri
// clipboard plugin is the only edge mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { writeText, readText } = vi.hoisted(() => ({
  writeText: vi.fn(async () => {}),
  readText: vi.fn(async () => ""),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText,
  readText,
}));

import { EditMenu } from "../EditMenu";

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  readText.mockReset().mockResolvedValue("");
});

/** Right-click an element as the webview would (contextmenu with coordinates). */
function rightClick(el: Element) {
  fireEvent.contextMenu(el, { clientX: 20, clientY: 20 });
}

describe("EditMenu", () => {
  it("opens the edit actions when right-clicking an editable input", () => {
    render(
      <>
        <input aria-label="field" defaultValue="hello" />
        <EditMenu />
      </>,
    );
    const input = screen.getByLabelText("field") as HTMLInputElement;
    input.setSelectionRange(0, 5);
    rightClick(input);

    expect(screen.getByRole("menuitem", { name: "edit.cut" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "edit.copy" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "edit.paste" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "edit.selectAll" })).toBeInTheDocument();
  });

  it("opens the menu when right-clicking an editable textarea", () => {
    render(
      <>
        <textarea aria-label="body" defaultValue="text" />
        <EditMenu />
      </>,
    );
    rightClick(screen.getByLabelText("body"));
    expect(screen.getByRole("menuitem", { name: "edit.paste" })).toBeInTheDocument();
  });

  it("disables Cut/Copy with no selection (Paste stays enabled)", () => {
    render(
      <>
        <input aria-label="field" defaultValue="hello" />
        <EditMenu />
      </>,
    );
    rightClick(screen.getByLabelText("field"));
    expect(screen.getByRole("menuitem", { name: "edit.cut" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "edit.copy" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "edit.paste" })).not.toBeDisabled();
  });

  it("does not open over a disabled input", () => {
    render(
      <>
        <input aria-label="field" defaultValue="hello" disabled />
        <EditMenu />
      </>,
    );
    rightClick(screen.getByLabelText("field"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not open over a non-editable element", () => {
    render(
      <>
        <div data-testid="plain">not a field</div>
        <EditMenu />
      </>,
    );
    rightClick(screen.getByTestId("plain"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Copy writes the selection to the clipboard and closes the menu", async () => {
    render(
      <>
        <input aria-label="field" defaultValue="hello" />
        <EditMenu />
      </>,
    );
    const input = screen.getByLabelText("field") as HTMLInputElement;
    input.setSelectionRange(0, 5);
    rightClick(input);

    await userEvent.click(screen.getByRole("menuitem", { name: "edit.copy" }));
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Select All selects the field and closes the menu", async () => {
    render(
      <>
        <input aria-label="field" defaultValue="hello" />
        <EditMenu />
      </>,
    );
    const input = screen.getByLabelText("field") as HTMLInputElement;
    const select = vi.spyOn(input, "select");
    rightClick(input);

    await userEvent.click(screen.getByRole("menuitem", { name: "edit.selectAll" }));
    expect(select).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Paste reads the clipboard and closes the menu", async () => {
    readText.mockResolvedValue("pasted");
    render(
      <>
        <input aria-label="field" defaultValue="hello" />
        <EditMenu />
      </>,
    );
    rightClick(screen.getByLabelText("field"));

    await userEvent.click(screen.getByRole("menuitem", { name: "edit.paste" }));
    expect(readText).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
