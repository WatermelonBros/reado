import { describe, expect, it } from "vitest"
import {
  locateStep,
  onboardingTour,
  parseTourFile,
  safeRelPath,
  spanRange,
  type Tour,
} from "../projectTours"

const step = { file: "src/a.ts", title: "A", body: "b" }
const tour = (over: Partial<Tour> = {}): Tour => ({ id: "t1", name: "T", steps: [step], ...over })
const file = (tours: unknown[], extra: object = {}) =>
  JSON.stringify({ version: 1, tours, ...extra })

describe("parseTourFile", () => {
  it("reads a tour file by its shape, whoever wrote it", () => {
    const parsed = parseTourFile(file([tour()], { "x-other": { a: 1 } }))
    expect(parsed.kind).toBe("tours")
    if (parsed.kind === "tours") expect(parsed.tours.map((t) => t.id)).toEqual(["t1"])
  })

  it("ignores a tour.json that isn't a tour file", () => {
    expect(parseTourFile(JSON.stringify({ name: "my game tour" })).kind).toBe("foreign")
    expect(parseTourFile("not json").kind).toBe("foreign")
  })

  it("refuses a newer major version", () => {
    expect(parseTourFile(JSON.stringify({ version: 2, tours: [] }))).toEqual({
      kind: "newer",
      version: 2,
    })
  })

  it("keeps the valid tours and counts the others", () => {
    const parsed = parseTourFile(file([tour(), { id: "bad", name: "x", steps: [] }]))
    expect(parsed.kind === "tours" && [parsed.tours.length, parsed.invalid]).toEqual([1, 1])
  })

  it("rejects a step that leaves the project", () => {
    const parsed = parseTourFile(file([tour({ steps: [{ ...step, file: "../../etc/hosts" }] })]))
    expect(parsed.kind === "tours" && parsed.invalid).toBe(1)
  })

  it("ignores unknown fields on steps", () => {
    const parsed = parseTourFile(file([tour({ steps: [{ ...step, "x-reado": { k: 1 } }] })]))
    expect(parsed.kind === "tours" && parsed.tours.length).toBe(1)
  })
})

describe("safeRelPath", () => {
  it.each([
    ["src/a.ts", true],
    ["/etc/hosts", false],
    ["C:/x", false],
    ["a/../../b", false],
    ["", false],
  ])("%s → %s", (p, ok) => expect(safeRelPath(p)).toBe(ok))
})

describe("onboardingTour", () => {
  it("is the first marked tour", () => {
    const tours = [
      tour({ id: "a" }),
      tour({ id: "b", onboarding: true }),
      tour({ id: "c", onboarding: true }),
    ]
    expect(onboardingTour(tours)?.id).toBe("b")
  })
})

const DOC = "line one\n  const x = retry(req, 3)\nend\n"

describe("spanRange", () => {
  it("takes whole lines without columns", () => {
    const r = spanRange(DOC, { from: { line: 2 }, to: { line: 2 } })
    expect(r && DOC.slice(r.from, r.to)).toBe("  const x = retry(req, 3)")
  })

  it("takes exact columns, end exclusive", () => {
    const r = spanRange(DOC, { from: { line: 2, col: 13 }, to: { line: 2, col: 26 } })
    expect(r && DOC.slice(r.from, r.to)).toBe("retry(req, 3)")
  })

  it("counts columns in code points", () => {
    const doc = "a😀b\n"
    const r = spanRange(doc, { from: { line: 1, col: 3 }, to: { line: 1, col: 4 } })
    expect(r && doc.slice(r.from, r.to)).toBe("b")
  })

  it("is null past the end of the file", () => {
    expect(spanRange(DOC, { from: { line: 9 }, to: { line: 9 } })).toBeNull()
  })
})

describe("locateStep", () => {
  it("is the whole file without a span or text", () => {
    expect(locateStep(DOC, {})).toBe("file")
  })

  it("finds the quoted code where it moved", () => {
    const moved = `// header\n// more\n${DOC}`
    const r = locateStep(moved, {
      span: { from: { line: 2, col: 13 }, to: { line: 2, col: 26 } },
      text: "retry(req, 3)",
    })
    expect(r !== "file" && r && moved.slice(r.from, r.to)).toBe("retry(req, 3)")
  })

  it("matches despite reformatting", () => {
    const r = locateStep("retry(\n  req, 3)", { text: "retry( req, 3)" })
    expect(r).toEqual({ from: 0, to: 16 })
  })

  it("picks the copy nearest to the span", () => {
    const doc = "f()\nx\nf()\n"
    const r = locateStep(doc, { span: { from: { line: 3 }, to: { line: 3 } }, text: "f()" })
    expect(r).toEqual({ from: 6, to: 9 })
  })

  it("is unplaceable when the quoted code is gone", () => {
    expect(
      locateStep(DOC, { span: { from: { line: 2 }, to: { line: 2 } }, text: "gone()" }),
    ).toBeNull()
  })
})

describe("the published schema", () => {
  it("requires what the reader requires", async () => {
    const schema = (await import("../../../docs/tour.schema.json")).default
    expect(schema.required).toEqual(["version", "tours"])
    expect(schema.$defs.tour.required).toEqual(["id", "name", "steps"])
    expect(schema.$defs.step.required).toEqual(["file", "title", "body"])
    expect(schema.$defs.step.properties.placement.enum).toEqual([
      "auto",
      "right",
      "left",
      "top",
      "bottom",
    ])
  })
})
