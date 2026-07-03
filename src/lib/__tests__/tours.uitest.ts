// Reading-tours store. Covers load/CRUD/navigation plus the AI-generate poll loop
// (success, supersede, invalid-then-valid, and timeout). Edges are mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api", () => ({
  readFile: vi.fn(),
  createFile: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
}));
vi.mock("../agents", () => ({ dispatchToAgent: vi.fn(() => Promise.resolve()) }));
const projectState: { root: string; active: string | null; open: ReturnType<typeof vi.fn> } = {
  root: "/p",
  active: "/p/src/a.ts",
  open: vi.fn(),
};
vi.mock("../store", () => ({ useProject: { getState: () => projectState } }));
const docState: { view: unknown } = { view: null };
vi.mock("../docInfo", () => ({ useDocInfo: { getState: () => docState } }));

import { useTours, type Tour } from "../tours";
import { readFile, createFile, writeFile } from "../api";
import { dispatchToAgent } from "../agents";

const STORE = ".reado/tours.json";

const tour = (p: Partial<Tour> = {}): Tour => ({ id: "t1", name: "T", steps: [], ...p });

const fakeView = (line: number, head: number) => ({
  state: { doc: { lineAt: (_h: number) => ({ number: line }) }, selection: { main: { head } } },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFile).mockReset();
  vi.mocked(createFile).mockResolvedValue(undefined as never);
  vi.mocked(writeFile).mockResolvedValue(undefined as never);
  vi.mocked(dispatchToAgent).mockResolvedValue(undefined as never);
  projectState.root = "/p";
  projectState.active = "/p/src/a.ts";
  docState.view = null;
  useTours.setState({ tours: [], running: null, generating: false });
});

describe("load", () => {
  it("parses a saved tours file", async () => {
    vi.mocked(readFile).mockResolvedValue({
      kind: "text",
      text: JSON.stringify([tour({ id: "x", name: "Walk" })]),
    } as never);
    await useTours.getState().load("/p");
    expect(useTours.getState().tours).toHaveLength(1);
    expect(useTours.getState().tours[0].name).toBe("Walk");
    expect(useTours.getState().running).toBeNull();
  });

  it("yields an empty list on corrupt JSON", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "text", text: "{ broken" } as never);
    await useTours.getState().load("/p");
    expect(useTours.getState().tours).toEqual([]);
  });

  it("yields an empty list for a non-text / missing file", async () => {
    vi.mocked(readFile).mockResolvedValue({ kind: "binary" } as never);
    await useTours.getState().load("/p");
    expect(useTours.getState().tours).toEqual([]);
  });

  it("yields an empty list when the read fails", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("nope"));
    await useTours.getState().load("/p");
    expect(useTours.getState().tours).toEqual([]);
  });
});

describe("CRUD", () => {
  it("creates a tour and saves it", async () => {
    useTours.getState().createTour("/p", "New");
    expect(useTours.getState().tours).toHaveLength(1);
    expect(useTours.getState().tours[0].name).toBe("New");
    await new Promise((r) => setTimeout(r));
    expect(createFile).toHaveBeenCalledWith("/p", STORE);
    expect(writeFile).toHaveBeenCalledWith("/p", STORE, expect.stringContaining("New"));
  });

  it("removes a tour and stops it if it was running", () => {
    useTours.setState({ tours: [tour({ id: "t1" })], running: { tourId: "t1", index: 0 } });
    useTours.getState().removeTour("/p", "t1");
    expect(useTours.getState().tours).toEqual([]);
    expect(useTours.getState().running).toBeNull();
  });

  it("keeps a different running tour when removing", () => {
    useTours.setState({
      tours: [tour({ id: "t1" }), tour({ id: "t2" })],
      running: { tourId: "t2", index: 0 },
    });
    useTours.getState().removeTour("/p", "t1");
    expect(useTours.getState().running).toEqual({ tourId: "t2", index: 0 });
  });

  it("adds a step at the cursor, project-relative with forward slashes", () => {
    docState.view = fakeView(7, 3);
    projectState.active = "/p\\src\\a.ts";
    useTours.setState({ tours: [tour({ id: "t1" })] });
    useTours.getState().addStepHere("/p", "t1", "look here");
    const step = useTours.getState().tours[0].steps[0];
    expect(step).toEqual({ file: "src/a.ts", line: 7, note: "look here" });
  });

  it("passes through a path outside the root", () => {
    docState.view = fakeView(2, 0);
    projectState.active = "elsewhere/a.ts";
    useTours.setState({ tours: [tour({ id: "t1" })] });
    useTours.getState().addStepHere("/p", "t1", "n");
    expect(useTours.getState().tours[0].steps[0].file).toBe("elsewhere/a.ts");
  });

  it("does nothing when there is no editor view", () => {
    docState.view = null;
    useTours.setState({ tours: [tour({ id: "t1" })] });
    useTours.getState().addStepHere("/p", "t1", "n");
    expect(useTours.getState().tours[0].steps).toEqual([]);
  });

  it("does nothing when no file is active", () => {
    docState.view = fakeView(1, 0);
    projectState.active = null;
    useTours.setState({ tours: [tour({ id: "t1" })] });
    useTours.getState().addStepHere("/p", "t1", "n");
    expect(useTours.getState().tours[0].steps).toEqual([]);
  });

  it("removes a step by index", () => {
    useTours.setState({
      tours: [
        tour({
          id: "t1",
          steps: [
            { file: "a", line: 1, note: "x" },
            { file: "b", line: 2, note: "y" },
          ],
        }),
      ],
    });
    useTours.getState().removeStep("/p", "t1", 0);
    const steps = useTours.getState().tours[0].steps;
    expect(steps).toHaveLength(1);
    expect(steps[0].file).toBe("b");
  });
});

describe("navigation", () => {
  it("starts a tour and opens the first step", () => {
    useTours.setState({
      tours: [tour({ id: "t1", steps: [{ file: "src/a.ts", line: 7, note: "" }] })],
    });
    useTours.getState().start("t1");
    expect(useTours.getState().running).toEqual({ tourId: "t1", index: 0 });
    expect(projectState.open).toHaveBeenCalledWith("/p/src/a.ts", 7);
  });

  it("does not start an empty tour", () => {
    useTours.setState({ tours: [tour({ id: "t1", steps: [] })] });
    useTours.getState().start("t1");
    expect(useTours.getState().running).toBeNull();
    expect(projectState.open).not.toHaveBeenCalled();
  });

  it("does nothing starting an unknown tour", () => {
    useTours.getState().start("missing");
    expect(useTours.getState().running).toBeNull();
  });

  it("stops a running tour", () => {
    useTours.setState({ running: { tourId: "t1", index: 0 } });
    useTours.getState().stop();
    expect(useTours.getState().running).toBeNull();
  });

  it("advances and clamps within bounds", () => {
    useTours.setState({
      tours: [
        tour({
          id: "t1",
          steps: [
            { file: "a", line: 1, note: "" },
            { file: "b", line: 2, note: "" },
            { file: "c", line: 3, note: "" },
          ],
        }),
      ],
      running: { tourId: "t1", index: 0 },
    });
    useTours.getState().go(1);
    expect(useTours.getState().running?.index).toBe(1);
    useTours.getState().go(-5);
    expect(useTours.getState().running?.index).toBe(0);
    expect(projectState.open).toHaveBeenLastCalledWith("/p/a", 1);
  });

  it("ignores go without a running tour", () => {
    useTours.getState().go(1);
    expect(useTours.getState().running).toBeNull();
  });

  it("ignores go when the running tour no longer exists", () => {
    useTours.setState({ running: { tourId: "gone", index: 0 } });
    useTours.getState().go(1);
    expect(projectState.open).not.toHaveBeenCalled();
  });
});

describe("generate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("dispatches a prompt and imports a valid AI tour", async () => {
    vi.mocked(readFile).mockResolvedValue({
      kind: "text",
      text: JSON.stringify({ name: "AI", steps: [{ file: "a", line: 1, note: "n" }] }),
    } as never);
    useTours.getState().generate("/p");
    expect(dispatchToAgent).toHaveBeenCalledOnce();
    expect(useTours.getState().generating).toBe(true);
    await vi.advanceTimersByTimeAsync(1600);
    expect(useTours.getState().generating).toBe(false);
    expect(((ts => ts[ts.length - 1])(useTours.getState().tours))?.name).toBe("AI");
  });

  it("a superseding generate cancels the earlier poll", async () => {
    vi.mocked(readFile).mockResolvedValue({
      kind: "text",
      text: JSON.stringify({ name: "Second", steps: [{ file: "a", line: 1, note: "n" }] }),
    } as never);
    useTours.getState().generate("/p"); // first (will be superseded)
    useTours.getState().generate("/p"); // second
    expect(dispatchToAgent).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1600);
    expect(useTours.getState().tours).toHaveLength(1);
    expect(useTours.getState().tours[0].name).toBe("Second");
  });

  it("keeps polling past invalid JSON until valid", async () => {
    vi.mocked(readFile)
      .mockResolvedValueOnce({ kind: "text", text: "{ broken" } as never)
      .mockResolvedValue({
        kind: "text",
        text: JSON.stringify({ steps: [{ file: "a", line: 1, note: "n" }] }),
      } as never);
    useTours.getState().generate("/p");
    await vi.advanceTimersByTimeAsync(3200);
    expect(useTours.getState().generating).toBe(false);
    expect(((ts => ts[ts.length - 1])(useTours.getState().tours))?.name).toBe("AI tour"); // default name
  });

  it("stops generating after the poll budget with no result", async () => {
    vi.mocked(readFile).mockResolvedValue(null as never);
    useTours.getState().generate("/p");
    await vi.advanceTimersByTimeAsync(60 * 1500 + 100);
    expect(useTours.getState().generating).toBe(false);
    expect(useTours.getState().tours).toHaveLength(0);
  });
});
