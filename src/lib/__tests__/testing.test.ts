// The runners: what Reado types into a shell, and what it reads back out. Both
// halves are guesses about somebody else's program, so both are pinned against
// real output — a wrong filter flag runs the whole suite silently, and a wrong
// verdict regex leaves every test forever "not run".
import { describe, expect, it } from "vitest"

import { decodePtyOutput } from "@/lib/terminals"
import { idsFor, isStale, RUNNERS, testId } from "@/lib/testing"

/** The verdict a framework prints on one line: its path, and its status. */
const read = (framework: string, line: string) => RUNNERS[framework].read(line)
/** …and just the leaf of that path, which is what most assertions care about. */
const leaf = (framework: string, line: string) => {
  const v = read(framework, line)
  return v && { name: v.path[v.path.length - 1], status: v.status }
}

describe("test commands", () => {
  it("scopes vitest to a file and a name, quoting both", () => {
    // The verbose reporter is load-bearing, not cosmetic: vitest's default one
    // prints a line per *file* and names only the failures, so every passing
    // test would sit at "never run" forever.
    expect(RUNNERS.vitest.command({})).toBe("npx vitest run --reporter=verbose")
    expect(RUNNERS.vitest.command({ file: "src/a.test.ts" })).toBe(
      "npx vitest run --reporter=verbose src/a.test.ts",
    )
    expect(RUNNERS.vitest.command({ file: "src/a.test.ts", name: "it isn't broken" })).toBe(
      "npx vitest run --reporter=verbose src/a.test.ts -t 'it isn'\\''t broken'",
    )
    expect(RUNNERS.jest.command({ file: "a.test.js" })).toBe("npx jest --verbose a.test.js")
  })

  it("builds a pytest node id out of file, class and name", () => {
    expect(
      RUNNERS.pytest.command({ file: "tests/test_a.py", suites: ["TestThing"], name: "test_one" }),
    ).toBe("pytest -v tests/test_a.py::TestThing::test_one")
    expect(RUNNERS.pytest.command({})).toBe("pytest -v")
  })

  it("filters cargo by name only — it has no notion of a file", () => {
    expect(RUNNERS.cargo.command({ file: "src/git.rs", name: "reads_tags" })).toBe(
      "cargo test reads_tags",
    )
    expect(RUNNERS.cargo.command({ file: "src/git.rs" })).toBe("cargo test")
  })

  it("anchors go's -run so a prefix cannot drag in its neighbours", () => {
    expect(RUNNERS.go.command({ file: "pkg/a_test.go", name: "TestOne" })).toBe(
      "go test -run '^TestOne$' ./pkg/",
    )
  })
})

describe("reading verdicts out of the output", () => {
  it("takes the last segment of a vitest line as the test", () => {
    expect(read("vitest", " ✓ src/a.test.ts > outer > does a thing 3ms")).toEqual({
      path: ["src/a.test.ts", "outer", "does a thing"],
      status: "pass",
    })
    expect(leaf("vitest", " × src/a.test.ts > it broke")).toEqual({
      name: "it broke",
      status: "fail",
    })
    expect(read("vitest", "some unrelated output")).toBeNull()
    // jest's failure glyph is a different character from vitest's.
    expect(leaf("jest", "  ✕ it broke (3 ms)")).toEqual({ name: "it broke", status: "fail" })
    // Every duration shape both runners write, stripped off the name.
    expect(leaf("vitest", " ✓ a > slow 1200ms")?.name).toBe("slow")
    expect(leaf("jest", "  ✓ slow (1.2 s)")?.name).toBe("slow")
  })

  it("reads cargo's ok / FAILED / ignored", () => {
    expect(leaf("cargo", "test git::tags::reads_tags ... ok")).toEqual({
      name: "reads_tags",
      status: "pass",
    })
    expect(leaf("cargo", "test git::reads_tags ... FAILED")).toEqual({
      name: "reads_tags",
      status: "fail",
    })
    expect(leaf("cargo", "test git::slow ... ignored")).toEqual({ name: "slow", status: "skip" })
  })

  it("reads pytest's verbose rows", () => {
    expect(leaf("pytest", "tests/test_a.py::TestThing::test_one PASSED   [ 50%]")).toEqual({
      name: "test_one",
      status: "pass",
    })
    expect(leaf("pytest", "tests/test_a.py::test_two FAILED")).toEqual({
      name: "test_two",
      status: "fail",
    })
  })

  it("reads go's result lines", () => {
    expect(leaf("go", "--- PASS: TestOne (0.00s)")).toEqual({ name: "TestOne", status: "pass" })
    expect(leaf("go", "    --- FAIL: TestTwo (0.01s)")).toEqual({ name: "TestTwo", status: "fail" })
  })

  it("sees through the colour a framework writes to a real terminal", () => {
    // The run happens in a pty, so every one of these lines arrives dressed in
    // escape sequences — the matchers must not care.
    const coloured = "\u001b[32m ✓\u001b[39m src/a.test.ts > green 1ms\u001b[0m"
    expect(leaf("vitest", coloured)).toEqual({ name: "green", status: "pass" })
    // A name containing brackets survives: what is stripped is the escape, not
    // every "[...]" in the line.
    expect(leaf("vitest", " ✓ src/a.test.ts > handles [0] correctly")).toEqual({
      name: "handles [0] correctly",
      status: "pass",
    })
  })
})

describe("test identity", () => {
  it("is the file, the suites and the name, in that order", () => {
    expect(testId("src/a.test.ts", ["outer", "inner"], "works")).toBe(
      "src/a.test.ts › outer › inner › works",
    )
  })
})

describe("a remembered verdict", () => {
  const file = { path: "src/a.test.ts", framework: "vitest", tests: [], modified: 2_000 }
  const ran = (at: number) => ({ status: "pass" as const, at })

  it("still counts while the file has not moved on", () => {
    expect(isStale(file, ran(3_000))).toBe(false)
  })

  it("is stale once the file changed after the run", () => {
    // The point of the whole mechanism: a tick against code edited since is a
    // claim about a file that no longer exists.
    expect(isStale(file, ran(1_000))).toBe(true)
  })

  it("is not called stale when there is nothing to compare", () => {
    expect(isStale(file, undefined)).toBe(false)
    expect(isStale({ ...file, modified: undefined }, ran(1_000))).toBe(false)
    // A test that is *running* has no age and must not read as stale.
    expect(isStale(file, { status: "running", at: 0 })).toBe(false)
  })
})

describe("reading the terminal's stream", () => {
  it("decodes the base64 frame the backend sends", () => {
    // The bug this pins: PTY output is base64-framed so escapes survive the
    // event boundary. Matching against the frame itself matches nothing, and
    // does it silently — the panel looks wired up and never shows a verdict.
    const line = " ✓ src/a.test.js > works 1ms\n"
    const framed = btoa(String.fromCharCode(...new TextEncoder().encode(line)))
    expect(decodePtyOutput(framed)).toBe(line)
  })

  it("takes anything that is not base64 as text", () => {
    expect(decodePtyOutput("plain ✓ output")).toBe("plain ✓ output")
  })
})

describe("matching a verdict to a test", () => {
  it("keeps the path the framework printed, not just the leaf", () => {
    // Two suites in one file can each hold a test of the same name — the
    // ordinary shape of a test file. The printed path is what tells them apart,
    // so the runners must not throw it away.
    const a = read("vitest", " ✓ src/a.test.ts > outer > works")
    const b = read("vitest", " × src/a.test.ts > inner > works")
    expect(a?.path).toEqual(["src/a.test.ts", "outer", "works"])
    expect(b?.path).toEqual(["src/a.test.ts", "inner", "works"])
    expect(testId("src/a.test.ts", ["outer"], "works").endsWith(a?.path.join(" › ") ?? "")).toBe(
      true,
    )
    expect(testId("src/a.test.ts", ["outer"], "works").endsWith(b?.path.join(" › ") ?? "")).toBe(
      false,
    )
  })

  it("keeps the module path cargo prints, and the node id pytest prints", () => {
    expect(read("cargo", "test git::tags::reads_tags ... ok")?.path).toEqual([
      "git",
      "tags",
      "reads_tags",
    ])
    expect(read("pytest", "tests/test_a.py::TestThing::test_one PASSED")?.path).toEqual([
      "tests/test_a.py",
      "TestThing",
      "test_one",
    ])
  })

  it("reads a go subtest as its parent and its own name", () => {
    expect(read("go", "    --- FAIL: TestOuter/inner_case (0.01s)")?.path).toEqual([
      "TestOuter",
      "inner_case",
    ])
  })
})

describe("choosing which tests a verdict is about", () => {
  const ids = [
    testId("src/a.test.ts", ["outer"], "works"),
    testId("src/a.test.ts", ["inner"], "works"),
    testId("src/b.test.ts", [], "alone"),
  ]
  const byLeaf = new Map<string, string[]>([
    ["works", [ids[0], ids[1]]],
    ["alone", [ids[2]]],
  ])

  it("uses the printed path to tell two tests of the same name apart", () => {
    // Without this, the first `✓ works` marks both green — including the one
    // that fails on the next line.
    expect(idsFor(byLeaf, ["src/a.test.ts", "outer", "works"])).toEqual([ids[0]])
    expect(idsFor(byLeaf, ["inner", "works"])).toEqual([ids[1]])
  })

  it("falls back to every candidate when the framework printed only a name", () => {
    expect(idsFor(byLeaf, ["works"])).toEqual([ids[0], ids[1]])
  })

  it("answers nothing for a name no test in the run has", () => {
    expect(idsFor(byLeaf, ["src/c.test.ts", "unknown"])).toEqual([])
  })
})
