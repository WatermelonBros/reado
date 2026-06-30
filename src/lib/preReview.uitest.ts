// AI pre-review store: load/generate/approve/discard + the JSON parser. api file
// IO, the terminal-agent dispatch, the comments store, and the logger are mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./api", () => ({
  readFile: vi.fn(),
  createFile: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
}));
vi.mock("./agents", () => ({ dispatchToAgent: vi.fn(async () => {}) }));
vi.mock("./comments", () => ({ useComments: { getState: vi.fn() } }));
vi.mock("./logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  safeError: (e: unknown) => String(e),
}));

import { usePreReview, type Draft } from "./preReview";
import { readFile, createFile, writeFile } from "./api";
import { dispatchToAgent } from "./agents";
import { useComments } from "./comments";

const STORE = ".reado/pre-review.json";
const txt = (text: string) => ({ kind: "text" as const, text });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  usePreReview.setState({ drafts: [], generating: false });
});

afterEach(() => {
  // discard bumps nothing, but generate uses a module token; reset by re-mocking
  vi.useRealTimers();
});

describe("load", () => {
  it("parses drafts from the store file", async () => {
    const raw = [{ file: "src/a.ts", line: 4, type: "bug", body: "leak" }];
    vi.mocked(readFile).mockResolvedValue(txt(JSON.stringify(raw)));
    await usePreReview.getState().load("/proj");
    const d = usePreReview.getState().drafts;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ file: "src/a.ts", line: 4, type: "bug", body: "leak" });
    expect(d[0].id).toBe("pr_0_src_a.ts_4");
  });

  it("normalizes an unknown type to note and defaults a missing line to 1", async () => {
    const raw = [{ file: "src/a.ts", type: "wat", body: "hmm" }];
    vi.mocked(readFile).mockResolvedValue(txt(JSON.stringify(raw)));
    await usePreReview.getState().load("/proj");
    expect(usePreReview.getState().drafts[0]).toMatchObject({ type: "note", line: 1 });
  });

  it("filters out entries missing a file or body", async () => {
    const raw = [
      { file: "src/a.ts", body: "keep" },
      { file: "src/b.ts" }, // no body
      { body: "no file" }, // no file
      null,
    ];
    vi.mocked(readFile).mockResolvedValue(txt(JSON.stringify(raw)));
    await usePreReview.getState().load("/proj");
    expect(usePreReview.getState().drafts).toHaveLength(1);
    expect(usePreReview.getState().drafts[0].file).toBe("src/a.ts");
  });

  it("yields no drafts for a non-array JSON payload", async () => {
    vi.mocked(readFile).mockResolvedValue(txt(JSON.stringify({ not: "array" })));
    await usePreReview.getState().load("/proj");
    expect(usePreReview.getState().drafts).toEqual([]);
  });

  it("yields no drafts for corrupt JSON", async () => {
    vi.mocked(readFile).mockResolvedValue(txt("{ broken"));
    await usePreReview.getState().load("/proj");
    expect(usePreReview.getState().drafts).toEqual([]);
  });

  it("yields no drafts when the store file is absent", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("missing"));
    await usePreReview.getState().load("/proj");
    expect(usePreReview.getState().drafts).toEqual([]);
  });

  it("yields no drafts when the store entry is not a text file", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "binary", size: 2 } as never);
    await usePreReview.getState().load("/proj");
    expect(usePreReview.getState().drafts).toEqual([]);
  });
});

describe("generate", () => {
  it("dispatches the prompt, then loads the drafts the agent wrote", async () => {
    let body = "";
    vi.mocked(readFile).mockImplementation(async () => txt(body));

    usePreReview.getState().generate("/proj");
    expect(usePreReview.getState().generating).toBe(true);
    expect(dispatchToAgent).toHaveBeenCalledOnce();
    expect(vi.mocked(dispatchToAgent).mock.calls[0][0]).toContain(STORE);

    body = JSON.stringify([{ file: "src/a.ts", line: 2, type: "refactor", body: "tidy" }]);
    await vi.advanceTimersByTimeAsync(1500);

    const s = usePreReview.getState();
    expect(s.generating).toBe(false);
    expect(s.drafts).toHaveLength(1);
    expect(s.drafts[0].type).toBe("refactor");
  });

  it("clears the generating flag after 60 empty polls", async () => {
    vi.mocked(readFile).mockImplementation(async () => txt(""));
    usePreReview.getState().generate("/proj");
    await vi.advanceTimersByTimeAsync(60 * 1500);
    expect(usePreReview.getState().generating).toBe(false);
  });
});

describe("approve", () => {
  const draft: Draft = { id: "d1", file: "src/a.ts", line: 7, type: "bug", body: "fix me" };

  it("creates a real comment, removes the draft, and persists", async () => {
    const create = vi.fn(async () => ({}));
    vi.mocked(useComments.getState).mockReturnValue({ create } as never);
    usePreReview.setState({ drafts: [draft] });

    await usePreReview.getState().approve("/proj", "d1");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        file: "src/a.ts",
        startLine: 7,
        endLine: 7,
        type: "bug",
        kind: "task",
        body: "fix me",
      }),
    );
    expect(usePreReview.getState().drafts).toEqual([]);
    await vi.advanceTimersByTimeAsync(0); // flush persist()
    expect(createFile).toHaveBeenCalledWith("/proj", STORE);
    expect(writeFile).toHaveBeenCalledWith("/proj", STORE, expect.any(String));
  });

  it("is a no-op when the draft id is unknown", async () => {
    const create = vi.fn();
    vi.mocked(useComments.getState).mockReturnValue({ create } as never);
    usePreReview.setState({ drafts: [draft] });

    await usePreReview.getState().approve("/proj", "missing");

    expect(create).not.toHaveBeenCalled();
    expect(usePreReview.getState().drafts).toEqual([draft]);
  });
});

describe("discard", () => {
  it("removes the draft and persists", async () => {
    const draft: Draft = { id: "d1", file: "src/a.ts", line: 1, type: "note", body: "x" };
    usePreReview.setState({ drafts: [draft] });
    usePreReview.getState().discard("/proj", "d1");
    expect(usePreReview.getState().drafts).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(writeFile).toHaveBeenCalledWith("/proj", STORE, expect.any(String));
  });
});
