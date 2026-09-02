/**
 * The tool panels' bodies and titles, in one place so they can render wherever
 * they are placed.
 *
 * They used to be a switch inside `ProjectView`'s sidebar, which is what made
 * them the one family of panels that could not be docked: the sidebar was the
 * only thing that knew how to draw them. Sharing the mapping lets `DockRegion`
 * render the very same panel on the right or the bottom, tab-stacked beside the
 * terminal, without either surface owning the list.
 */
import type { MessageKey } from "@/i18n"
import type { Tool } from "@/lib/store"
import { BookmarksPanel } from "./BookmarksPanel"
import { CommentsPanel } from "./CommentsPanel"
import { CoveragePanel } from "./CoveragePanel"
import { ExtensionsPanel } from "./ExtensionsPanel"
import { FileTree } from "./FileTree"
import { GitPanel } from "./GitPanel"
import { GuidedReviewPanel } from "./GuidedReviewPanel"
import { HierarchyPanel } from "./HierarchyPanel"
import { OrphansPanel } from "./OrphansPanel"
import { OutlinePanel } from "./OutlinePanel"
import { PreReviewPanel } from "./PreReviewPanel"
import { ProblemsPanel } from "./ProblemsPanel"
import { QaPanel } from "./QaPanel"
import { SearchPanel } from "./SearchPanel"
import { SpecsPanel } from "./SpecsPanel"
import { TimelinePanel } from "./TimelinePanel"
import { ToursPanel } from "./ToursPanel"

/** Panel title per tool. Every tool must be present (keys mirror the ActivityBar
 *  labels) — a missing entry renders `t(undefined)` as the header. */
export const TOOL_TITLE: Record<Tool, MessageKey> = {
  files: "files.panel",
  search: "search.placeholder",
  comments: "comments.panel",
  outline: "outline.panel",
  git: "git.panel",
  orphans: "orphans.panel",
  specs: "specs.panel",
  problems: "problems.panel",
  bookmarks: "bookmarks.panel",
  hierarchy: "hier.panel",
  timeline: "timeline.panel",
  qa: "qa.panel",
  tours: "tours.panel",
  prereview: "prereview.panel",
  guidedreview: "guided.panel",
  coverage: "coverage.panel",
  extensions: "ext.panel",
}

const TOOLS = Object.keys(TOOL_TITLE) as Tool[]

/** Whether a `PanelId` names a tool panel (rather than the terminal, browser, …). */
export function isTool(id: string): id is Tool {
  return (TOOLS as string[]).includes(id)
}

/** One tool panel's body, with no chrome — the surface around it supplies the
 *  header, because a sidebar and a dock strip want different ones. */
export function ToolPanelBody({ tool }: { tool: Tool }) {
  switch (tool) {
    case "files":
      return <FileTree />
    case "search":
      return <SearchPanel />
    case "comments":
      return <CommentsPanel />
    case "outline":
      return <OutlinePanel />
    case "git":
      return <GitPanel />
    case "specs":
      return <SpecsPanel />
    case "orphans":
      return <OrphansPanel />
    case "problems":
      return <ProblemsPanel />
    case "bookmarks":
      return <BookmarksPanel />
    case "hierarchy":
      return <HierarchyPanel />
    case "timeline":
      return <TimelinePanel />
    case "qa":
      return <QaPanel />
    case "tours":
      return <ToursPanel />
    case "prereview":
      return <PreReviewPanel />
    case "guidedreview":
      return <GuidedReviewPanel />
    case "coverage":
      return <CoveragePanel />
    case "extensions":
      return <ExtensionsPanel />
  }
}
