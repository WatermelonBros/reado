// In-app browser preview — store logic + the agent-navigation allowlist. Pure
// state; the native webview is driven separately by BrowserPanel. Runs in jsdom
// because the store carries a `persist` middleware.
import { describe, it, expect, beforeEach } from "vitest";
import { usePreview, isOriginAllowed, type LogEntry, type NetEntry } from "../preview";

const log = (level: LogEntry["level"]): LogEntry => ({ level, args: [], t: 0 });
const net = (id: number): NetEntry => ({ id, method: "GET", url: "/x", t: 0 });

beforeEach(() => {
  usePreview.setState({
    open: false,
    url: "http://localhost:5173",
    inspector: false,
    inspectorPos: "bottom",
    inspectorSize: 240,
    inspectRequest: null,
    agentAccess: true,
    allowlist: [],
    device: null,
    paneWidth: 640,
    browserZoom: 1,
    logs: [],
    net: [],
  });
});

describe("isOriginAllowed", () => {
  it("always allows localhost and 127.0.0.1 on any port", () => {
    expect(isOriginAllowed("http://localhost:5173", [])).toBe(true);
    expect(isOriginAllowed("http://localhost:3000/deep/path", [])).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:8080", [])).toBe(true);
  });

  it("rejects a foreign origin that isn't in the allowlist", () => {
    expect(isOriginAllowed("https://evil.example/steal", [])).toBe(false);
    expect(isOriginAllowed("https://evil.example", ["https://good.example"])).toBe(false);
  });

  it("allows a foreign origin only when its origin matches an allowlist entry", () => {
    expect(isOriginAllowed("https://good.example/page", ["https://good.example"])).toBe(true);
    // Same host, different scheme/port → different origin → still rejected.
    expect(isOriginAllowed("http://good.example", ["https://good.example"])).toBe(false);
  });

  it("treats a malformed URL (or a malformed allowlist entry) as not allowed", () => {
    expect(isOriginAllowed("not a url", [])).toBe(false);
    expect(isOriginAllowed("https://good.example", ["also not a url"])).toBe(false);
  });
});

describe("usePreview store", () => {
  it("openPane opens at a URL, or reuses the last one", () => {
    usePreview.getState().openPane("http://localhost:4321");
    expect(usePreview.getState()).toMatchObject({ open: true, url: "http://localhost:4321" });
    usePreview.getState().close();
    usePreview.getState().openPane();
    expect(usePreview.getState().url).toBe("http://localhost:4321"); // reused
  });

  it("clamps browser zoom to [0.1, 3]", () => {
    const { setBrowserZoom } = usePreview.getState();
    setBrowserZoom(5);
    expect(usePreview.getState().browserZoom).toBe(3);
    setBrowserZoom(0.01);
    expect(usePreview.getState().browserZoom).toBe(0.1);
    setBrowserZoom(1.5);
    expect(usePreview.getState().browserZoom).toBe(1.5);
  });

  it("enforces minimum pane width and inspector size", () => {
    usePreview.getState().setPaneWidth(100);
    expect(usePreview.getState().paneWidth).toBe(320);
    usePreview.getState().setInspectorSize(10);
    expect(usePreview.getState().inspectorSize).toBe(120);
  });

  it("caps captured logs and network at 500 entries, keeping the newest", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ ...log("log"), t: i }));
    usePreview.getState().appendLogs(many);
    const logs = usePreview.getState().logs;
    expect(logs).toHaveLength(500);
    expect(logs[logs.length - 1].t).toBe(599); // newest kept

    const nets = Array.from({ length: 600 }, (_, i) => net(i));
    usePreview.getState().setNet(nets);
    const kept = usePreview.getState().net;
    expect(kept).toHaveLength(500);
    expect(kept[kept.length - 1].id).toBe(599);
  });

  it("appendLogs accumulates across calls", () => {
    usePreview.getState().appendLogs([log("log"), log("warn")]);
    usePreview.getState().appendLogs([log("error")]);
    expect(usePreview.getState().logs).toHaveLength(3);
  });

  it("clearCaptured empties logs and net but leaves the pane open", () => {
    usePreview.setState({ open: true, logs: [log("log")], net: [net(1)] });
    usePreview.getState().clearCaptured();
    expect(usePreview.getState()).toMatchObject({ open: true, logs: [], net: [] });
  });

  it("close resets open state and drops captured buffers", () => {
    usePreview.setState({ open: true, logs: [log("log")], net: [net(1)] });
    usePreview.getState().close();
    expect(usePreview.getState()).toMatchObject({ open: false, logs: [], net: [] });
  });

  it("addAllowedOrigin appends and dedupes", () => {
    const { addAllowedOrigin } = usePreview.getState();
    addAllowedOrigin("https://a.example");
    addAllowedOrigin("https://a.example"); // dup — no-op
    addAllowedOrigin("https://b.example");
    expect(usePreview.getState().allowlist).toEqual(["https://a.example", "https://b.example"]);
  });

  it("toggleInspector flips it, setInspectorPos moves it", () => {
    usePreview.getState().toggleInspector();
    expect(usePreview.getState().inspector).toBe(true);
    usePreview.getState().setInspectorPos("right");
    expect(usePreview.getState().inspectorPos).toBe("right");
  });
});
