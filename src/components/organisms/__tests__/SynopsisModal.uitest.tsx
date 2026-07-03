// File synopsis modal: the loading / error / ready (Markdown) states, the stale
// banner, and the Regenerate action. The store's regenerate action is stubbed via
// setState so no real poll starts; i18n is mocked to keys.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { SynopsisModal } from "../SynopsisModal";
import { useSynopsis } from "../../../lib/synopsis";

const regenerate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useSynopsis.setState({
    open: false,
    relPath: null,
    status: "loading",
    text: "",
    stale: false,
    regenerate,
  });
});

describe("SynopsisModal", () => {
  it("renders nothing while closed", () => {
    render(<SynopsisModal />);
    expect(screen.queryByText("synopsis.title")).not.toBeInTheDocument();
  });

  it("shows the basename and generating message while loading", () => {
    useSynopsis.setState({ open: true, relPath: "src/deep/file.ts", status: "loading" });
    render(<SynopsisModal />);
    expect(screen.getByText(/file\.ts/)).toBeInTheDocument();
    expect(screen.getByText("synopsis.generating")).toBeInTheDocument();
  });

  it("shows the error message on failure", () => {
    useSynopsis.setState({ open: true, relPath: "a.ts", status: "error" });
    render(<SynopsisModal />);
    expect(screen.getByText("synopsis.error")).toBeInTheDocument();
  });

  it("renders the synopsis Markdown and the stale banner when ready", () => {
    useSynopsis.setState({
      open: true,
      relPath: "a.ts",
      status: "ready",
      stale: true,
      text: "# Overview\n\nsummary line",
    });
    render(<SynopsisModal />);
    expect(screen.getByText("synopsis.stale")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("summary line")).toBeInTheDocument();
  });

  it("the regenerate button re-dispatches generation", async () => {
    useSynopsis.setState({ open: true, relPath: "a.ts", status: "ready", text: "x" });
    render(<SynopsisModal />);
    await userEvent.click(screen.getByRole("button", { name: "synopsis.regenerate" }));
    expect(regenerate).toHaveBeenCalledOnce();
  });
});
