// UI test: the knowledge-base overlay indexes the project's docs/specs/notes,
// filters the index by name, and renders the selected document's markdown.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DocsView } from "../DocsView";
import { useComments } from "../../../lib/comments";
import { useSpecs, type SpecGroup } from "../../../lib/specs";
import { useProject, useWorkspace } from "../../../lib/store";
import { listFiles, readFile, searchText } from "../../../lib/api";

// The overlay fetches the file list, each document's contents, and full-text
// matches from Tauri on mount/interaction; stub those edges deterministically.
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  listFiles: vi.fn(),
  readFile: vi.fn(),
  searchText: vi.fn(),
}));

const ROOT = "/repo";

const SPECS: SpecGroup[] = [
  {
    title: "auth",
    kind: "spec",
    items: [{ label: "spec.md", path: ".openspec/specs/auth/spec.md", isSpec: true }],
  },
];

function seed() {
  vi.mocked(listFiles).mockResolvedValue([
    "README.md",
    "docs/guide.md",
    "src/app.ts",
    ".openspec/specs/auth/spec.md",
  ]);
  vi.mocked(searchText).mockResolvedValue([]);
  vi.mocked(readFile).mockImplementation((_root: string, path: string) =>
    Promise.resolve({
      kind: "text" as const,
      text: path.endsWith("guide.md") ? "# Guide Heading\n\nguide body" : "# Readme Heading\n\nreadme body",
    }),
  );

  useComments.setState({ comments: [], archived: [], loadArchived: vi.fn(), setActive: vi.fn() });
  useSpecs.setState({ groups: SPECS, expanded: new Set() });
  useProject.setState({ root: ROOT, open: vi.fn() });
  useWorkspace.setState({ docsOpen: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
});

describe("DocsView", () => {
  it("renders the index of docs, specs and notes", async () => {
    render(<DocsView />);

    // Docs (README has no slash → basename; nested docs keep their path label).
    expect(await screen.findByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
    // Specs group + its extension-stripped document.
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByText("spec")).toBeInTheDocument();
    // Section headings + the always-present notes entry.
    expect(screen.getByText("kb.docs")).toBeInTheDocument();
    expect(screen.getByText("kb.specs")).toBeInTheDocument();
    expect(screen.getAllByText("kb.notes").length).toBeGreaterThan(0);
  });

  it("typing in the filter narrows the doc index by name", async () => {
    render(<DocsView />);
    expect(await screen.findByText("README.md")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("kb.search"), "guide");

    await waitFor(() => expect(screen.queryByText("README.md")).not.toBeInTheDocument());
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
  });

  it("selecting a doc renders its markdown content", async () => {
    render(<DocsView />);

    // README is opened by default → its markdown renders.
    expect(await screen.findByText("Readme Heading")).toBeInTheDocument();

    // Switching to another doc renders that document's markdown.
    await userEvent.click(screen.getByText("docs/guide.md"));
    expect(await screen.findByText("Guide Heading")).toBeInTheDocument();
  });
});
