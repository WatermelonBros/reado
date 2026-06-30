// UI test: the Problems panel aggregates diagnostics by file, drives the
// severity filter chips, and jumps to a diagnostic on click.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

import { ProblemsPanel } from "./ProblemsPanel";
import { useDiagnostics, type DiagItem } from "../../lib/diagnostics";
import { useProject } from "../../lib/store";

const ROOT = "/repo";

function seed(byFile: Record<string, DiagItem[]>) {
  const open = vi.fn();
  useDiagnostics.setState({ byFile, errors: {} });
  useProject.setState({ root: ROOT, open });
  return { open };
}

beforeEach(() => {
  useDiagnostics.setState({ byFile: {}, errors: {} });
});

describe("ProblemsPanel", () => {
  it("shows the empty state with no diagnostics", () => {
    seed({});
    render(<ProblemsPanel />);
    expect(screen.getByText("problems.empty")).toBeInTheDocument();
  });

  it("lists diagnostics grouped by relative file, sorted by line", () => {
    seed({
      [`${ROOT}/src/a.ts`]: [
        { line: 9, character: 0, severity: 1, message: "boom" },
        { line: 2, character: 0, severity: 2, message: "careful" },
      ],
    });
    render(<ProblemsPanel />);
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("careful")).toBeInTheDocument();
    // Counts in the chips: 1 error, 1 warn, 0 info.
    expect(screen.getByText(/1 problems.error/)).toBeInTheDocument();
    expect(screen.getByText(/1 problems.warn/)).toBeInTheDocument();
    expect(screen.getByText(/0 problems.info/)).toBeInTheDocument();
  });

  it("clicking a diagnostic opens the file at its line", async () => {
    const { open } = seed({
      [`${ROOT}/a.ts`]: [{ line: 4, character: 0, severity: 1, message: "boom" }],
    });
    render(<ProblemsPanel />);
    await userEvent.click(screen.getByText("boom"));
    expect(open).toHaveBeenCalledWith(`${ROOT}/a.ts`, 4);
  });

  it("toggling the error chip hides error-severity rows", async () => {
    seed({
      [`${ROOT}/a.ts`]: [
        { line: 1, character: 0, severity: 1, message: "an-error" },
        { line: 2, character: 0, severity: 2, message: "a-warning" },
      ],
    });
    render(<ProblemsPanel />);
    const errorChip = screen.getByRole("button", { name: /problems.error/ });
    expect(errorChip).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(errorChip);
    expect(errorChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("an-error")).not.toBeInTheDocument();
    expect(screen.getByText("a-warning")).toBeInTheDocument();

    // Toggling back restores it.
    await userEvent.click(errorChip);
    expect(screen.getByText("an-error")).toBeInTheDocument();
  });
});
