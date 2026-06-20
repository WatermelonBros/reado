import { describe, it, expect } from "vitest";
import {
  composeReviewPrompt,
  composeReviewPromptForIds,
  composeSingleTaskPrompt,
} from "./review";

describe("review prompts", () => {
  it("pluralises the task count", () => {
    expect(composeReviewPrompt(1)).toContain("1 task ");
    expect(composeReviewPrompt(3)).toContain("3 tasks");
  });

  it("is a single line (submits as one message)", () => {
    expect(composeReviewPrompt(2)).not.toContain("\n");
    expect(composeReviewPromptForIds(["a", "b"])).not.toContain("\n");
    expect(composeSingleTaskPrompt("c_1")).not.toContain("\n");
  });

  it("lists specific ids and references the CLI", () => {
    const p = composeReviewPromptForIds(["c_1", "c_2"]);
    expect(p).toContain("c_1, c_2");
    expect(p).toContain("reado task done <id>");
  });

  it("falls back to the generic prompt for no ids", () => {
    expect(composeReviewPromptForIds([])).toContain("reado task list");
  });

  it("targets a single task by id", () => {
    const p = composeSingleTaskPrompt("c_42");
    expect(p).toContain("reado task show c_42");
    expect(p).toContain("reado task done c_42");
  });
});
