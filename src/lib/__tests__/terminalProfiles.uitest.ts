// Named terminal profiles: parsing the lines the user writes, choosing which
// profile a new terminal runs, and naming panes so two of the same profile can
// still be told apart.
import { beforeEach, describe, expect, it } from "vitest"
import { useSettings } from "@/lib/store"
import { parseProfiles, profileFor, splitArgs } from "@/lib/terminalProfiles"
import { useTerminals } from "@/lib/terminals"

beforeEach(() => {
  useSettings.setState({ terminalProfiles: [], defaultTerminalProfile: "" })
  useTerminals.setState({ sessions: [], groups: [], activeId: null, activeGroupId: null })
})

describe("parsing", () => {
  it("reads a name, a command and its arguments", () => {
    expect(parseProfiles(["Node REPL = node --experimental-repl-await"])).toEqual([
      { name: "Node REPL", command: "node", args: ["--experimental-repl-await"] },
    ])
  })

  it("keeps a quoted path with a space in one piece", () => {
    expect(splitArgs(`"/Applications/My Shell" -l`)).toEqual(["/Applications/My Shell", "-l"])
  })

  it("skips a line that cannot become a profile", () => {
    // No `=`, no name, no command — each would otherwise be a menu entry that
    // opens a terminal that immediately dies.
    expect(parseProfiles(["just some text", " = node", "Empty ="])).toEqual([])
  })
})

describe("choosing one", () => {
  beforeEach(() => {
    useSettings.setState({ terminalProfiles: ["Node = node", "Debug bash = bash -l"] })
  })

  it("takes the one asked for", () => {
    expect(profileFor("Debug bash")).toEqual({ name: "Debug bash", command: "bash", args: ["-l"] })
  })

  it("falls back to the default, and to nothing at all", () => {
    expect(profileFor()).toBeNull()
    useSettings.setState({ defaultTerminalProfile: "Node" })
    expect(profileFor()?.command).toBe("node")
    // A default naming a profile that no longer exists is not a profile.
    useSettings.setState({ defaultTerminalProfile: "Gone" })
    expect(profileFor()).toBeNull()
  })
})

describe("panes opened from a profile", () => {
  it("are named after it, and numbered only when there is more than one", () => {
    useSettings.setState({ terminalProfiles: ["Node = node"] })
    useTerminals.getState().add(undefined, "Node")
    useTerminals.getState().add(undefined, "Node")
    useTerminals.getState().add()
    expect(useTerminals.getState().sessions.map((s) => s.title)).toEqual([
      "Node",
      "Node 2",
      "Terminal 1",
    ])
    // And the pane remembers what it runs, so a restart runs the same thing.
    expect(useTerminals.getState().sessions[0].profile).toBe("Node")
  })
})
