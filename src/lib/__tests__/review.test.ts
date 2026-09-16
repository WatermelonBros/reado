import { describe, expect, it } from "vitest"
import {
  composeAuditPrompt,
  composeCommitPrompt,
  composeExplainPrompt,
  composeGuidedChallengePrompt,
  composeGuidedCoverPrompt,
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
    expect(p).toContain("Reado comments")
    // "before ranking" is the point: the same sentences after the instruction
    // to emit the route would come too late to shape it.
    expect(p.indexOf("openspec/")).toBeLessThan(p.indexOf("ORDER THE ROUTE"))
  })

  it("names the structured channel first and the shell as the fallback", () => {
    // A route is an array of objects; passing it as a single-quoted shell
    // argument is where an apostrophe in a `reason` silently eats the plan.
    const p = composeGuidedPlanPrompt("s1", "the current diff")
    expect(p).toContain("review_plan")
    expect(p).toContain("MCP")
    expect(p).toContain("reado review")
    expect(p.indexOf("review_plan")).toBeLessThan(p.indexOf("reado review"))
    expect(p).toContain("cite which document")
  })

  it("carries the objective into the planning pass, not just into the file pass", () => {
    const p = composeGuidedPlanPrompt("s1", "the current diff", { objective: "security" })
    expect(p).toContain("Objective: security")
    expect(p).toContain("where you go deep")
    // Without one, no objective sentence is invented.
    expect(composeGuidedPlanPrompt("s1", "the current diff")).not.toContain("Objective:")
  })

  it("asks for a reading order, not a triage queue", () => {
    // A route ranked by risk alone drops the reviewer into the middle of a
    // change with no context — and a reviewer who does not understand the
    // change cannot judge it, however risky the file they were handed first.
    const p = composeGuidedPlanPrompt("s1", "the current diff")
    expect(p).toContain("ORDER THE ROUTE SO THE CHANGE READS")
    expect(p).toContain("Start where the change starts")
    expect(p).toContain("definition before use")
    expect(p).toContain("relatedFiles")
    expect(p).toContain("generated output, lockfiles, snapshots")
    // Risk is the tie-breaker inside the reading, not the axis itself.
    expect(p).toContain("it does not replace it")
    expect(p.indexOf("ORDER THE ROUTE")).toBeLessThan(p.indexOf("the riskiest first"))
  })

  it("says why a file sits where it sits, not only that it matters", () => {
    const p = composeGuidedPlanPrompt("s1", "the current diff")
    expect(p).toContain("what the reader already knows by the time they reach it")
  })

  it("tells the agent how deep each file needs to be read, and that some do not", () => {
    // `suggestedReviewMode` existed with nothing to choose it by, and coverage
    // read as "route everything" with no room for "this one is noise".
    const p = composeGuidedPlanPrompt("s1", "the current diff")
    expect(p).toContain("`deep` for the logic the change turns on")
    expect(p).toContain("`quick` for mechanical or generated ones")
    expect(p).toContain("Not every file needs reading")
    expect(p).toContain("accounted for, not that every file is read closely")
  })

  it("states the file set Reado already read, and what covering it means", () => {
    const p = composeGuidedPlanPrompt("s1", "the current diff", {
      files: ["src/a.ts", "src/new.test.ts"],
    })
    expect(p).toContain("src/a.ts, src/new.test.ts")
    expect(p).toContain("2 files changed")
    expect(p).toContain("untracked included")
    expect(p).toContain("out of scope")
    expect(p).toContain("silence is not")
  })

  it("names a bounded number of files and defers the rest to the session", () => {
    // The prompt is typed into a terminal; a 200-file diff must not become a
    // 200-path line. Nothing is lost — review_plan still answers with every
    // file the route left out.
    const many = Array.from({ length: 80 }, (_, i) => `src/f${i}.ts`)
    const p = composeGuidedPlanPrompt("s1", "the current diff", { files: many })
    expect(p).toContain("these 80 files changed")
    expect(p).toContain("src/f59.ts")
    expect(p).not.toContain("src/f60.ts")
    expect(p).toContain("+20 more")
    expect(p).toContain("expectedFiles")
    // A scope that fits is named in full, with no "more" tail.
    expect(composeGuidedPlanPrompt("s1", "d", { files: ["a.ts"] })).not.toContain("more —")
  })

  it("asserts no coverage when Reado has no file set to assert it from", () => {
    // A PR lives in git refs and a free-text request has no set: a coverage
    // claim there would be invented.
    const p = composeGuidedPlanPrompt("s1", "a pull request", { pr: { head: "h", base: "b" } })
    expect(p).not.toContain("must end up in your route")
    expect(composeGuidedPlanPrompt("s1", "what I asked for", { files: [] })).not.toContain(
      "must end up in your route",
    )
  })

  it("still forbids reviewing or editing during planning", () => {
    const p = composeGuidedPlanPrompt("s1", "the current diff")
    expect(p).toContain("do NOT change any code")
    expect(p).toContain("Do NOT review deeply yet")
  })

  it("is a single line (submits as one message)", () => {
    expect(
      composeGuidedPlanPrompt("s1", "the current diff", { objective: "security", files: ["a.ts"] }),
    ).not.toContain("\n")
  })
})

describe("guided coverage prompt", () => {
  it("offers the two honest answers for a file the route left out", () => {
    const p = composeGuidedCoverPrompt("s1", ["a.ts", "b.ts"])
    expect(p).toContain("a.ts, b.ts")
    expect(p).toContain("review_propose_route_change")
    expect(p).toContain("out-of-scope")
    expect(p).toContain("Do NOT change any code")
  })

  it("says the change waits for the human", () => {
    // Otherwise an agent reads "propose" as "apply" and re-plans the route the
    // human is walking.
    expect(composeGuidedCoverPrompt("s1", ["a.ts"])).toContain("does not apply by itself")
  })

  it("is a single line (submits as one message)", () => {
    expect(composeGuidedCoverPrompt("s1", ["a.ts"])).not.toContain("\n")
  })
})

describe("guided wide pass", () => {
  it("anchors on the route's files and names the four things to look for", () => {
    const p = composeGuidedWidenPrompt("s1", ["a.ts", "b.ts"])
    expect(p).toContain("a.ts, b.ts")
    expect(p).toContain("repeated patterns")
    expect(p).toContain("documented intent")
    expect(p).toContain("structural risk")
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

  it("routes its findings through the session's own propose and summarize verbs", () => {
    const p = composeGuidedWidenPrompt("s1", ["a.ts"])
    expect(p).toContain("review_propose_comment")
    expect(p).toContain("review_propose --kind question")
    expect(p).toContain("session summary")
    expect(p).toContain("the human disposes of every proposal")
  })

  it("is a single line — the pane types it, and a newline submits early", () => {
    // `pasteAndSubmit` writes the prompt raw and then presses Enter: an embedded
    // newline sends a fragment of it as its own message.
    expect(composeGuidedWidenPrompt("s1", ["a.ts"])).not.toContain("\n")
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

  it("tells the agent not to sign the commit as a co-author", () => {
    // Agents add a Co-Authored-By trailer by default; the commit belongs to
    // whoever pressed the button.
    const p = composeCommitPrompt()
    expect(p).toContain("Co-Authored-By")
    expect(p).toMatch(/Do NOT add a Co-Authored-By/)
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
    expect(p).toContain("review_context")
    expect(p).toContain("Read the file and")
    expect(p).toContain("review_propose_comment")
    expect(p).toContain("review_summarize_file")
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
    expect(composeGuidedFilePrompt("s1", "a.ts", "quick")).toContain("needs-context")
  })

  it("gives the agent a way to route the file it just discovered matters", () => {
    // The route was planned before any code was read. Without this verb the
    // agent's only options are to review off-route silently or to say nothing.
    const p = composeGuidedFilePrompt("s1", "a.ts", "normal")
    expect(p).toContain("review_propose_route_change")
    expect(p).toContain("it waits for the human")
  })
})

describe("guided planning prompt for a PR", () => {
  it("inspects the fetched refs instead of checking anything out", () => {
    const p = composeGuidedPlanPrompt("s1", "PR #7", { pr: { head: "pr/7/head", base: "main" } })
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
    expect(p).toContain("review_context")
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
