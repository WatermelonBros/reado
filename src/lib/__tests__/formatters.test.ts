/** The per-project override: which formatter runs where, and that "here" never
 *  leaks into the next repository. */
import { beforeEach, describe, expect, it } from "vitest"
import { choiceFor, extOf, useFormatterOverrides } from "@/lib/formatters"

const A = "/repo/a"
const B = "/repo/b"

beforeEach(() => useFormatterOverrides.setState({ byRoot: {} }))

describe("formatter overrides", () => {
  it("detects by default", () => {
    expect(choiceFor(A, "src/x.ts")).toEqual({ kind: "detect" })
  })

  it("pins a formatter for one file type in one project", () => {
    useFormatterOverrides.getState().set(A, "ts", "prettier")
    expect(choiceFor(A, "src/x.ts")).toEqual({ kind: "pinned", id: "prettier" })
    // Another file type in the same project is unaffected…
    expect(choiceFor(A, "src/x.css")).toEqual({ kind: "detect" })
    // …and so is the same file type in another project.
    expect(choiceFor(B, "src/x.ts")).toEqual({ kind: "detect" })
  })

  it("turns formatting off for a file type", () => {
    useFormatterOverrides.getState().set(A, "py", "off")
    expect(choiceFor(A, "main.py")).toEqual({ kind: "off" })
  })

  it("clears an override", () => {
    useFormatterOverrides.getState().set(A, "ts", "biome")
    useFormatterOverrides.getState().set(A, "ts", null)
    expect(choiceFor(A, "x.ts")).toEqual({ kind: "detect" })
    // The project's row goes with its last override, so the store doesn't grow
    // an entry per repository ever opened.
    expect(useFormatterOverrides.getState().byRoot[A]).toBeUndefined()
  })

  it("matches file types whatever case the filename uses", () => {
    useFormatterOverrides.getState().set(A, "TS", "biome")
    expect(choiceFor(A, "Component.TSX")).toEqual({ kind: "detect" })
    expect(choiceFor(A, "Component.Ts")).toEqual({ kind: "pinned", id: "biome" })
  })

  it("reads the extension off a path, not the whole name", () => {
    expect(extOf("src/a.spec.ts")).toBe("ts")
    expect(extOf("Makefile")).toBe("makefile")
  })
})
