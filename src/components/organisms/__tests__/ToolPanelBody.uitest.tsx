// The tool-panel router: every tool in the activity bar must resolve to a body,
// and `isTool` must agree with that list — a tool the router doesn't know
// renders an empty sidebar, and a PanelId it wrongly claims renders the wrong
// thing in a dock.
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// Each panel has its own test; here only the routing matters.
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => ({ [name]: () => <div data-testid={`body:${name}`} /> }),
}))
vi.mock("../FileTree", () => stub("FileTree"))
vi.mock("../SearchPanel", () => stub("SearchPanel"))
vi.mock("../CommentsPanel", () => stub("CommentsPanel"))
vi.mock("../OutlinePanel", () => stub("OutlinePanel"))
vi.mock("../GitPanel", () => stub("GitPanel"))
vi.mock("../SpecsPanel", () => stub("SpecsPanel"))
vi.mock("../OrphansPanel", () => stub("OrphansPanel"))
vi.mock("../ProblemsPanel", () => stub("ProblemsPanel"))
vi.mock("../BookmarksPanel", () => stub("BookmarksPanel"))
vi.mock("../HierarchyPanel", () => stub("HierarchyPanel"))
vi.mock("../TimelinePanel", () => stub("TimelinePanel"))
vi.mock("../QaPanel", () => stub("QaPanel"))
vi.mock("../ToursPanel", () => ({ ...stub("ToursPanel"), TourBar: () => null }))
vi.mock("../PreReviewPanel", () => stub("PreReviewPanel"))
vi.mock("../GuidedReviewPanel", () => stub("GuidedReviewPanel"))
vi.mock("../CoveragePanel", () => stub("CoveragePanel"))
vi.mock("../ExtensionsPanel", () => stub("ExtensionsPanel"))

import { isTool, TOOL_TITLE, ToolPanelBody } from "@/components/organisms/ToolPanelBody"

const TOOLS = Object.keys(TOOL_TITLE) as Array<keyof typeof TOOL_TITLE>

/** What each tool must render — written out by hand, so a tool wired to the
 *  wrong panel (or to none) fails here instead of quietly showing the wrong one. */
const EXPECTED: Record<string, string> = {
  files: "FileTree",
  search: "SearchPanel",
  comments: "CommentsPanel",
  outline: "OutlinePanel",
  git: "GitPanel",
  specs: "SpecsPanel",
  orphans: "OrphansPanel",
  problems: "ProblemsPanel",
  bookmarks: "BookmarksPanel",
  hierarchy: "HierarchyPanel",
  timeline: "TimelinePanel",
  qa: "QaPanel",
  tours: "ToursPanel",
  prereview: "PreReviewPanel",
  guidedreview: "GuidedReviewPanel",
  coverage: "CoveragePanel",
  extensions: "ExtensionsPanel",
}

describe("every tool resolves to its own body", () => {
  for (const tool of TOOLS) {
    it(`${tool} renders ${EXPECTED[tool]}`, () => {
      render(<ToolPanelBody tool={tool} />)
      expect(screen.getByTestId(`body:${EXPECTED[tool]}`)).toBeInTheDocument()
    })
  }

  it("covers every tool the activity bar can select", () => {
    // The table above is hand-written; this is what keeps it in step with the
    // tool list rather than drifting behind it.
    expect(Object.keys(EXPECTED).sort()).toEqual([...TOOLS].sort())
  })
})

describe("isTool", () => {
  it("claims none of the other dock panels", () => {
    for (const id of ["terminal", "browser", "inspector", "reasoning", "nonsense"]) {
      expect(isTool(id)).toBe(false)
    }
  })

  it("claims every id the router handles", () => {
    for (const tool of Object.keys(EXPECTED)) expect(isTool(tool)).toBe(true)
  })
})
