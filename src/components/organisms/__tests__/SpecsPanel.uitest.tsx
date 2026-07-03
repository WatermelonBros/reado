// UI test: the Specs panel renders grouped change/spec documents and opens one.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

import { SpecsPanel } from "../SpecsPanel";
import { useSpecs, type SpecGroup } from "../../../lib/specs";
import { useProject } from "../../../lib/store";

const ROOT = "/repo";

function seed(groups: SpecGroup[], active: string | null = null) {
  const open = vi.fn();
  useSpecs.setState({ groups });
  useProject.setState({ root: ROOT, open, active });
  return { open };
}

beforeEach(() => {
  useSpecs.setState({ groups: [] });
});

describe("SpecsPanel", () => {
  it("shows the empty state with no specs", () => {
    seed([]);
    render(<SpecsPanel />);
    expect(screen.getByText("specs.empty")).toBeInTheDocument();
  });

  it("renders a change group with its documents and capability spec heading", () => {
    seed([
      {
        title: "add-logging",
        kind: "change",
        items: [
          { label: "proposal.md", path: ".openspec/changes/add-logging/proposal.md", isSpec: false },
          { label: "logging/spec.md", path: ".openspec/changes/add-logging/specs/logging/spec.md", isSpec: true },
        ],
      },
    ]);
    render(<SpecsPanel />);
    expect(screen.getByText("add-logging")).toBeInTheDocument();
    // Extension stripped from the document label.
    expect(screen.getByText("proposal")).toBeInTheDocument();
    expect(screen.getByText("logging/spec")).toBeInTheDocument();
    // The "change" badge + a "Specs" sub-heading before the first capability.
    expect(screen.getByText("specs.change")).toBeInTheDocument();
    expect(screen.getByText("specs.spec")).toBeInTheDocument();
  });

  it("clicking a document opens its full path", async () => {
    seed([
      {
        title: "auth",
        kind: "spec",
        items: [{ label: "spec.md", path: ".openspec/specs/auth/spec.md", isSpec: true }],
      },
    ]);
    render(<SpecsPanel />);
    await userEvent.click(screen.getByText("spec"));
    expect(useProject.getState().open).toHaveBeenCalledWith(
      `${ROOT}/.openspec/specs/auth/spec.md`,
    );
  });
});
