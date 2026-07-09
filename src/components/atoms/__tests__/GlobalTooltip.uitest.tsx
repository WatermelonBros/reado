// GlobalTooltip is a singleton mounted once at the app root. It listens on
// `document` for mouseover/mouseout and, after a short delay, surfaces a themed
// bubble near any element carrying a `title` attribute — stashing the native
// `title` while the bubble is shown and restoring it on hide. These tests drive
// the real DOM listeners (events dispatched on the actual titled node) and use
// fake timers to advance past the 350ms show delay deterministically.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GlobalTooltip } from "../GlobalTooltip";

// The show delay lives in the component; keep this in sync with the setTimeout there.
const SHOW_DELAY = 350;

describe("GlobalTooltip", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows a themed bubble after the delay and stashes the native title", () => {
    render(
      <>
        <GlobalTooltip />
        <button type="button" title="Hello">
          Hi
        </button>
      </>,
    );
    const button = screen.getByRole("button", { name: "Hi" });

    // Hover: the native title is stashed immediately (suppressed), bubble not yet up.
    fireEvent.mouseOver(button);
    expect(button).not.toHaveAttribute("title");
    expect(screen.queryByRole("tooltip")).toBeNull();

    // Advance past the show delay — bubble appears with the title text.
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY);
    });
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Hello");
    // Still stashed while shown.
    expect(button).not.toHaveAttribute("title");
  });

  it("hides the bubble and restores the title on mouseOut", () => {
    render(
      <>
        <GlobalTooltip />
        <button type="button" title="Hello">
          Hi
        </button>
      </>,
    );
    const button = screen.getByRole("button", { name: "Hi" });

    fireEvent.mouseOver(button);
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // Leaving the element (no relatedTarget) hides the bubble and restores title.
    fireEvent.mouseOut(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button).toHaveAttribute("title", "Hello");
  });

  it("shows nothing when hovering an element without a title", () => {
    render(
      <>
        <GlobalTooltip />
        <button type="button">Plain</button>
      </>,
    );
    const button = screen.getByRole("button", { name: "Plain" });

    fireEvent.mouseOver(button);
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
