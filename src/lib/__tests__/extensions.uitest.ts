// The language-server manifests and the disabled-extension store.
import { beforeEach, describe, expect, it, vi } from "vitest"
import lspRs from "../../../src-tauri/src/lsp.rs?raw"

vi.mock("../logger", () => ({ createLogger: () => ({ info: vi.fn() }) }))

import {
  currentOS,
  installCmd,
  LANG_SERVERS,
  type LangServerExt,
  useExtensions,
} from "@/lib/extensions"

const ext = (install: LangServerExt["install"]): LangServerExt => ({
  id: "x",
  name: "X",
  description: "",
  install,
})

beforeEach(() => useExtensions.setState({ disabled: [] }))

describe("currentOS", () => {
  it("reads the platform off the user agent", () => {
    const ua = (s: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(s)
    ua("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
    expect(currentOS()).toBe("mac")
    ua("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    expect(currentOS()).toBe("windows")
    ua("Mozilla/5.0 (X11; Linux x86_64)")
    expect(currentOS()).toBe("linux")
    vi.restoreAllMocks()
  })
})

describe("installCmd", () => {
  it("returns the per-OS command outside Linux", () => {
    const e = ext({ mac: "brew install x", windows: "winget install x" })
    expect(installCmd(e, "mac", null)).toBe("brew install x")
    expect(installCmd(e, "windows", null)).toBe("winget install x")
  })

  it("uses a distro-agnostic Linux command whatever the package manager", () => {
    const e = ext({ linux: "npm i -g x" })
    expect(installCmd(e, "linux", null)).toBe("npm i -g x")
    expect(installCmd(e, "linux", "apt")).toBe("npm i -g x")
  })

  it("picks the command for the detected package manager", () => {
    const e = ext({ linux: { apt: "apt install x", dnf: "dnf install x" } })
    expect(installCmd(e, "linux", "apt")).toBe("apt install x")
    expect(installCmd(e, "linux", "dnf")).toBe("dnf install x")
  })

  it("reports no command (→ manual install) when the OS or manager isn't covered", () => {
    expect(installCmd(ext({ mac: "brew install x" }), "windows", null)).toBeUndefined()
    expect(installCmd(ext({ linux: { apt: "apt install x" } }), "linux", null)).toBeUndefined()
    expect(installCmd(ext({ linux: { apt: "apt install x" } }), "linux", "brew")).toBeUndefined()
  })
})

describe("LANG_SERVERS", () => {
  it("has a unique id per manifest", () => {
    const ids = LANG_SERVERS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The id is the key `server_command` matches on: a manifest with no arm is a
  // marketplace card that installs a server Reado can never spawn.
  it("gives every manifest an id the Rust allowlist can spawn", () => {
    const allowed = [...lspRs.matchAll(/^\s*"([a-z+]+)" =>/gm)].map((m) => m[1])
    expect(allowed.length).toBeGreaterThan(0)
    expect(LANG_SERVERS.map((e) => e.id).filter((id) => !allowed.includes(id))).toEqual([])
  })
})

describe("useExtensions", () => {
  it("treats anything not disabled as enabled", () => {
    expect(useExtensions.getState().isEnabled("typescript")).toBe(true)
  })

  it("disables and re-enables an extension", () => {
    useExtensions.getState().toggle("typescript", false)
    expect(useExtensions.getState().isEnabled("typescript")).toBe(false)
    useExtensions.getState().toggle("typescript", true)
    expect(useExtensions.getState().isEnabled("typescript")).toBe(true)
  })

  it("doesn't record the same id twice", () => {
    useExtensions.getState().toggle("typescript", false)
    useExtensions.getState().toggle("typescript", false)
    expect(useExtensions.getState().disabled).toEqual(["typescript"])
  })

  it("leaves the other extensions alone", () => {
    useExtensions.getState().toggle("typescript", false)
    useExtensions.getState().toggle("rust", false)
    useExtensions.getState().toggle("typescript", true)
    expect(useExtensions.getState().disabled).toEqual(["rust"])
  })
})
