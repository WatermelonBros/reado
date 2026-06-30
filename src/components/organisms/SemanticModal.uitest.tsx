// Semantic search results modal: the loading / error / ready (ranked hits) states
// and jumping to a hit (open the file at the line + close). Store actions are
// stubbed via setState so no real work runs; i18n is mocked to keys.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { SemanticModal } from "./SemanticModal";
import { useSemanticSearch } from "../../lib/semanticSearch";
import { useProject } from "../../lib/store";

const openFile = vi.fn();
const close = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useProject.setState({ root: "/proj", open: openFile });
  useSemanticSearch.setState({ open: false, query: "", status: "loading", results: [], close });
});

describe("SemanticModal", () => {
  it("renders nothing while closed", () => {
    render(<SemanticModal />);
    expect(screen.queryByText("semantic.title")).not.toBeInTheDocument();
  });

  it("shows the query in the header and a generating message while loading", () => {
    useSemanticSearch.setState({ open: true, query: "where is auth", status: "loading" });
    render(<SemanticModal />);
    expect(screen.getByText(/where is auth/)).toBeInTheDocument();
    expect(screen.getByText("semantic.generating")).toBeInTheDocument();
  });

  it("shows the error message on failure", () => {
    useSemanticSearch.setState({ open: true, query: "q", status: "error" });
    render(<SemanticModal />);
    expect(screen.getByText("semantic.error")).toBeInTheDocument();
  });

  it("lists ranked hits and jumps to one on click", async () => {
    useSemanticSearch.setState({
      open: true,
      query: "q",
      status: "ready",
      results: [
        { file: "src/a.ts", line: 12, snippet: "const a = 1" },
        { file: "src/b.ts", line: 3, snippet: "" },
      ],
    });
    render(<SemanticModal />);
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("const a = 1")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts")).toBeInTheDocument();

    await userEvent.click(screen.getByText("src/a.ts"));
    expect(openFile).toHaveBeenCalledWith("/proj/src/a.ts", 12);
    expect(close).toHaveBeenCalledOnce();
  });
});
