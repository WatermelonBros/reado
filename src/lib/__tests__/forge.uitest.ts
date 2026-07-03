// Forge adapter store: detect/list/install/openPr/pullThreads/submit, with the
// backend CLI calls and the guided-review + comments stores mocked at the edges.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { startMock, loadMock } = vi.hoisted(() => ({ startMock: vi.fn(), loadMock: vi.fn() }));

vi.mock("../api", () => ({
  detectForge: vi.fn(),
  forgeCheckoutPr: vi.fn(),
  forgeCliPresent: vi.fn(),
  forgeListPrs: vi.fn(),
  forgePullThreads: vi.fn(),
  forgeSubmitReview: vi.fn(),
}));
vi.mock("../agents", () => ({ runInTerminal: vi.fn() }));
vi.mock("../extensions", () => ({ currentOS: vi.fn(() => "mac") }));
vi.mock("../guidedReview", () => ({ useGuidedReview: { getState: () => ({ start: startMock }) } }));
vi.mock("../comments", () => ({ useComments: { getState: () => ({ load: loadMock }) } }));

import { useForge, installCommandFor } from "../forge";
import {
  detectForge,
  forgeCheckoutPr,
  forgeCliPresent,
  forgeListPrs,
  forgePullThreads,
  forgeSubmitReview,
  type Forge,
  type Pr,
} from "../api";
import { runInTerminal } from "../agents";
import { currentOS } from "../extensions";

const forge = (over: Partial<Forge> = {}): Forge => ({
  provider: "github",
  host: "github.com",
  cli: "gh",
  term: "PR",
  hasAdapter: true,
  ...over,
});
const pr = (number = 7): Pr => ({ number, title: "t", author: "a", branch: "b" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentOS).mockReturnValue("mac");
  useForge.setState({ forge: null, cliPresent: null, prs: [], loadingPrs: false });
});

describe("installCommandFor", () => {
  it("returns the per-OS command for a known CLI", () => {
    expect(installCommandFor("gh")).toBe("brew install gh");
    vi.mocked(currentOS).mockReturnValue("windows");
    expect(installCommandFor("glab")).toBe("winget install --id glab.glab");
  });
  it("returns null for an unknown CLI", () => {
    expect(installCommandFor("svn")).toBeNull();
  });
});

describe("detect", () => {
  it("sets the forge and probes the CLI", async () => {
    vi.mocked(detectForge).mockResolvedValue(forge());
    vi.mocked(forgeCliPresent).mockResolvedValue(true);
    await useForge.getState().detect("/root");
    expect(forgeCliPresent).toHaveBeenCalledWith("gh");
    expect(useForge.getState().forge?.provider).toBe("github");
    expect(useForge.getState().cliPresent).toBe(true);
  });

  it("leaves cliPresent null when the forge has no CLI", async () => {
    vi.mocked(detectForge).mockResolvedValue(forge({ cli: undefined }));
    await useForge.getState().detect("/root");
    expect(forgeCliPresent).not.toHaveBeenCalled();
    expect(useForge.getState().cliPresent).toBeNull();
  });

  it("records cliPresent false when the probe rejects", async () => {
    vi.mocked(detectForge).mockResolvedValue(forge());
    vi.mocked(forgeCliPresent).mockRejectedValue(new Error("nope"));
    await useForge.getState().detect("/root");
    expect(useForge.getState().cliPresent).toBe(false);
  });

  it("clears the forge when detection fails", async () => {
    vi.mocked(detectForge).mockRejectedValue(new Error("no remote"));
    await useForge.getState().detect("/root");
    expect(useForge.getState().forge).toBeNull();
  });
});

describe("listPrs", () => {
  it("loads PRs and clears the loading flag", async () => {
    vi.mocked(forgeListPrs).mockResolvedValue([pr(1), pr(2)]);
    await useForge.getState().listPrs("/root");
    expect(useForge.getState().prs).toHaveLength(2);
    expect(useForge.getState().loadingPrs).toBe(false);
  });
  it("falls back to an empty list on error", async () => {
    vi.mocked(forgeListPrs).mockRejectedValue(new Error("boom"));
    await useForge.getState().listPrs("/root");
    expect(useForge.getState().prs).toEqual([]);
    expect(useForge.getState().loadingPrs).toBe(false);
  });
});

describe("installCli", () => {
  it("runs the install command in the terminal", () => {
    useForge.setState({ forge: forge() });
    useForge.getState().installCli();
    expect(runInTerminal).toHaveBeenCalledWith("brew install gh");
  });
  it("does nothing without a forge CLI", () => {
    useForge.setState({ forge: forge({ cli: undefined }) });
    useForge.getState().installCli();
    expect(runInTerminal).not.toHaveBeenCalled();
  });
  it("does nothing when the CLI has no known command", () => {
    useForge.setState({ forge: forge({ cli: "svn" }) });
    useForge.getState().installCli();
    expect(runInTerminal).not.toHaveBeenCalled();
  });
});

describe("openPr", () => {
  it("checks out, starts a guided review and pulls threads", async () => {
    vi.mocked(forgeCheckoutPr).mockResolvedValue(undefined as never);
    startMock.mockResolvedValue({ id: "sess-1" });
    vi.mocked(forgePullThreads).mockResolvedValue({ comments: [], dropped: 0 });
    const id = await useForge.getState().openPr("/root", pr(7));
    expect(forgeCheckoutPr).toHaveBeenCalledWith("/root", 7);
    expect(startMock).toHaveBeenCalledWith("/root", { kind: "pr", pr: "#7" }, undefined);
    expect(forgePullThreads).toHaveBeenCalledWith("/root", 7);
    expect(loadMock).toHaveBeenCalledWith("/root");
    expect(id).toBe("sess-1");
  });

  it("returns null when checkout fails", async () => {
    vi.mocked(forgeCheckoutPr).mockRejectedValue(new Error("dirty tree"));
    const id = await useForge.getState().openPr("/root", pr(7));
    expect(id).toBeNull();
    expect(startMock).not.toHaveBeenCalled();
  });

  it("returns null when the session could not start", async () => {
    vi.mocked(forgeCheckoutPr).mockResolvedValue(undefined as never);
    startMock.mockResolvedValue(null);
    vi.mocked(forgePullThreads).mockResolvedValue({ comments: [], dropped: 0 });
    const id = await useForge.getState().openPr("/root", pr(7));
    expect(id).toBeNull();
  });
});

describe("pullThreads", () => {
  it("reloads the inbox after a clean sync", async () => {
    vi.mocked(forgePullThreads).mockResolvedValue({ comments: [], dropped: 0 });
    await useForge.getState().pullThreads("/root", 7);
    expect(loadMock).toHaveBeenCalledWith("/root");
  });

  it("warns when some host threads were dropped", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(forgePullThreads).mockResolvedValue({ comments: [], dropped: 2 });
    await useForge.getState().pullThreads("/root", 7);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("2 host review thread(s)"));
    expect(loadMock).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("degrades to an empty sync when the pull rejects", async () => {
    vi.mocked(forgePullThreads).mockRejectedValue(new Error("offline"));
    await useForge.getState().pullThreads("/root", 7);
    expect(loadMock).toHaveBeenCalledWith("/root");
  });
});

describe("submit", () => {
  it("returns null on success", async () => {
    vi.mocked(forgeSubmitReview).mockResolvedValue(undefined as never);
    const err = await useForge.getState().submit("/root", 7, "approve", "lgtm");
    expect(forgeSubmitReview).toHaveBeenCalledWith("/root", 7, "approve", "lgtm");
    expect(err).toBeNull();
  });
  it("returns the stringified error on failure", async () => {
    vi.mocked(forgeSubmitReview).mockRejectedValue(new Error("403"));
    const err = await useForge.getState().submit("/root", 7, "comment", "x");
    expect(err).toBe("Error: 403");
  });
});
