// Cross-OS UI test: hash-based project routing round-trips correctly, including
// paths with spaces / unicode / Windows backslashes. Runs on all 3 OSes.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), ask: vi.fn() }));
vi.mock("../store", () => ({
  useRecents: { getState: () => ({ touch: vi.fn() }) },
  useProject: { getState: () => ({ root: "" }) },
}));

import { open as openDialog, ask } from "@tauri-apps/plugin-dialog";
import { currentProjectPath, openProject, closeProject, pickFolderAndOpen } from "../window";

const mockOpen = vi.mocked(openDialog);
const mockAsk = vi.mocked(ask);

beforeEach(() => {
  window.location.hash = "";
  mockOpen.mockReset();
  mockAsk.mockReset();
});

describe("project hash routing", () => {
  it("returns null when no project is in the hash", () => {
    expect(currentProjectPath()).toBeNull();
  });

  it("openProject encodes the path into the hash and currentProjectPath decodes it", async () => {
    await openProject("/Users/me/Projects/app");
    expect(window.location.hash).toBe("#project=%2FUsers%2Fme%2FProjects%2Fapp");
    expect(currentProjectPath()).toBe("/Users/me/Projects/app");
  });

  it("round-trips paths with spaces, unicode and Windows backslashes", async () => {
    for (const p of ["/tmp/weird name #1", "/проект/café", "C:\\Users\\me\\app"]) {
      await openProject(p);
      expect(currentProjectPath()).toBe(p);
    }
  });

  it("closeProject returns to the launcher (empty hash)", async () => {
    await openProject("/x");
    await closeProject();
    expect(window.location.hash).toBe("");
    expect(currentProjectPath()).toBeNull();
  });
});

describe("pickFolderAndOpen", () => {
  it("opens in this window without asking when the window is empty", async () => {
    mockOpen.mockResolvedValue("/Users/me/new-proj");
    await pickFolderAndOpen();
    expect(mockAsk).not.toHaveBeenCalled();
    expect(currentProjectPath()).toBe("/Users/me/new-proj");
  });

  it("asks with 'This window' as the default action when a project is open", async () => {
    window.location.hash = "#project=%2Fexisting";
    mockOpen.mockResolvedValue("/Users/me/another");
    mockAsk.mockResolvedValue(true); // confirm = this window
    await pickFolderAndOpen();
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockAsk.mock.calls[0][1]).toMatchObject({ okLabel: "This window" });
    expect(currentProjectPath()).toBe("/Users/me/another");
  });
});
