// UI test: the image viewer renders the picture with an accessible name derived
// from the filename, plus a real zoom state machine — starts fit-to-viewport,
// the − / + buttons step through the ZOOMS levels, and clicking the percentage
// label (or the image) toggles fit ↔ actual size. The label reflects that state.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ImageView } from "../ImageView";

const DATA_URL = "data:image/png;base64,AAAA";

describe("ImageView", () => {
  it("renders an <img> with the dataUrl as src and the name as its accessible name", () => {
    render(<ImageView dataUrl={DATA_URL} name="diagram.png" />);
    const img = screen.getByRole("img", { name: "diagram.png" });
    expect(img).toHaveAttribute("src", DATA_URL);
    expect(img).toHaveAttribute("alt", "diagram.png");
  });

  it("starts in fit mode, showing the fit label", () => {
    render(<ImageView dataUrl={DATA_URL} name="photo.jpg" />);
    // Global i18n mock returns the key verbatim.
    expect(screen.getByText("imageView.fit")).toBeInTheDocument();
    expect(screen.getByLabelText("imageView.zoomIn")).toBeInTheDocument();
    expect(screen.getByLabelText("imageView.zoomOut")).toBeInTheDocument();
  });

  it("offers an open-as-text action for SVG files", () => {
    render(<ImageView dataUrl={DATA_URL} name="icon.svg" />);
    expect(screen.getByText("tree.openAsText")).toBeInTheDocument();
  });

  it("does not offer open-as-text for non-SVG files", () => {
    render(<ImageView dataUrl={DATA_URL} name="icon.png" />);
    expect(screen.queryByText("tree.openAsText")).not.toBeInTheDocument();
  });

  it("zoom-in steps out of fit mode into a concrete percentage", async () => {
    render(<ImageView dataUrl={DATA_URL} name="photo.jpg" />);
    expect(screen.getByText("imageView.fit")).toBeInTheDocument();

    // fit (null → 1) then one step up the ZOOMS ladder lands on 1.5 = 150%.
    await userEvent.click(screen.getByLabelText("imageView.zoomIn"));
    expect(screen.queryByText("imageView.fit")).not.toBeInTheDocument();
    expect(screen.getByText("150%")).toBeInTheDocument();
  });

  it("clicking the label toggles fit ↔ actual (100%) size", async () => {
    render(<ImageView dataUrl={DATA_URL} name="photo.jpg" />);

    // fit → actual size (100%).
    await userEvent.click(screen.getByText("imageView.fit"));
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByText("imageView.fit")).not.toBeInTheDocument();

    // actual size → back to fit.
    await userEvent.click(screen.getByText("100%"));
    expect(screen.getByText("imageView.fit")).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("steps up and down through the ZOOMS levels", async () => {
    render(<ImageView dataUrl={DATA_URL} name="photo.jpg" />);
    const zoomIn = screen.getByLabelText("imageView.zoomIn");
    const zoomOut = screen.getByLabelText("imageView.zoomOut");

    await userEvent.click(zoomIn); // fit → 150%
    expect(screen.getByText("150%")).toBeInTheDocument();
    await userEvent.click(zoomIn); // 150% → 200%
    expect(screen.getByText("200%")).toBeInTheDocument();
    await userEvent.click(zoomOut); // 200% → 150%
    expect(screen.getByText("150%")).toBeInTheDocument();
  });

  it("clicking the image itself toggles fit ↔ actual size", async () => {
    render(<ImageView dataUrl={DATA_URL} name="photo.jpg" />);
    await userEvent.click(screen.getByRole("img", { name: "photo.jpg" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("img", { name: "photo.jpg" }));
    expect(screen.getByText("imageView.fit")).toBeInTheDocument();
  });
});
