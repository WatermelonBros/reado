// Notice toast stack: push/cap/dismiss, and the notifyError reporter (logs raw,
// surfaces a curated message). Runs on all 3 OSes.
import { describe, it, expect, vi, beforeEach } from "vitest";

const errorSpy = vi.fn();
vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: errorSpy }),
  safeError: (e: unknown) => String(e),
}));

import { useNotice, notify, notifyError, MAX_NOTICES } from "../notice";

beforeEach(() => {
  vi.clearAllMocks();
  useNotice.setState({ notices: [] });
});

describe("useNotice stack", () => {
  it("pushes newest-first and returns an id", () => {
    const a = useNotice.getState().show("info", "first");
    const b = useNotice.getState().show("error", "second");
    const notices = useNotice.getState().notices;
    expect(notices.map((n) => n.text)).toEqual(["second", "first"]);
    expect(a).not.toBe(b);
  });

  it("keeps two rapid notices instead of replacing (regression)", () => {
    useNotice.getState().show("error", "one");
    useNotice.getState().show("error", "two");
    expect(useNotice.getState().notices).toHaveLength(2);
  });

  it("caps the stack at MAX_NOTICES", () => {
    for (let i = 0; i < MAX_NOTICES + 3; i++) useNotice.getState().show("info", `n${i}`);
    expect(useNotice.getState().notices).toHaveLength(MAX_NOTICES);
    // newest survive; oldest drop off
    expect(useNotice.getState().notices[0].text).toBe(`n${MAX_NOTICES + 2}`);
  });

  it("dismiss removes one by id without touching the others", () => {
    const a = useNotice.getState().show("info", "a");
    useNotice.getState().show("info", "b");
    useNotice.getState().dismiss(a);
    const texts = useNotice.getState().notices.map((n) => n.text);
    expect(texts).toEqual(["b"]);
  });
});

describe("notify / notifyError", () => {
  it("notify surfaces an info toast", () => {
    notify("success", "done");
    expect(useNotice.getState().notices[0]).toMatchObject({ kind: "success", text: "done" });
  });

  it("notifyError logs the raw error and surfaces the curated message only", () => {
    notifyError("scope", "Couldn't save the file.", new Error("EACCES: /root/x"));
    // curated message reaches the UI
    expect(useNotice.getState().notices[0]).toMatchObject({
      kind: "error",
      text: "Couldn't save the file.",
    });
    // raw error goes to the log, never to the toast text
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(useNotice.getState().notices[0].text).not.toContain("EACCES");
  });
});
