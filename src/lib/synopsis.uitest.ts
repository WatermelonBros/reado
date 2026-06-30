// File-synopsis store. Covers the cache-hit (fresh + stale) path and the
// cache-miss dispatch+poll path (success, error budget, supersede), plus
// regenerate and close. Edges (api, agents, store) are mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./api", () => ({
  readFile: vi.fn(),
  createFile: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
}));
vi.mock("./agents", () => ({ dispatchToAgent: vi.fn(() => Promise.resolve()) }));
const projectState = { root: "/p" };
vi.mock("./store", () => ({ useProject: { getState: () => projectState } }));

import { useSynopsis } from "./synopsis";
import { readFile, createFile, writeFile } from "./api";
import { dispatchToAgent } from "./agents";

const REL = "src/a.ts";
const text = (t: string) => ({ kind: "text", text: t });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockReset();
  vi.mocked(createFile).mockResolvedValue(undefined as never);
  vi.mocked(writeFile).mockResolvedValue(undefined as never);
  vi.mocked(dispatchToAgent).mockResolvedValue(undefined as never);
  useSynopsis.setState({ open: false, relPath: null, status: "loading", text: "", stale: false });
});

afterEach(() => {
  // Cancel any in-flight poll so it can't bleed into the next test.
  useSynopsis.getState().close();
});

describe("show — cache hit", () => {
  it("renders a cached synopsis and reports it fresh", async () => {
    vi.mocked(readFile).mockImplementation((_root, path) => {
      if (path.endsWith(".md")) return Promise.resolve(text("CACHED")) as never;
      return Promise.resolve(null) as never; // hash sidecar missing -> not stale
    });
    useSynopsis.getState().show(REL);
    expect(useSynopsis.getState().open).toBe(true);
    await vi.waitFor(() => expect(useSynopsis.getState().status).toBe("ready"));
    expect(useSynopsis.getState().text).toBe("CACHED");
    expect(useSynopsis.getState().stale).toBe(false);
    expect(dispatchToAgent).not.toHaveBeenCalled();
  });

  it("flags staleness when the source hash differs", async () => {
    vi.mocked(readFile).mockImplementation((_root, path) => {
      if (path.endsWith(".md")) return Promise.resolve(text("CACHED")) as never;
      if (path.endsWith(".hash")) return Promise.resolve(text("oldhash")) as never;
      return Promise.resolve(text("changed source")) as never;
    });
    useSynopsis.getState().show(REL);
    await vi.waitFor(() => expect(useSynopsis.getState().status).toBe("ready"));
    expect(useSynopsis.getState().stale).toBe(true);
  });
});

describe("show — cache miss", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("dispatches the agent, polls and records freshness on success", async () => {
    let md = 0;
    vi.mocked(readFile).mockImplementation((_root, path) => {
      if (path.endsWith(".md")) {
        md++;
        return Promise.resolve(text(md === 1 ? "" : "GENERATED")) as never; // 1st empty -> miss
      }
      if (path.endsWith(".hash")) return Promise.resolve(null) as never;
      return Promise.resolve(text("source")) as never;
    });
    useSynopsis.getState().show(REL);
    await vi.advanceTimersByTimeAsync(0); // run the initial then/catch
    expect(dispatchToAgent).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1600); // first poll tick
    expect(useSynopsis.getState().status).toBe("ready");
    expect(useSynopsis.getState().text).toBe("GENERATED");
    await vi.advanceTimersByTimeAsync(0);
    // recordFreshness wrote the hash sidecar.
    expect(createFile).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith("/p", expect.stringContaining(".hash"), expect.any(String));
  });

  it("errors out after the poll budget with no synopsis", async () => {
    vi.mocked(readFile).mockImplementation((_root, path) =>
      path.endsWith(".md") ? (Promise.resolve(text("")) as never) : (Promise.resolve(null) as never),
    );
    useSynopsis.getState().show(REL);
    await vi.advanceTimersByTimeAsync(0);
    expect(dispatchToAgent).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(40 * 1500 + 100);
    expect(useSynopsis.getState().status).toBe("error");
  });

  it("a closed modal cancels the in-flight poll", async () => {
    vi.mocked(readFile).mockImplementation((_root, path) =>
      path.endsWith(".md")
        ? (Promise.resolve(text("")) as never)
        : (Promise.resolve(text("source")) as never),
    );
    useSynopsis.getState().show(REL);
    await vi.advanceTimersByTimeAsync(0);
    useSynopsis.getState().close();
    // Even if a synopsis appears, the superseded poll must not resurrect it.
    vi.mocked(readFile).mockImplementation((_root, path) =>
      path.endsWith(".md") ? (Promise.resolve(text("LATE")) as never) : (Promise.resolve(null) as never),
    );
    await vi.advanceTimersByTimeAsync(5 * 1500);
    expect(useSynopsis.getState().status).toBe("loading");
    expect(useSynopsis.getState().open).toBe(false);
  });
});

describe("regenerate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does nothing when no file is open", () => {
    useSynopsis.setState({ relPath: null });
    useSynopsis.getState().regenerate();
    expect(dispatchToAgent).not.toHaveBeenCalled();
  });

  it("re-dispatches and polls for the active file", async () => {
    useSynopsis.setState({ relPath: REL });
    vi.mocked(readFile).mockImplementation((_root, path) =>
      path.endsWith(".md")
        ? (Promise.resolve(text("REGEN")) as never)
        : (Promise.resolve(null) as never),
    );
    useSynopsis.getState().regenerate();
    expect(useSynopsis.getState().status).toBe("loading");
    expect(dispatchToAgent).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1600);
    expect(useSynopsis.getState().status).toBe("ready");
    expect(useSynopsis.getState().text).toBe("REGEN");
  });
});

describe("close", () => {
  it("closes the modal", () => {
    useSynopsis.setState({ open: true });
    useSynopsis.getState().close();
    expect(useSynopsis.getState().open).toBe(false);
  });
});
