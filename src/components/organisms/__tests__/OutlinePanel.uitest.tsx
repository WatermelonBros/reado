// UI test: the Outline panel derives the active file's symbols, highlights the
// one under the cursor, jumps on click, and prefers language-server symbols.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OutlineSymbol } from "../../../lib/outline";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));
// Minimal hand-rolled docInfo store: view is seeded before each render, so no
// reactivity is needed and CodeMirror never gets pulled in.
vi.mock("../../../lib/docInfo", () => {
  let state: { view: unknown } = { view: null };
  const useDocInfo = (selector: (s: typeof state) => unknown) => selector(state);
  useDocInfo.getState = () => state;
  useDocInfo.setState = (patch: Partial<typeof state>) => {
    state = { ...state, ...patch };
  };
  return { useDocInfo, goToLine: vi.fn() };
});
vi.mock("../../../lib/outline", () => ({ extractSymbols: vi.fn(() => []) }));
vi.mock("../../../lib/lsp", () => ({ lspDocumentSymbols: vi.fn(() => null) }));

import { OutlinePanel } from "../OutlinePanel";
import { useDocInfo, goToLine } from "../../../lib/docInfo";
import { extractSymbols } from "../../../lib/outline";
import { lspDocumentSymbols } from "../../../lib/lsp";
import { useProject, useCursor } from "../../../lib/store";

const FAKE_VIEW = { state: { doc: { toString: () => "" } } };

beforeEach(() => {
  vi.mocked(goToLine).mockClear();
  vi.mocked(extractSymbols).mockReturnValue([]);
  vi.mocked(lspDocumentSymbols).mockReturnValue(null);
  (useDocInfo as unknown as { setState: (p: { view: unknown }) => void }).setState({ view: FAKE_VIEW });
  useProject.setState({ active: "/repo/a.ts" });
  useCursor.setState({ line: 1, col: 1 });
});

describe("OutlinePanel", () => {
  it("shows the no-file state when nothing is active", () => {
    useProject.setState({ active: null });
    render(<OutlinePanel />);
    expect(screen.getByText("outline.noFile")).toBeInTheDocument();
  });

  it("shows the empty state when the file has no symbols", () => {
    vi.mocked(extractSymbols).mockReturnValue([]);
    render(<OutlinePanel />);
    expect(screen.getByText("outline.empty")).toBeInTheDocument();
  });

  it("shows the empty state when there is no editor view", () => {
    (useDocInfo as unknown as { setState: (p: { view: unknown }) => void }).setState({ view: null });
    render(<OutlinePanel />);
    expect(screen.getByText("outline.empty")).toBeInTheDocument();
  });

  it("renders heuristic symbols and jumps on click", async () => {
    const syms: OutlineSymbol[] = [
      { name: "alpha", kind: "function", line: 3 },
      { name: "beta", kind: "method", line: 8 },
    ];
    vi.mocked(extractSymbols).mockReturnValue(syms);
    render(<OutlinePanel />);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();

    await userEvent.click(screen.getByText("alpha"));
    expect(goToLine).toHaveBeenCalledWith(3);
  });

  it("marks the symbol under the cursor as current", () => {
    vi.mocked(extractSymbols).mockReturnValue([
      { name: "alpha", kind: "function", line: 3 },
      { name: "beta", kind: "function", line: 8 },
    ]);
    useCursor.setState({ line: 9, col: 1 });
    render(<OutlinePanel />);
    const current = screen.getByText("beta").closest("button");
    expect(current?.className).toContain("bg-selection");
  });

  it("prefers language-server symbols when available", async () => {
    vi.mocked(extractSymbols).mockReturnValue([{ name: "heuristic", kind: "function", line: 1 }]);
    vi.mocked(lspDocumentSymbols).mockReturnValue(
      Promise.resolve([{ name: "fromServer", kind: "class", line: 2 }]),
    );
    render(<OutlinePanel />);
    await waitFor(() => expect(screen.getByText("fromServer")).toBeInTheDocument());
  });
});
