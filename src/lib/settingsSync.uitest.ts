// Settings-bundle export/import logic. Pure parse/validate/apply paths plus the
// clipboard/prompt flows (mocked at the edges). Runs on all 3 OSes.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../i18n", () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }));
vi.mock("./prompt", () => ({ prompt: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn() }));
vi.mock("./logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }), safeError: (e: unknown) => String(e) }));

import {
  buildBundle,
  parseBundle,
  summarizeBundle,
  applyBundle,
  exportSettings,
  importSettings,
} from "./settingsSync";
import { useSettings } from "./store";
import { useExtensions } from "./extensions";
import { prompt } from "./prompt";
import { ask } from "@tauri-apps/plugin-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  useExtensions.setState({ disabled: [] });
});

describe("buildBundle", () => {
  it("captures the portable settings keys + disabled extensions, versioned", () => {
    useSettings.setState({ theme: "reado-sepia", zoom: 1.5 });
    useExtensions.setState({ disabled: ["ext.a", "ext.b"] });
    const b = buildBundle();
    expect(b.version).toBe(1);
    expect(b.settings.theme).toBe("reado-sepia");
    expect(b.settings.zoom).toBe(1.5);
    expect(b.extensionsDisabled).toEqual(["ext.a", "ext.b"]);
    // must NOT leak the store's `set` function or project-local state
    expect("set" in b.settings).toBe(false);
  });
});

describe("parseBundle", () => {
  it("parses a valid bundle", () => {
    const b = parseBundle(JSON.stringify({ version: 1, settings: { theme: "reado-dark" }, extensionsDisabled: [] }));
    expect(b?.settings.theme).toBe("reado-dark");
  });
  it("rejects malformed JSON", () => {
    expect(parseBundle("{ not json")).toBeNull();
  });
  it("rejects a non-object / missing settings", () => {
    expect(parseBundle("42")).toBeNull();
    expect(parseBundle(JSON.stringify({ version: 1 }))).toBeNull();
  });
  it("rejects a newer schema version (forward-incompatible)", () => {
    expect(parseBundle(JSON.stringify({ version: 999, settings: {} }))).toBeNull();
  });
  it("accepts a bundle with no version field", () => {
    expect(parseBundle(JSON.stringify({ settings: { zoom: 1 } }))).not.toBeNull();
  });
});

describe("summarizeBundle", () => {
  it("counts settings + disabled extensions", () => {
    const s = summarizeBundle({ version: 1, settings: { theme: "reado-dark", zoom: 1 }, extensionsDisabled: ["x"] });
    expect(s).toContain('"settings":2');
    expect(s).toContain('"disabled":1');
  });
  it("handles a bundle with no extensions array", () => {
    const s = summarizeBundle({ version: 1, settings: {}, extensionsDisabled: undefined as never });
    expect(s).toContain('"disabled":0');
  });
});

describe("applyBundle", () => {
  it("applies settings and disabled extensions", () => {
    applyBundle({ version: 1, settings: { theme: "reado-high-contrast" }, extensionsDisabled: ["ext.x"] });
    expect(useSettings.getState().theme).toBe("reado-high-contrast");
    expect(useExtensions.getState().disabled).toEqual(["ext.x"]);
  });
});

describe("exportSettings", () => {
  it("writes the bundle JSON to the clipboard", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await exportSettings();
    expect(writeText).toHaveBeenCalledOnce();
    expect(JSON.parse(writeText.mock.calls[0][0]).version).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe("importSettings", () => {
  it("does nothing when the prompt is cancelled", async () => {
    vi.mocked(prompt).mockResolvedValue(null);
    await importSettings();
    expect(ask).not.toHaveBeenCalled();
  });
  it("warns on an invalid bundle", async () => {
    vi.mocked(prompt).mockResolvedValue("not json");
    await importSettings();
    expect(ask).toHaveBeenCalledWith(expect.stringContaining("sync.invalid"), expect.anything());
  });
  it("applies the bundle when confirmed", async () => {
    vi.mocked(prompt).mockResolvedValue(JSON.stringify({ version: 1, settings: { zoom: 2 }, extensionsDisabled: [] }));
    vi.mocked(ask).mockResolvedValue(true);
    await importSettings();
    expect(useSettings.getState().zoom).toBe(2);
  });
  it("does not apply when the confirmation is declined", async () => {
    useSettings.setState({ zoom: 1 });
    vi.mocked(prompt).mockResolvedValue(JSON.stringify({ version: 1, settings: { zoom: 9 }, extensionsDisabled: [] }));
    vi.mocked(ask).mockResolvedValue(false);
    await importSettings();
    expect(useSettings.getState().zoom).toBe(1);
  });
});
