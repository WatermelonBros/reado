// Custom in-app update store: availability/dismiss/toast and the install flow.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn(async () => {}) }));
vi.mock("./logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
  safeError: (e: unknown) => String(e),
}));

import { useUpdate } from "./update";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";

const fakeUpdate = (over: Partial<Update> = {}): Update =>
  ({
    version: "1.2.3",
    body: "release notes",
    downloadAndInstall: vi.fn(async () => {}),
    ...over,
  }) as unknown as Update;

beforeEach(() => {
  vi.clearAllMocks();
  useUpdate.setState({
    update: null,
    version: null,
    notes: null,
    open: false,
    dismissed: false,
    installing: false,
    toast: null,
  });
});

describe("setAvailable", () => {
  it("opens the modal with version + notes", () => {
    useUpdate.getState().setAvailable(fakeUpdate());
    const s = useUpdate.getState();
    expect(s.version).toBe("1.2.3");
    expect(s.notes).toBe("release notes");
    expect(s.open).toBe(true);
    expect(s.dismissed).toBe(false);
  });

  it("tolerates an update with no body", () => {
    useUpdate.getState().setAvailable(fakeUpdate({ body: undefined }));
    expect(useUpdate.getState().notes).toBeNull();
  });
});

describe("modal toggles", () => {
  it("reopen sets open", () => {
    useUpdate.getState().reopen();
    expect(useUpdate.getState().open).toBe(true);
  });
  it("dismiss closes but flags dismissed", () => {
    useUpdate.setState({ open: true });
    useUpdate.getState().dismiss();
    const s = useUpdate.getState();
    expect(s.open).toBe(false);
    expect(s.dismissed).toBe(true);
  });
});

describe("toast", () => {
  it("sets and clears", () => {
    useUpdate.getState().setToast({ kind: "info", text: "up to date" });
    expect(useUpdate.getState().toast).toEqual({ kind: "info", text: "up to date" });
    useUpdate.getState().clearToast();
    expect(useUpdate.getState().toast).toBeNull();
  });
});

describe("install", () => {
  it("is a no-op when there is no update", async () => {
    await useUpdate.getState().install();
    expect(useUpdate.getState().installing).toBe(false);
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("downloads, installs and relaunches on success", async () => {
    const u = fakeUpdate();
    useUpdate.setState({ update: u });
    await useUpdate.getState().install();
    expect(u.downloadAndInstall).toHaveBeenCalledOnce();
    expect(relaunch).toHaveBeenCalledOnce();
    expect(useUpdate.getState().toast).toBeNull();
  });

  it("reports an error toast when the install fails", async () => {
    const u = fakeUpdate({ downloadAndInstall: vi.fn(async () => { throw new Error("bad sig"); }) });
    useUpdate.setState({ update: u, open: true });
    await useUpdate.getState().install();
    const s = useUpdate.getState();
    expect(relaunch).not.toHaveBeenCalled();
    expect(s.installing).toBe(false);
    expect(s.open).toBe(false);
    expect(s.toast).toEqual({ kind: "error", text: "Error: bad sig" });
  });

  it("reports an error toast when the relaunch fails (already installed)", async () => {
    vi.mocked(relaunch).mockRejectedValueOnce(new Error("no restart"));
    const u = fakeUpdate();
    useUpdate.setState({ update: u, open: true });
    await useUpdate.getState().install();
    const s = useUpdate.getState();
    expect(u.downloadAndInstall).toHaveBeenCalledOnce();
    expect(s.installing).toBe(false);
    expect(s.open).toBe(false);
    expect(s.toast).toEqual({ kind: "error", text: "Error: no restart" });
  });
});
