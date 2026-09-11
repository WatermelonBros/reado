// The two halves of a task: what the file says, and what the output means.
import { describe, expect, it } from "vitest"
import { buildTask, commandLine, createMatcher, parseTasks } from "@/lib/tasks"

/** Feed a matcher a block of output and collect everything it found. */
const match = (output: string) => {
  const m = createMatcher()
  return output.split("\n").flatMap((line) => m.push(line))
}

/** An ANSI colour escape, written as a code so this file has no control bytes. */
const ESC = String.fromCharCode(27)

describe("reading a tasks file", () => {
  it("reads the shape both editors write", () => {
    expect(
      parseTasks(
        '{"tasks":[{"label":"build","command":"npm","args":["run","build"],"group":"build"}]}',
      ),
    ).toEqual([
      { label: "build", command: "npm", args: ["run", "build"], cwd: undefined, group: "build" },
    ])
  })

  it("tolerates the comments and trailing commas these files always have", () => {
    const text = `{
      // what everyone runs
      "tasks": [
        { "label": "test", "command": "npm", "args": ["test"], },
      ],
    }`
    expect(parseTasks(text).map((t) => t.label)).toEqual(["test"])
  })

  it("reads VS Code's nested group form", () => {
    expect(
      parseTasks('{"tasks":[{"label":"b","command":"x","group":{"kind":"build"}}]}')[0].group,
    ).toBe("build")
  })

  it("skips entries that are not tasks rather than inventing them", () => {
    expect(
      parseTasks('{"tasks":[{"label":"only a label"},{"label":"ok","command":"x"}]}'),
    ).toHaveLength(1)
  })

  it("refuses a file that is not JSON at all, so the caller can say so", () => {
    expect(() => parseTasks("not json")).toThrow()
  })

  it("quotes an argument that would otherwise fall apart in a shell", () => {
    expect(commandLine({ label: "x", command: "echo", args: ["a b", "c"] })).toBe("echo 'a b' c")
  })

  it("runs the build task without asking only when there is exactly one", () => {
    const one = [{ label: "b", command: "x", group: "build" as const }]
    expect(buildTask(one)?.label).toBe("b")
    expect(
      buildTask([...one, { label: "b2", command: "y", group: "build" as const }]),
    ).toBeUndefined()
  })
})

describe("turning output into problems", () => {
  it("reads tsc", () => {
    expect(match("src/a.ts(12,5): error TS2345: Argument of type 'x' is not assignable.")).toEqual([
      {
        path: "src/a.ts",
        line: 12,
        character: 5,
        severity: 1,
        message: "Argument of type 'x' is not assignable.",
      },
    ])
  })

  it("reads the file:line:col shape everything else prints", () => {
    expect(match("src/a.ts:3:9: warning: unused variable 'x'")).toEqual([
      { path: "src/a.ts", line: 3, character: 9, severity: 2, message: "unused variable 'x'" },
    ])
  })

  it("joins cargo's two lines into one entry", () => {
    // The message and the location arrive separately; a matcher that only sees
    // one line at a time cannot put them together.
    expect(match("error[E0308]: mismatched types\n  --> src/main.rs:5:9\n")).toEqual([
      { path: "src/main.rs", line: 5, character: 9, severity: 1, message: "mismatched types" },
    ])
  })

  it("does not attach a cargo message to a location that isn't its own", () => {
    expect(match("error: something\nunrelated output\n  --> src/main.rs:5:9")).toEqual([])
  })

  it("strips the colour a compiler writes into a real terminal", () => {
    expect(match(`${ESC}[31msrc/a.ts:1:1: error: boom${ESC}[0m`)[0]?.message).toBe("boom")
  })

  it("says nothing about output it does not recognise", () => {
    expect(match("Building...\n[==>    ] 40%\nDone in 3.1s")).toEqual([])
  })

  it("is not fooled by a bare line:col with no file worth clicking", () => {
    expect(match("10:5: error: no file here")).toEqual([])
  })
})
