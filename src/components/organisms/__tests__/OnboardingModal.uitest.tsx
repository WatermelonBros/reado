// Repo onboarding overview modal: the loading / error / ready (Markdown) states,
// the Regenerate action, and link handling (external → opener, relative → open
// the project file and close). Store actions are stubbed via setState so no real
// poll timers start; i18n and the opener plugin are mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const openUrl = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (u: string) => openUrl(u) }));

import { OnboardingModal } from "../OnboardingModal";
import { useOnboarding } from "../../../lib/onboarding";
import { useProject } from "../../../lib/store";

const openFile = vi.fn();
const regenerate = vi.fn();
const close = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useProject.setState({ root: "/proj", open: openFile });
  useOnboarding.setState({
    open: false,
    status: "loading",
    text: "",
    stale: false,
    regenerate,
    close,
  });
});

describe("OnboardingModal", () => {
  it("renders nothing while closed", () => {
    render(<OnboardingModal />);
    expect(screen.queryByText("onboarding.title")).not.toBeInTheDocument();
  });

  it("shows the generating message while loading", () => {
    useOnboarding.setState({ open: true, status: "loading" });
    render(<OnboardingModal />);
    expect(screen.getByText("onboarding.generating")).toBeInTheDocument();
  });

  it("shows the error message on failure", () => {
    useOnboarding.setState({ open: true, status: "error" });
    render(<OnboardingModal />);
    expect(screen.getByText("synopsis.error")).toBeInTheDocument();
  });

  it("renders the Markdown overview and the stale banner when ready", () => {
    useOnboarding.setState({
      open: true,
      status: "ready",
      stale: true,
      text: "# Heading\n\n[ext](https://example.com) [rel](docs/x.md)",
    });
    render(<OnboardingModal />);
    expect(screen.getByText("onboarding.stale")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ext" })).toBeInTheDocument();
  });

  it("the regenerate button dispatches a regeneration", async () => {
    useOnboarding.setState({ open: true, status: "ready", text: "x" });
    render(<OnboardingModal />);
    await userEvent.click(screen.getByRole("button", { name: "synopsis.regenerate" }));
    expect(regenerate).toHaveBeenCalledOnce();
  });

  it("an external link opens in the browser", async () => {
    useOnboarding.setState({ open: true, status: "ready", text: "[ext](https://example.com)" });
    render(<OnboardingModal />);
    await userEvent.click(screen.getByRole("link", { name: "ext" }));
    expect(openUrl).toHaveBeenCalledWith("https://example.com");
    expect(openFile).not.toHaveBeenCalled();
  });

  it("a relative link opens the project file and closes the overview", async () => {
    useOnboarding.setState({ open: true, status: "ready", text: "[rel](./docs/x.md)" });
    render(<OnboardingModal />);
    await userEvent.click(screen.getByRole("link", { name: "rel" }));
    expect(openFile).toHaveBeenCalledWith("/proj/docs/x.md");
    expect(close).toHaveBeenCalledOnce();
  });
});
