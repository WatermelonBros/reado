// Cross-OS UI test: keyboard-shortcut glyphs must adapt to the OS, so a
// Windows/Linux user never sees macOS-only symbols (⌘ ⌥ ⌃). Regression guard for
// BUG-5. Runs identically on macOS / Windows / Linux in CI (it mocks the UA).
import { describe, it, expect, vi, afterEach } from "vitest";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome";

async function load(ua: string) {
  vi.resetModules();
  vi.stubGlobal("navigator", { userAgent: ua });
  return import("../shortcuts");
}

afterEach(() => vi.unstubAllGlobals());

describe("keyboard-shortcut glyphs adapt per OS (BUG-5)", () => {
  it("uses Apple symbols on macOS", async () => {
    const s = await load(MAC);
    expect(s.mod).toBe("⌘");
    expect(s.alt).toBe("⌥");
    expect(s.ctrl).toBe("⌃");
    expect(s.shift).toBe("⇧");
  });

  for (const [name, ua] of [["Windows", WIN], ["Linux", LINUX]] as const) {
    it(`uses plain key names on ${name} — no Apple-only glyphs anywhere`, async () => {
      const s = await load(ua);
      expect(s.mod).toBe("Ctrl");
      expect(s.alt).toBe("Alt");
      expect(s.ctrl).toBe("Ctrl");
      expect(s.shift).toBe("Shift");

      // Every displayed combo in the shortcuts panel + quick list must be free of
      // macOS-only symbols on non-mac.
      const combos = [
        ...s.SHORTCUTS.map((x) => x.combo),
        ...s.SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => i.combo)),
      ].join("  ");
      expect(combos).not.toMatch(/[⌘⌥⌃⇧]/);
    });
  }
});
