// The Notice toast stack component (render side). The store logic is covered in
// lib/__tests__/notice.uitest.ts; here we verify the component renders a toast
// per entry and that a manual dismiss removes one.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notice } from "../Notice";
import { useNotice } from "../../../lib/notice";

beforeEach(() => useNotice.setState({ notices: [] }));

describe("Notice", () => {
  it("renders nothing when there are no notices", () => {
    const { container } = render(<Notice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a toast per notice, error as an alert", () => {
    useNotice.getState().show("error", "boom");
    useNotice.getState().show("info", "hello");
    render(<Notice />);
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("removes a toast when its dismiss button is clicked", async () => {
    useNotice.getState().show("info", "bye soon");
    render(<Notice />);
    const toast = screen.getByText("bye soon");
    const dismiss = screen.getByRole("button", { name: "common.dismiss" });
    await userEvent.click(dismiss);
    await waitForElementToBeRemoved(toast);
    expect(screen.queryByText("bye soon")).not.toBeInTheDocument();
  });
});
