// Anchored Q&A store: load/ask/view/remove/close + the index + polling helpers.
// api file IO, the terminal-agent dispatch, and the logger are mocked at the edges.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api", () => ({
  readFile: vi.fn(),
  createFile: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
}));
vi.mock("../agents", () => ({
  dispatchToAgent: vi.fn(async () => {}),
  sanitizePromptText: (s: string) => `SANITIZED(${s})`,
}));
vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  safeError: (e: unknown) => String(e),
}));

import { useQa, type QaNote } from "../qa";
import { useProject } from "../store";
import { readFile, createFile, writeFile } from "../api";
import { dispatchToAgent } from "../agents";

const INDEX = ".reado/qa.json";
const txt = (text: string) => ({ kind: "text" as const, text });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  useProject.setState({ root: "/proj" });
  useQa.setState({ open: false, relPath: null, status: "loading", text: "", notes: [] });
});

afterEach(() => {
  useQa.getState().close();
  vi.useRealTimers();
});

describe("load", () => {
  it("parses a valid index file", async () => {
    const notes: QaNote[] = [{ id: "a", file: "src/a.ts", line: 3, question: "why?", time: 1 }];
    vi.mocked(readFile).mockResolvedValue(txt(JSON.stringify(notes)));
    await useQa.getState().load("/proj");
    expect(useQa.getState().notes).toEqual(notes);
  });

  it("returns empty notes when the index is missing", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("nope"));
    await useQa.getState().load("/proj");
    expect(useQa.getState().notes).toEqual([]);
  });

  it("returns empty notes when the index is corrupt JSON", async () => {
    vi.mocked(readFile).mockResolvedValue(txt("{ not json"));
    await useQa.getState().load("/proj");
    expect(useQa.getState().notes).toEqual([]);
  });

  it("returns empty notes when the index is not a text file", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "binary", size: 10 } as never);
    await useQa.getState().load("/proj");
    expect(useQa.getState().notes).toEqual([]);
  });
});

describe("ask", () => {
  it("upserts the index, dispatches a sanitized prompt, and polls the answer", async () => {
    useQa.setState({
      notes: [{ id: "src__a.ts__L5", file: "src/a.ts", line: 5, question: "old", time: 0 }],
    });
    let answer = "";
    vi.mocked(readFile).mockImplementation(async () => txt(answer));

    useQa.getState().ask("src/a.ts", 5, 9, "What does this do?");

    const s = useQa.getState();
    expect(s.open).toBe(true);
    expect(s.relPath).toBe("src/a.ts");
    expect(s.status).toBe("loading");
    // Upsert replaces the existing same-id note (no duplicate).
    expect(s.notes.filter((n) => n.id === "src__a.ts__L5")).toHaveLength(1);
    expect(s.notes[0].question).toBe("What does this do?");

    await vi.advanceTimersByTimeAsync(0); // flush the fire-and-forget saveIndex chain
    expect(createFile).toHaveBeenCalledWith("/proj", INDEX);
    expect(writeFile).toHaveBeenCalledWith("/proj", INDEX, expect.any(String));
    expect(dispatchToAgent).toHaveBeenCalledOnce();
    expect(vi.mocked(dispatchToAgent).mock.calls[0][0]).toContain("SANITIZED(What does this do?)");

    answer = "# Answer";
    await vi.advanceTimersByTimeAsync(1500);
    expect(useQa.getState().status).toBe("ready");
    expect(useQa.getState().text).toBe("# Answer");
  });

  it("goes to error after 40 empty poll attempts", async () => {
    vi.mocked(readFile).mockImplementation(async () => txt(""));
    useQa.getState().ask("src/a.ts", 1, 2, "q");
    await vi.advanceTimersByTimeAsync(40 * 1500);
    expect(useQa.getState().status).toBe("error");
  });
});

describe("view", () => {
  const note: QaNote = { id: "n1", file: "src/a.ts", line: 1, question: "q", time: 0 };

  it("reads and shows an existing answer", async () => {
    vi.mocked(readFile).mockResolvedValue(txt("# Stored answer"));
    useQa.getState().view(note);
    expect(useQa.getState().open).toBe(true);
    await vi.runOnlyPendingTimersAsync();
    expect(useQa.getState().status).toBe("ready");
    expect(useQa.getState().text).toBe("# Stored answer");
  });

  it("errors when the answer file is empty", async () => {
    vi.mocked(readFile).mockResolvedValue(txt("   "));
    useQa.getState().view(note);
    await vi.runOnlyPendingTimersAsync();
    expect(useQa.getState().status).toBe("error");
  });

  it("errors when the answer file cannot be read", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("missing"));
    useQa.getState().view(note);
    await vi.runOnlyPendingTimersAsync();
    expect(useQa.getState().status).toBe("error");
  });

  it("ignores a resolved read after the modal was closed", async () => {
    vi.mocked(readFile).mockResolvedValue(txt("# Stored answer"));
    useQa.getState().view(note);
    useQa.getState().close(); // bumps token
    await vi.runOnlyPendingTimersAsync();
    expect(useQa.getState().open).toBe(false);
  });
});

describe("remove", () => {
  it("drops the note from the index and persists", async () => {
    useQa.setState({
      notes: [
        { id: "a", file: "x", line: 1, question: "q", time: 0 },
        { id: "b", file: "y", line: 2, question: "q", time: 0 },
      ],
    });
    useQa.getState().remove("/proj", "a");
    expect(useQa.getState().notes.map((n) => n.id)).toEqual(["b"]);
    await vi.advanceTimersByTimeAsync(0); // flush the fire-and-forget saveIndex chain
    expect(writeFile).toHaveBeenCalledWith("/proj", INDEX, expect.any(String));
  });
});

describe("close", () => {
  it("closes the modal", () => {
    useQa.setState({ open: true });
    useQa.getState().close();
    expect(useQa.getState().open).toBe(false);
  });
});
