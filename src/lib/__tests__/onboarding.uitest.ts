// Onboarding store: show/regenerate/close + the freshness + polling helpers.
// The terminal-agent dispatch, the api file IO, and the logger are mocked at the
// edges; polling is driven with fake timers.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../api", () => ({
  readFile: vi.fn(),
  createFile: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
  gitHead: vi.fn(),
}));
vi.mock("../agents", () => ({ dispatchToAgent: vi.fn(async () => {}) }));
vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  safeError: (e: unknown) => String(e),
}));

import { useOnboarding } from "../onboarding";
import { useProject } from "../store";
import { readFile, createFile, writeFile, gitHead } from "../api";
import { dispatchToAgent } from "../agents";

const PATH = ".reado/onboarding.md";
const HEAD_PATH = ".reado/onboarding.head";
const txt = (text: string) => ({ kind: "text" as const, text });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  useProject.setState({ root: "/proj" });
  useOnboarding.setState({ open: false, status: "loading", text: "", stale: false });
});

afterEach(() => {
  // Cancel any in-flight poll loop before restoring real timers.
  useOnboarding.getState().close();
  vi.useRealTimers();
});

describe("show", () => {
  it("renders an existing overview (not stale when HEAD is missing)", async () => {
    vi.mocked(readFile).mockImplementation(async (_root, path) =>
      path === PATH ? txt("# Overview") : (null as never),
    );
    vi.mocked(gitHead).mockResolvedValue(null as never);

    useOnboarding.getState().show();
    await vi.runOnlyPendingTimersAsync();

    const s = useOnboarding.getState();
    expect(s.open).toBe(true);
    expect(s.status).toBe("ready");
    expect(s.text).toBe("# Overview");
    expect(s.stale).toBe(false);
    expect(dispatchToAgent).not.toHaveBeenCalled();
  });

  it("flags staleness when HEAD advanced", async () => {
    vi.mocked(readFile).mockImplementation(async (_root, path) =>
      path === PATH ? txt("# Overview") : txt("oldsha"),
    );
    vi.mocked(gitHead).mockResolvedValue("newsha");

    useOnboarding.getState().show();
    await vi.runOnlyPendingTimersAsync();

    expect(useOnboarding.getState().stale).toBe(true);
  });

  it("is not stale when both the HEAD sidecar and gitHead reads fail", async () => {
    vi.mocked(readFile).mockImplementation(async (_root, path) => {
      if (path === PATH) return txt("# Overview");
      throw new Error("no sidecar"); // HEAD_PATH read rejects → catch arm
    });
    vi.mocked(gitHead).mockRejectedValue(new Error("no git")); // gitHead rejects → catch arm

    useOnboarding.getState().show();
    await vi.runOnlyPendingTimersAsync();

    expect(useOnboarding.getState().status).toBe("ready");
    expect(useOnboarding.getState().stale).toBe(false);
  });

  it("is not stale when the recorded HEAD still matches", async () => {
    vi.mocked(readFile).mockImplementation(async (_root, path) =>
      path === PATH ? txt("# Overview") : txt("samesha"),
    );
    vi.mocked(gitHead).mockResolvedValue("samesha");

    useOnboarding.getState().show();
    await vi.runOnlyPendingTimersAsync();

    expect(useOnboarding.getState().stale).toBe(false);
  });

  it("generates + polls when no overview exists yet, then records freshness", async () => {
    let body = ""; // empty → triggers generation
    vi.mocked(readFile).mockImplementation(async (_root, path) =>
      path === PATH ? txt(body) : (null as never),
    );
    vi.mocked(gitHead).mockResolvedValue("headsha");

    useOnboarding.getState().show();
    await vi.runOnlyPendingTimersAsync(); // resolve the initial empty read → catch branch
    expect(dispatchToAgent).toHaveBeenCalledOnce();

    body = "# Generated"; // next poll read finds content
    await vi.advanceTimersByTimeAsync(1500);

    const s = useOnboarding.getState();
    expect(s.status).toBe("ready");
    expect(s.text).toBe("# Generated");
    // recordFreshness wrote the HEAD sidecar.
    await vi.runOnlyPendingTimersAsync();
    expect(createFile).toHaveBeenCalledWith("/proj", HEAD_PATH);
    expect(writeFile).toHaveBeenCalledWith("/proj", HEAD_PATH, "headsha");
  });

  it("skips writing the sidecar when gitHead is unavailable", async () => {
    let body = "";
    vi.mocked(readFile).mockImplementation(async (_root, path) =>
      path === PATH ? txt(body) : (null as never),
    );
    vi.mocked(gitHead).mockResolvedValue(null as never);

    useOnboarding.getState().show();
    await vi.runOnlyPendingTimersAsync();
    body = "# Generated";
    await vi.advanceTimersByTimeAsync(1500);
    await vi.runOnlyPendingTimersAsync();

    expect(useOnboarding.getState().status).toBe("ready");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("falls into error after polling 60 times with no content", async () => {
    vi.mocked(readFile).mockImplementation(async (_root, path) =>
      path === PATH ? txt("") : (null as never),
    );

    useOnboarding.getState().show();
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(60 * 1500);

    expect(useOnboarding.getState().status).toBe("error");
  });

  it("ignores a stale token if the modal was closed mid-load", async () => {
    vi.mocked(readFile).mockImplementation(async (_root, path) =>
      path === PATH ? txt("# Overview") : (null as never),
    );
    useOnboarding.getState().show();
    useOnboarding.getState().close(); // bumps the token
    await vi.runOnlyPendingTimersAsync();
    // The resolved read belongs to the old token → state stays at the close.
    expect(useOnboarding.getState().open).toBe(false);
  });
});

describe("regenerate", () => {
  it("dispatches the prompt and polls for the new overview", async () => {
    let body = "";
    vi.mocked(readFile).mockImplementation(async (_root, path) =>
      path === PATH ? txt(body) : (null as never),
    );
    vi.mocked(gitHead).mockResolvedValue(null as never);

    useOnboarding.getState().regenerate();
    expect(useOnboarding.getState().status).toBe("loading");
    expect(dispatchToAgent).toHaveBeenCalledOnce();

    body = "# Fresh";
    await vi.advanceTimersByTimeAsync(1500);
    expect(useOnboarding.getState().text).toBe("# Fresh");
  });
});

describe("close", () => {
  it("closes the modal", () => {
    useOnboarding.setState({ open: true });
    useOnboarding.getState().close();
    expect(useOnboarding.getState().open).toBe(false);
  });
});
