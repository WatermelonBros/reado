// biome-ignore-all lint/suspicious/noTemplateCurlyInString: a tasks.json variable
// is a literal `${…}` in a command line, not an interpolation.
// The two halves of a task: what the file says, and what the output means.
import { describe, expect, it } from "vitest"
import { buildTask, commandLine, createMatcher, parseTasks, resolveVars } from "@/lib/tasks"

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

  it("resolves a typed entry through its provider, with no command written down", () => {
    // VS Code's npm provider is the thing that knows a script is run with `run`;
    // the file only names the script. And it must be *this* project's manager.
    expect(parseTasks('{"tasks":[{"type":"npm","script":"build"}]}', "pnpm")[0]).toMatchObject({
      label: "npm: build",
      command: "pnpm",
      args: ["run", "build"],
    })
    // `install` is a command of npm's own, not a script to run.
    expect(parseTasks('{"tasks":[{"type":"npm","script":"install"}]}')[0].args).toEqual(["install"])
    expect(
      parseTasks('{"tasks":[{"type":"cargo","command":"test","args":["--all"]}]}')[0],
    ).toMatchObject({ command: "cargo", args: ["test", "--all"] })
    expect(
      parseTasks('{"tasks":[{"type":"typescript","tsconfig":"tsconfig.json","option":"watch"}]}')[0]
        .args,
    ).toEqual(["tsc", "-p", "tsconfig.json", "--watch"])
    // shell/process is the untyped case: the command is written out.
    expect(parseTasks('{"tasks":[{"type":"shell","label":"x","command":"echo"}]}')[0].command).toBe(
      "echo",
    )
  })

  it("reads options.cwd and options.env, where VS Code puts them", () => {
    const task = parseTasks(
      '{"tasks":[{"label":"x","command":"node","options":{"cwd":"app","env":{"CI":"1"}}}]}',
    )[0]
    expect(task.cwd).toBe("app")
    expect(commandLine(task)).toBe("CI=1 node")
  })

  it("takes the problem matchers by name, in each of the four ways they're written", () => {
    const names = (json: string) => parseTasks(`{"tasks":[${json}]}`)[0].matchers
    expect(names('{"label":"a","command":"x","problemMatcher":"$tsc"}')).toEqual(["$tsc"])
    expect(names('{"label":"a","command":"x","problemMatcher":["$tsc","$go"]}')).toEqual([
      "$tsc",
      "$go",
    ])
    expect(names('{"label":"a","command":"x","problemMatcher":{"base":"$tsc"}}')).toEqual(["$tsc"])
    // Absent and empty mean different things and both have to survive: "parse
    // everything" vs "this output is not diagnostics".
    expect(names('{"label":"a","command":"x"}')).toBeUndefined()
    expect(names('{"label":"a","command":"x","problemMatcher":[]}')).toEqual([])
  })

  it("runs the build task without asking only when there is exactly one", () => {
    const one = [{ label: "b", command: "x", group: "build" as const }]
    expect(buildTask(one)?.label).toBe("b")
    expect(
      buildTask([...one, { label: "b2", command: "y", group: "build" as const }]),
    ).toBeUndefined()
    // …unless the project marked one as the group's default.
    expect(
      buildTask([...one, { label: "b2", command: "y", group: "build" as const, isDefault: true }])
        ?.label,
    ).toBe("b2")
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

  it("reads the first line of a run, under the title sequence the shell writes", () => {
    // zsh sets the window title with an OSC sequence and puts it in front of the
    // command's *first* output line — which is exactly where a build's first
    // error lands. Missing this made every such error invisible.
    const OSC = `${ESC}]2;cargo build${String.fromCharCode(7)}${ESC}]1;cargo${String.fromCharCode(7)}`
    expect(match(`${OSC}error[E0308]: mismatched types\n --> src/main.rs:5:9`)).toEqual([
      { path: "src/main.rs", line: 5, character: 9, severity: 1, message: "mismatched types" },
    ])
    // The private-mode sequences a prompt toggles carry a `?`, and leaked
    // through a pattern that only allowed digits and semicolons.
    expect(match(`${ESC}[?2004lsrc/a.ts(1,2): error TS1: x`)[0]?.path).toBe("src/a.ts")
  })

  it("strips the colour a compiler writes into a real terminal", () => {
    expect(match(`${ESC}[31msrc/a.ts:1:1: error: boom${ESC}[0m`)[0]?.message).toBe("boom")
  })

  it("says nothing about output it does not recognise", () => {
    expect(match("Building...\n[==>    ] 40%\nDone in 3.1s")).toEqual([])
  })

  it("reads only the matcher a task names, so one tool's output isn't another's", () => {
    const only = (names: string[] | undefined, output: string) => {
      const m = createMatcher(names)
      return output.split("\n").flatMap((line) => m.push(line))
    }
    const cargo = "error[E0308]: mismatched types\n  --> src/main.rs:5:9"
    // $tsc has no opinion about cargo's shape, and must not guess at it.
    expect(only(["$tsc"], cargo)).toEqual([])
    expect(only(["$rustc"], cargo)).toHaveLength(1)
    // An empty list is the task saying its output is not diagnostics.
    expect(only([], "src/a.ts(1,2): error TS1: x")).toEqual([])
    // A name Reado doesn't know is ignored — the task still ran, and inventing a
    // parse for it would be worse than parsing nothing.
    expect(only(["$nonesuch"], "src/a.ts(1,2): error TS1: x")).toEqual([])
    // No names at all is still "try everything", as it was before names existed.
    expect(only(undefined, cargo)).toHaveLength(1)
  })

  it("reads eslint's stylish format, where the file is a line of its own", () => {
    const m = createMatcher(["$eslint-stylish"])
    const out = [
      "/repo/src/a.js",
      "  12:3  error    Missing semicolon  semi",
      "  14:1  warning  Unexpected console  no-console",
      "",
      "/repo/src/b.js",
      "  1:1  error  Parsing error  ",
    ]
    const found = out.flatMap((line) => m.push(line))
    expect(found).toEqual([
      { path: "/repo/src/a.js", line: 12, character: 3, severity: 1, message: "Missing semicolon" },
      {
        path: "/repo/src/a.js",
        line: 14,
        character: 1,
        severity: 2,
        message: "Unexpected console",
      },
      { path: "/repo/src/b.js", line: 1, character: 1, severity: 1, message: "Parsing error" },
    ])
  })

  it("is not fooled by a bare line:col with no file worth clicking", () => {
    expect(match("10:5: error: no file here")).toEqual([])
  })
})

describe("the ${…} variables a real tasks.json is full of", () => {
  it("resolves the workspace and the open file, and leaves the shell its own", () => {
    const at = (text: string) => resolveVars(text, "/repo", "/repo/src/a.ts")
    expect(at("${workspaceFolder}/dist")).toBe("/repo/dist")
    expect(at("${workspaceFolderBasename}")).toBe("repo")
    expect(at("${file}")).toBe("/repo/src/a.ts")
    expect(at("${relativeFile}")).toBe("src/a.ts")
    expect(at("${relativeFileDirname}")).toBe("src")
    expect(at("${fileBasename}")).toBe("a.ts")
    expect(at("${fileBasenameNoExtension}")).toBe("a")
    expect(at("${fileExtname}")).toBe(".ts")
    expect(at("${fileDirname}")).toBe("/repo/src")
    // The shell expands these better than we can, so they are handed to it.
    expect(at("${env:API_KEY}")).toBe("$API_KEY")
    expect(at("${userHome}")).toBe("$HOME")
    // An unknown variable stays visible rather than silently becoming "".
    expect(at("${whatever}")).toBe("${whatever}")
  })

  it("resolves them in the command line the task actually runs", () => {
    expect(
      commandLine({ label: "x", command: "node", args: ["${workspaceFolder}/x.js"] }, "/repo"),
    ).toBe("node /repo/x.js")
  })
})
