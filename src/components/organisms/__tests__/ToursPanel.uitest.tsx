// UI test: the Tours panel creates/generates tours, expands steps, and drives
// the tour actions. Store actions are replaced with spies; the prompt dialog is
// mocked so no real input/IO happens.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
  // tours.ts → docInfo → lsp → i18n/index pulls this in at import time.
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
const promptMock = vi.fn();
vi.mock("../../../lib/prompt", () => ({ prompt: (...a: unknown[]) => promptMock(...a) }));

import { ToursPanel, TourBar } from "../ToursPanel";
import { useTours, type Tour } from "../../../lib/tours";
import { useProject } from "../../../lib/store";

const ROOT = "/repo";

const spies = () => ({
  createTour: vi.fn(),
  removeTour: vi.fn(),
  addStepHere: vi.fn(),
  removeStep: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  go: vi.fn(),
  generate: vi.fn(),
});

function seed(over: Partial<ReturnType<typeof useTours.getState>> = {}) {
  const actions = spies();
  useProject.setState({ root: ROOT });
  useTours.setState({ tours: [], running: null, generating: false, ...actions, ...over });
  return actions;
}

const tourWithStep: Tour = {
  id: "t1",
  name: "Start here",
  steps: [{ file: "src/a.ts", line: 5, note: "read this first" }],
};

beforeEach(() => {
  promptMock.mockReset();
});

describe("ToursPanel", () => {
  it("shows the empty state and the toolbar actions", () => {
    seed();
    render(<ToursPanel />);
    expect(screen.getByText("tours.empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tours.new/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tours.generate/ })).toBeInTheDocument();
  });

  it("creating a tour prompts then calls createTour", async () => {
    const actions = seed();
    promptMock.mockResolvedValue("My tour");
    render(<ToursPanel />);
    await userEvent.click(screen.getByRole("button", { name: /tours.new/ }));
    await waitFor(() => expect(actions.createTour).toHaveBeenCalledWith(ROOT, "My tour"));
  });

  it("cancelling the new-tour prompt does not create a tour", async () => {
    const actions = seed();
    promptMock.mockResolvedValue(null);
    render(<ToursPanel />);
    await userEvent.click(screen.getByRole("button", { name: /tours.new/ }));
    await Promise.resolve();
    expect(actions.createTour).not.toHaveBeenCalled();
  });

  it("shows the in-progress label and disables generate while generating", () => {
    seed({ generating: true });
    render(<ToursPanel />);
    expect(screen.getByRole("button", { name: /tours.generating/ })).toBeDisabled();
  });

  it("clicking generate calls the store action", async () => {
    const actions = seed();
    render(<ToursPanel />);
    await userEvent.click(screen.getByRole("button", { name: /tours.generate/ }));
    expect(actions.generate).toHaveBeenCalledWith(ROOT);
  });

  it("lists tours, expands steps, and drives step actions", async () => {
    const actions = seed({ tours: [tourWithStep] });
    render(<ToursPanel />);
    expect(screen.getByText("Start here")).toBeInTheDocument();

    // Expand to reveal the step.
    await userEvent.click(screen.getByText("Start here"));
    expect(screen.getByText("read this first")).toBeInTheDocument();

    // Clicking a step starts the tour.
    await userEvent.click(screen.getByText("read this first"));
    expect(actions.start).toHaveBeenCalledWith("t1");

    // Remove the step.
    await userEvent.click(screen.getByRole("button", { name: "tours.removeStep" }));
    expect(actions.removeStep).toHaveBeenCalledWith(ROOT, "t1", 0);
  });

  it("adding a step prompts then calls addStepHere", async () => {
    const actions = seed({ tours: [tourWithStep] });
    promptMock.mockResolvedValue("a new step");
    render(<ToursPanel />);
    await userEvent.click(screen.getByText("Start here"));
    await userEvent.click(screen.getByRole("button", { name: /tours.addStep/ }));
    await waitFor(() => expect(actions.addStepHere).toHaveBeenCalledWith(ROOT, "t1", "a new step"));
  });

  it("starts and removes a tour from its row", async () => {
    const actions = seed({ tours: [tourWithStep] });
    render(<ToursPanel />);
    await userEvent.click(screen.getByRole("button", { name: "tours.start" }));
    expect(actions.start).toHaveBeenCalledWith("t1");

    await userEvent.click(screen.getByRole("button", { name: "tours.removeTour" }));
    expect(actions.removeTour).toHaveBeenCalledWith(ROOT, "t1");
  });

  it("disables start for a tour with no steps", () => {
    seed({ tours: [{ id: "t2", name: "Empty", steps: [] }] });
    render(<ToursPanel />);
    expect(screen.getByRole("button", { name: "tours.start" })).toBeDisabled();
  });
});

describe("TourBar", () => {
  it("renders nothing when no tour is running", () => {
    seed({ tours: [tourWithStep], running: null });
    const { container } = render(<TourBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the running tour is missing", () => {
    seed({ tours: [], running: { tourId: "gone", index: 0 } });
    const { container } = render(<TourBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current step and drives navigation", async () => {
    const actions = seed({
      tours: [
        {
          id: "t1",
          name: "Start here",
          steps: [
            { file: "a.ts", line: 1, note: "step one" },
            { file: "b.ts", line: 2, note: "step two" },
          ],
        },
      ],
      running: { tourId: "t1", index: 0 },
    });
    render(<TourBar />);
    expect(screen.getByText("step one")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "tours.prev" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "tours.next" }));
    expect(actions.go).toHaveBeenCalledWith(1);

    await userEvent.click(screen.getByRole("button", { name: "tours.exit" }));
    expect(actions.stop).toHaveBeenCalledOnce();
  });
});
