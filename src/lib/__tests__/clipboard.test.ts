/**
 * Copying goes through Tauri's clipboard plugin, never `navigator.clipboard`.
 *
 * The web Clipboard API wants a secure context and a user gesture that the
 * webview does not reliably grant: `writeText` rejected, the rejection was
 * swallowed, and "Copy log path" — along with the Anywhere URL and the settings
 * export — did nothing and said nothing. Verified against the running app: the
 * clipboard kept its previous contents.
 */
import { describe, expect, it } from "vitest"

// Every source file, as text. `query: "?raw"` gives the file rather than its
// exports, so this reads the code the way a reviewer would.
const sources = import.meta.glob("../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

describe("clipboard writes", () => {
  it("never go through navigator.clipboard", () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.includes("__tests__"))
      .filter(([, text]) => /navigator\.clipboard\.writeText/.test(text))
      .map(([path]) => path)
    expect(offenders, "use writeText from @tauri-apps/plugin-clipboard-manager").toEqual([])
  })
})
