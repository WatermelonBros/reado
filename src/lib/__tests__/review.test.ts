import { describe, expect, it } from "vitest"
import {
  composeAuditPrompt,
  composeCommitPrompt,
  composeExplainPrompt,
  composeGuidedChallengePrompt,
  composeGuidedFilePrompt,
  composeGuidedPlanPrompt,
  composeGuidedRespondPrompt,
  composeGuidedWidenPrompt,
  composeReviewPrompt,
  composeReviewPromptForIds,
  composeSingleTaskPrompt,
  composeSymbolExplainPrompt,
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
    // "before ranking" is the point: the same sentences after the instruction
    // to emit the route would come too late to shape it.
    expect(p.indexOf("openspec/")).toBeLessThan(p.indexOf("ranked by risk"))
  })

  it("tells the agent the exact command that emits the route, for this session", () => {
    const p = composeGuidedPlanPrompt("s1", "the current diff")
    expect(p).toContain("reado review plan s1 --route")
    expect(p).toContain("Cite which document")
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

  it("routes its findings through the session's own propose and summarize commands", () => {
    const p = composeGuidedWidenPrompt("s1", ["a.ts"])
    expect(p).toContain("reado review propose-comment s1")
    expect(p).toContain("reado review propose s1 --kind question")
    expect(p).toContain("reado session summarize s1")
    expect(p).toContain("the human disposes of every proposal")
  })
})

describe("audit prompt", () => {
  it("targets the path and records findings as anchored comments, not edits", () => {
    const p = composeAuditPrompt("src/lib", "security")
    expect(p).toContain("`src/lib`")
    expect(p).toContain("focus: security")
    expect(p).toContain("Do NOT change any code")
    expect(p).toContain("reado comment add")
  })

  it("falls back to a general audit when no focus is given", () => {
    expect(composeAuditPrompt("src", "   ")).toContain("a general code-quality")
  })

  it("is a single line (submits as one message)", () => {
    expect(composeAuditPrompt("src", "perf")).not.toContain("\n")
  })
})

describe("commit prompt", () => {
  it("reviews, stages, commits and pushes without asking", () => {
    const p = composeCommitPrompt()
    expect(p).toContain("git status")
    expect(p).toContain("Conventional Commit")
    expect(p).toContain("git push")
    expect(p).toContain("Don't ask for confirmation")
  })
})

describe("explain prompt", () => {
  it("names a single line as a line", () => {
    expect(composeExplainPrompt("a.ts", 7, 7, false)).toContain("line 7")
  })

  it("names a span as a range", () => {
    expect(composeExplainPrompt("a.ts", 7, 12, false)).toContain("lines 7-12")
  })

  it("only records a note when asked to", () => {
    expect(composeExplainPrompt("a.ts", 7, 12, false)).not.toContain("reado comment add")
    const noted = composeExplainPrompt("a.ts", 7, 12, true)
    expect(noted).toContain("reado comment add --file a.ts --line 7 --end 12 --note")
  })

  it("never edits code", () => {
    expect(composeExplainPrompt("a.ts", 1, 2, true)).toContain("Do NOT change any code")
  })
})

describe("symbol explain prompt", () => {
  it("carries the language-server docs as context", () => {
    const p = composeSymbolExplainPrompt("a.ts", 4, "useMemo", "Returns a memoized value.")
    expect(p).toContain("`useMemo`")
    expect(p).toContain("at line 4")
    expect(p).toContain('"Returns a memoized value."')
  })

  it("flattens and caps the docs so the prompt stays one submittable line", () => {
    const p = composeSymbolExplainPrompt("a.ts", 4, "x", `${"d".repeat(2000)}\nmore`)
    expect(p).not.toContain("\n")
    expect(p).not.toContain("dmore")
    expect(p).toContain("d".repeat(1500))
    // The cap is exactly 1500 — without this, no cap at all would pass.
    expect(p).not.toContain("d".repeat(1501))
  })

  it("omits the docs sentence when the server had none", () => {
    const p = composeSymbolExplainPrompt("a.ts", 4, "x", "  ")
    expect(p).not.toContain("language-server docs")
    expect(p).toContain("reado comment add --file a.ts --line 4 --end 4 --note")
  })
})

describe("guided per-file prompt", () => {
  it("reads the working tree and proposes anchored comments", () => {
    const p = composeGuidedFilePrompt("s1", "a.ts", "deep")
    expect(p).toContain("reado review context s1 --file a.ts --json")
    expect(p).toContain("Read the file and")
    expect(p).toContain("reado review propose-comment s1 --file a.ts")
    expect(p).toContain("reado review summarize-file s1 --file a.ts")
    expect(p).toContain("the human disposes of every proposal")
  })

  it("carries the objective when one is set", () => {
    expect(composeGuidedFilePrompt("s1", "a.ts", "quick", "check the error paths")).toContain(
      "Objective: check the error paths.",
    )
  })

  it("reads a PR from its refs and never touches the working tree", () => {
    const p = composeGuidedFilePrompt("s1", "a.ts", "normal", undefined, {
      head: "pr/7/head",
      base: "main",
    })
    expect(p).toContain("git show pr/7/head:a.ts")
    expect(p).toContain("git diff main...pr/7/head -- a.ts")
    expect(p).toContain("never edit it")
  })

  it("prefers needs-context over a guess", () => {
    expect(composeGuidedFilePrompt("s1", "a.ts", "quick")).toContain("--kind needs-context")
  })
})

describe("guided planning prompt for a PR", () => {
  it("inspects the fetched refs instead of checking anything out", () => {
    const p = composeGuidedPlanPrompt("s1", "PR #7", { head: "pr/7/head", base: "main" })
    expect(p).toContain("git diff main...pr/7/head")
    expect(p).toContain("git show pr/7/head:<path>")
    expect(p).toContain("do NOT check anything out")
  })
})

describe("guided challenge prompt", () => {
  it("asks a second agent to attack the existing findings", () => {
    const p = composeGuidedChallengePrompt("s1", "a.ts")
    expect(p).toContain("second opinion")
    expect(p).toContain("false positives")
    expect(p).toContain("reado review context s1 --file a.ts --json")
    expect(p).toContain("Do NOT change any code")
  })
})

describe("guided respond prompt", () => {
  it("answers existing comments and adds no findings of its own", () => {
    const p = composeGuidedRespondPrompt("s1", "a.ts")
    expect(p).toContain("reado comment reply <id>")
    expect(p).toContain("do NOT resolve or close anything")
    expect(p).toContain("only respond to what's already there")
  })
})
