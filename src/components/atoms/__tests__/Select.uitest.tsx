// The themed select wraps Ark UI's headless Select (listbox semantics via a
// Portal into document.body). We assert the trigger shows the current value's
// label, opening reveals the options, and choosing one fires onChange.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, type SelectOption } from "../Select";

const options: SelectOption<string>[] = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana" },
  { value: "c", label: "Cherry" },
];

describe("Select", () => {
  it("shows the current value's label on the trigger", () => {
    render(
      <Select value="b" options={options} onChange={() => {}} ariaLabel="Fruit" />,
    );
    expect(screen.getByRole("combobox", { name: "Fruit" })).toHaveTextContent(
      "Banana",
    );
  });

  it("reveals the options when the trigger is opened", async () => {
    render(
      <Select value="a" options={options} onChange={() => {}} ariaLabel="Fruit" />,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Fruit" }));
    expect(screen.getByRole("option", { name: "Apple" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cherry" })).toBeInTheDocument();
  });

  it("calls onChange with the chosen option's value", async () => {
    const onChange = vi.fn();
    render(
      <Select value="a" options={options} onChange={onChange} ariaLabel="Fruit" />,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Fruit" }));
    await userEvent.click(screen.getByRole("option", { name: "Cherry" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });
});
