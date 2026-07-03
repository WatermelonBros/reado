// Semantic-search store: dispatches a prompt to the terminal agent, then polls
// `.reado/semantic.json`. Timers are faked to drive the poll loop deterministically.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api", () => ({ readFile: vi.fn() }));
vi.mock("../agents", () => ({
  dispatchToAgent: vi.fn(async () => {}),
  sanitizePromptText: (s: string) => s,
}));
vi.mock("../store", () => ({ useProject: { getState: () => ({ root: "/root" }) } }));

import { useSemanticSearch } from "../semanticSearch";
import { readFile } from "../api";
import { dispatchToAgent } from "../agents";

const text = (t: string) => ({ kind: "text" as const, text: t });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  useSemanticSearch.setState({ open: false, query: "", status: "loading", results: [] });
});
afterEach(() => {
  useSemanticSearch.getState().close();
  vi.useRealTimers();
});

describe("run", () => {
  it("opens the panel and dispatches a prompt to the agent", () => {
    vi.mocked(readFile).mockResolvedValue(null as never);
    useSemanticSearch.getState().run("where do we auth");
    const s = useSemanticSearch.getState();
    expect(s.open).toBe(true);
    expect(s.query).toBe("where do we auth");
    expect(s.status).toBe("loading");
    expect(dispatchToAgent).toHaveBeenCalledOnce();
    expect(vi.mocked(dispatchToAgent).mock.calls[0][0]).toContain("where do we auth");
    expect(vi.mocked(dispatchToAgent).mock.calls[0][0]).toContain(".reado/semantic.json");
  });

  it("becomes ready with parsed hits when the agent writes results", async () => {
    vi.mocked(readFile).mockResolvedValue(
      text(JSON.stringify([{ file: "a.ts", line: 5, snippet: "x" }])),
    );
    useSemanticSearch.getState().run("q");
    await vi.advanceTimersByTimeAsync(1500);
    const s = useSemanticSearch.getState();
    expect(s.status).toBe("ready");
    expect(s.results).toEqual([{ file: "a.ts", line: 5, snippet: "x" }]);
  });

  it("defaults missing line/snippet fields and skips entries without a file", async () => {
    vi.mocked(readFile).mockResolvedValue(
      text(JSON.stringify([{ file: "a.ts" }, { line: 3 }, { file: "b.ts", line: "no", snippet: 1 }])),
    );
    useSemanticSearch.getState().run("q");
    await vi.advanceTimersByTimeAsync(1500);
    expect(useSemanticSearch.getState().results).toEqual([
      { file: "a.ts", line: 1, snippet: "" },
      { file: "b.ts", line: 1, snippet: "" },
    ]);
  });

  it("is an error when the JSON is not an array", async () => {
    vi.mocked(readFile).mockResolvedValue(text("42"));
    useSemanticSearch.getState().run("q");
    await vi.advanceTimersByTimeAsync(1500);
    const s = useSemanticSearch.getState();
    expect(s.status).toBe("error");
    expect(s.results).toEqual([]);
  });

  it("is an error when the results file is malformed JSON", async () => {
    vi.mocked(readFile).mockResolvedValue(text("{ not json"));
    useSemanticSearch.getState().run("q");
    await vi.advanceTimersByTimeAsync(1500);
    expect(useSemanticSearch.getState().status).toBe("error");
  });

  it("keeps polling past empty/whitespace files, then errors out after the timeout", async () => {
    // First poll: blank file (loop continues). Then a read error. Then nulls forever.
    vi.mocked(readFile)
      .mockResolvedValueOnce(text("   "))
      .mockRejectedValueOnce(new Error("not yet"))
      .mockResolvedValue(null as never);
    useSemanticSearch.getState().run("q");
    // 60 polls * 1500ms.
    await vi.advanceTimersByTimeAsync(60 * 1500);
    expect(useSemanticSearch.getState().status).toBe("error");
  });

  it("a superseding run cancels the previous poll loop", async () => {
    vi.mocked(readFile).mockResolvedValue(null as never);
    useSemanticSearch.getState().run("first");
    // New run bumps the token; the old loop should bail on its next tick.
    vi.mocked(readFile).mockResolvedValue(
      text(JSON.stringify([{ file: "z.ts", line: 1, snippet: "" }])),
    );
    useSemanticSearch.getState().run("second");
    await vi.advanceTimersByTimeAsync(1500);
    const s = useSemanticSearch.getState();
    expect(s.query).toBe("second");
    expect(s.status).toBe("ready");
    expect(s.results).toEqual([{ file: "z.ts", line: 1, snippet: "" }]);
  });
});

describe("close", () => {
  it("closes the panel and stops the in-flight poll loop", async () => {
    vi.mocked(readFile).mockResolvedValue(
      text(JSON.stringify([{ file: "a.ts", line: 1, snippet: "" }])),
    );
    useSemanticSearch.getState().run("q");
    useSemanticSearch.getState().close();
    expect(useSemanticSearch.getState().open).toBe(false);
    // The loop was cancelled, so the status never flips to ready.
    await vi.advanceTimersByTimeAsync(1500);
    expect(useSemanticSearch.getState().status).toBe("loading");
  });
});
