import { describe, expect, it } from "vitest"
import {
  composeGuidedPlanPrompt,
  composeGuidedWidenPrompt,
  composeReviewPrompt,
  composeReviewPromptForIds,
  composeSingleTaskPrompt,
} from "@/lib/review"

describe("review prompts", () => {
  it("pluralises the task count", () => {
    expect(composeReviewPrompt(1)).toContain("1 task ")
    expect(composeReviewPrompt(3)).toContain("3 tasks")
  })

  it("is a single line (submits as one message)", () => {
    expect(composeReviewPrompt(2)).not.toContain("\n")
    expect(composeReviewPromptForIds(["a", "b"])).not.toContain("\n")
    expect(composeSingleTaskPrompt("c_1")).not.toContain("\n")
  })

  it("lists specific ids and references the CLI", () => {
    const p = composeReviewPromptForIds(["c_1", "c_2"])
    expect(p).toContain("c_1, c_2")
    expect(p).toContain("reado task done <id>")
  })

  it("falls back to the generic prompt for no ids", () => {
    expect(composeReviewPromptForIds([])).toContain("reado task list")
  })

  it("targets a single task by id", () => {
    const p = composeSingleTaskPrompt("c_42")
    expect(p).toContain("reado task show c_42")
    expect(p).toContain("reado task done c_42")
  })
})

describe("guided planning prompt", () => {
  it("sends the agent to the project's own account of itself before ranking", () => {
    // A route ranked on diff size alone misses the file that quietly
    // contradicts the capability it implements.
    const p = composeGuidedPlanPrompt("s1", "the current diff")
    expect(p).toContain("openspec/")
    expect(p).toContain(".specify/")
    expect(p).toContain("docs/**")
    expect(p).toContain("reado comment list")
  })

  it("asks for the document that moved a file up, not just a rank", () => {
    expect(composeGuidedPlanPrompt("s1", "the current diff")).toContain("Cite which document")
  })

  it("still forbids reviewing or editing during planning", () => {
    const p = composeGuidedPlanPrompt("s1", "the current diff")
    expect(p).toContain("do NOT change any code")
    expect(p).toContain("Do NOT review deeply yet")
  })
})

describe("guided wide pass", () => {
  it("anchors on the route's files and names the four things to look for", () => {
    const p = composeGuidedWidenPrompt("s1", ["a.ts", "b.ts"])
    expect(p).toContain("a.ts, b.ts")
    expect(p).toContain("Repeated patterns")
    expect(p).toContain("documented intent")
    expect(p).toContain("Structural risk")
    expect(p).toContain("run the project's tests")
  })

  it("falls back to the whole scope when the route is empty", () => {
    expect(composeGuidedWidenPrompt("s1", [])).toContain("the whole reviewed scope")
  })

  it("caps how many files it names, so a long route stays a prompt", () => {
    const many = Array.from({ length: 40 }, (_, i) => `f${i}.ts`)
    const p = composeGuidedWidenPrompt("s1", many)
    expect(p).toContain("f11.ts")
    expect(p).not.toContain("f12.ts")
  })

  it("proposes rather than decides, like every other guided prompt", () => {
    const p = composeGuidedWidenPrompt("s1", ["a.ts"])
    expect(p).toContain("Do NOT change any code")
    expect(p).toContain("the human disposes of every proposal")
  })
})
