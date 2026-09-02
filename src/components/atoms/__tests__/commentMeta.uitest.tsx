// Pure presentation metadata for comments: colour maps, key builders, agent
// identity and the small <Dot>. No DOM/Tauri dependencies — runs everywhere.

import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  ACCENT,
  AGENT_BRAND,
  agentBrand,
  authorLabel,
  COMMENT_STATES,
  COMMENT_TYPES,
  Dot,
  stateKey,
  TYPE_COLOR,
  typeKey,
} from "@/components/atoms/commentMeta"
import type { Message } from "@/lib/api"

const msg = (over: Partial<Message>): Message => ({
  author: "user",
  createdAt: 0,
  body: "",
  ...over,
})

describe("commentMeta option lists", () => {
  it("exposes every comment type with a colour", () => {
    expect(COMMENT_TYPES).toEqual(["bug", "refactor", "performance", "question", "note"])
    for (const t of COMMENT_TYPES) expect(TYPE_COLOR[t]).toMatch(/^var\(--/)
  })

  it("exposes the ordered comment states", () => {
    // "blocked" sits between in-progress and done: it is a live state the human
    // still has to act on, not an outcome.
    expect(COMMENT_STATES).toEqual(["open", "in-progress", "blocked", "done", "discarded"])
  })
})

describe("key builders", () => {
  it("typeKey/stateKey produce dotted message keys", () => {
    expect(typeKey("bug")).toBe("comment.type.bug")
    expect(stateKey("done")).toBe("comment.state.done")
  })
})

describe("ACCENT", () => {
  it("returns a theme-following color-mix, ignoring the type argument", () => {
    expect(ACCENT()).toContain("color-mix(in oklab")
    expect(ACCENT("bug")).toBe(ACCENT("note"))
  })
})

describe("agentBrand", () => {
  it("returns null for user messages", () => {
    expect(agentBrand(msg({ author: "user" }))).toBeNull()
  })

  it("returns null when an agent message has no agent id", () => {
    expect(agentBrand(msg({ author: "agent" }))).toBeNull()
  })

  it("returns null for an unknown agent id", () => {
    expect(agentBrand(msg({ author: "agent", agent: "mystery" }))).toBeNull()
  })

  it("returns the brand for a known agent", () => {
    expect(agentBrand(msg({ author: "agent", agent: "claude-code" }))).toBe(
      AGENT_BRAND["claude-code"],
    )
  })
})

describe("authorLabel", () => {
  it("uses the provided name for user messages", () => {
    expect(authorLabel(msg({ author: "user" }), "Matteo")).toBe("Matteo")
  })

  it("maps a known agent id to its display name", () => {
    expect(authorLabel(msg({ author: "agent", agent: "codex" }), "Me")).toBe("Codex")
  })

  it("falls back to the raw id for an unknown agent", () => {
    expect(authorLabel(msg({ author: "agent", agent: "rover" }), "Me")).toBe("rover")
  })

  it("uses a generic AI label when an agent message has no id", () => {
    expect(authorLabel(msg({ author: "agent" }), "Me")).toBe("AI")
  })
})

describe("Dot", () => {
  it("renders a span tinted with the given colour", () => {
    const { container } = render(<Dot color="rgb(255, 0, 0)" />)
    const span = container.querySelector("span")!
    expect(span).toBeInTheDocument()
    expect(span.style.background).toBe("rgb(255, 0, 0)")
  })
})
