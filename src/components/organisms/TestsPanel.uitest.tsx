// UI test: the Tests panel lists detected runners and dispatches run actions.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

import { TestsPanel } from "./TestsPanel";
import { useTests, type Runner } from "../../lib/tests";
import { useProject } from "../../lib/store";

function seed(runners: Runner[], active: string | null = "/repo/a.ts") {
  const runAll = vi.fn();
  const runFile = vi.fn();
  useTests.setState({ runners, runAll, runFile });
  useProject.setState({ root: "/repo", active });
  return { runAll, runFile };
}

beforeEach(() => {
  useTests.setState({ runners: [] });
});

describe("TestsPanel", () => {
  it("shows the empty state when no runner is detected", () => {
    seed([]);
    render(<TestsPanel />);
    expect(screen.getByText("tests.empty")).toBeInTheDocument();
  });

  it("lists runners and runs the whole suite", async () => {
    const { runAll } = seed([{ id: "js", label: "pnpm test", all: "pnpm test" }]);
    render(<TestsPanel />);
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "tests.runAll" }));
    expect(runAll).toHaveBeenCalledOnce();
  });

  it("offers run-file only when the runner supports it and a file is active", async () => {
    const { runFile } = seed([
      { id: "js", label: "pnpm test", all: "pnpm test", fileCmd: (f) => `pnpm test ${f}` },
    ]);
    render(<TestsPanel />);
    await userEvent.click(screen.getByRole("button", { name: "tests.runFile" }));
    expect(runFile).toHaveBeenCalledOnce();
  });

  it("hides run-file when no file is active", () => {
    seed([{ id: "js", label: "pnpm test", all: "pnpm test", fileCmd: (f) => f }], null);
    render(<TestsPanel />);
    expect(screen.queryByRole("button", { name: "tests.runFile" })).not.toBeInTheDocument();
  });

  it("hides run-file for runners without a file command", () => {
    seed([{ id: "rust", label: "cargo test", all: "cargo test" }]);
    render(<TestsPanel />);
    expect(screen.queryByRole("button", { name: "tests.runFile" })).not.toBeInTheDocument();
  });
});
