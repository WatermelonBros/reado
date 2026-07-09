// UI test: the Q&A panel renders its empty state, lists anchored notes grouped
// by file, opens a note's anchor on click, and removes a note. Stores are seeded
// directly; the file-system edges (`../../lib/api`) are mocked so no Tauri IPC
// is touched.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Only the persistence/read edges need mocking; the store logic itself is real.
vi.mock("../../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../../lib/api")>()),
  readFile: vi.fn(async () => ({ kind: "text", text: "the answer" })),
  createFile: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
}));

import { QaPanel } from "../QaPanel";
import { useQa, type QaNote } from "../../../lib/qa";
import { useProject } from "../../../lib/store";

const ROOT = "/repo";

function note(over: Partial<QaNote> = {}): QaNote {
  return {
    id: "src__a.ts__L12",
    file: "src/a.ts",
    line: 12,
    question: "why is this here?",
    time: 0,
    ...over,
  };
}

function seed(notes: QaNote[]) {
  const open = vi.fn();
  useQa.setState({ notes });
  useProject.setState({ root: ROOT, open });
  return { open };
}

beforeEach(() => {
  useQa.setState({ notes: [] });
});

describe("QaPanel", () => {
  it("shows the empty state when there are no notes", () => {
    seed([]);
    render(<QaPanel />);
    expect(screen.getByText("qa.empty")).toBeInTheDocument();
  });

  it("lists notes grouped by file with question + line", () => {
    seed([
      note({ id: "b1", file: "src/b.ts", line: 5, question: "what is b?" }),
      note({ id: "a1", file: "src/a.ts", line: 3, question: "what is a?" }),
    ]);
    render(<QaPanel />);

    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts")).toBeInTheDocument();
    expect(screen.getByText("what is a?")).toBeInTheDocument();
    expect(screen.getByText("what is b?")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("clicking a note opens the file at its anchor line", async () => {
    const { open } = seed([note({ file: "src/a.ts", line: 12, question: "why is this here?" })]);
    render(<QaPanel />);

    await userEvent.click(screen.getByText("why is this here?"));
    expect(open).toHaveBeenCalledWith(`${ROOT}/src/a.ts`, 12);
  });

  it("the remove action drops the note from the store", async () => {
    seed([note({ id: "gone", question: "delete me" })]);
    render(<QaPanel />);

    await userEvent.click(screen.getByRole("button", { name: "qa.remove" }));
    expect(useQa.getState().notes).toHaveLength(0);
    expect(screen.queryByText("delete me")).not.toBeInTheDocument();
  });
});
