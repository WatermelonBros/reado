/**
 * The slim, icon-only tool rail on the left edge.
 *
 * It switches the side panel between tools (Files, Search, Comments) and
 * collapses the panel when the active tool is clicked again. A settings gear
 * sits at the bottom. New tools (Git, Orphans, Graph, History) slot in here as
 * their capabilities land.
 */
import { useRef } from "react";
import { usePointerReorder, useFlip } from "../../lib/pointerReorder";
import { useWorkspace, usePalette, useProject, type Tool } from "../../lib/store";
import { useComments, openCount } from "../../lib/comments";
import { useSpecs } from "../../lib/specs";
import { useDiagnostics } from "../../lib/diagnostics";
import { useBookmarks } from "../../lib/bookmarks";
import { useHierarchy } from "../../lib/hierarchy";
import { useQa } from "../../lib/qa";
import { useTours } from "../../lib/tours";
import { usePreReview } from "../../lib/preReview";
import { useGuidedReview, openProposals } from "../../lib/guidedReview";
import { type MessageKey } from "../../i18n";
import { useTranslation } from "react-i18next";
import {
  FilesIcon,
  SearchIcon,
  MessageIcon,
  GitBranchIcon,
  UnlinkIcon,
  GraphIcon,
  DocsIcon,
  SettingsIcon,
  SpecsIcon,
  OutlineIcon,
  ExtensionsIcon,
  ProblemsIcon,
  BookmarkIcon,
  HierarchyIcon,
  TimelineIcon,
  SparkleIcon,
  RouteIcon,
  TourIcon,
  CoverageIcon,
} from "../atoms/icons";
import { Badge } from "../atoms/Badge";

type ToolDef = { id: Tool; labelKey: MessageKey; Icon: typeof SearchIcon };

const BASE_TOOLS: ToolDef[] = [
  { id: "files", labelKey: "files.panel", Icon: FilesIcon },
  { id: "search", labelKey: "search.placeholder", Icon: SearchIcon },
  { id: "comments", labelKey: "comments.panel", Icon: MessageIcon },
  { id: "outline", labelKey: "outline.panel", Icon: OutlineIcon },
  { id: "extensions", labelKey: "ext.panel", Icon: ExtensionsIcon },
];

export function ActivityBar() {
  const tool = useWorkspace((s) => s.tool);
  const selectTool = useWorkspace((s) => s.selectTool);
  const toolOrder = useWorkspace((s) => s.toolOrder);
  const setToolOrder = useWorkspace((s) => s.setToolOrder);
  const toggleGraph = useWorkspace((s) => s.toggleGraph);
  const toggleDocs = useWorkspace((s) => s.toggleDocs);
  const toggleSettings = usePalette((s) => s.toggleSettings);
  const isRepo = useProject((s) => s.git.isRepo);
  const openComments = useComments((s) => openCount(s.comments));
  const orphanCount = useComments((s) => s.comments.filter((c) => c.orphan).length);
  const hasSpecs = useSpecs((s) => s.groups.length > 0);
  const problemCount = useDiagnostics((s) =>
    Object.values(s.byFile).reduce((n, items) => n + items.length, 0),
  );
  const bookmarkCount = useBookmarks((s) => s.bookmarks.length);
  const hasHierarchy = useHierarchy((s) => s.root !== null || s.loading || s.unsupported);
  const qaCount = useQa((s) => s.notes.length);
  const tourCount = useTours((s) => s.tours.length);
  const preReviewCount = usePreReview((s) => s.drafts.length);
  const guidedOpen = useGuidedReview((s) =>
    s.sessions.reduce((n, sess) => n + openProposals(sess).length, 0),
  );
  const { t } = useTranslation();

  // Source Control appears in git repos; Orphans only when there's something to
  // fix; Specs only when the project has an OpenSpec/speckit plan.
  const tools: ToolDef[] = [
    ...BASE_TOOLS,
    // The guided-review cockpit is always available — its empty state teaches how
    // to start a session, which is one of the feature's entry points.
    { id: "guidedreview", labelKey: "guided.panel", Icon: RouteIcon },
    // Reading coverage is core to the read-first mission — always available.
    { id: "coverage", labelKey: "coverage.panel", Icon: CoverageIcon },
    ...(isRepo
      ? [{ id: "git" as Tool, labelKey: "git.panel" as MessageKey, Icon: GitBranchIcon }]
      : []),
    ...(hasSpecs
      ? [{ id: "specs" as Tool, labelKey: "specs.panel" as MessageKey, Icon: SpecsIcon }]
      : []),
    ...(orphanCount > 0
      ? [{ id: "orphans" as Tool, labelKey: "orphans.panel" as MessageKey, Icon: UnlinkIcon }]
      : []),
    ...(problemCount > 0
      ? [{ id: "problems" as Tool, labelKey: "problems.panel" as MessageKey, Icon: ProblemsIcon }]
      : []),
    ...(bookmarkCount > 0
      ? [{ id: "bookmarks" as Tool, labelKey: "bookmarks.panel" as MessageKey, Icon: BookmarkIcon }]
      : []),
    ...(hasHierarchy
      ? [{ id: "hierarchy" as Tool, labelKey: "hier.panel" as MessageKey, Icon: HierarchyIcon }]
      : []),
    ...(isRepo
      ? [{ id: "timeline" as Tool, labelKey: "timeline.panel" as MessageKey, Icon: TimelineIcon }]
      : []),
    ...(qaCount > 0
      ? [{ id: "qa" as Tool, labelKey: "qa.panel" as MessageKey, Icon: SparkleIcon }]
      : []),
    ...(tourCount > 0
      ? [{ id: "tours" as Tool, labelKey: "tours.panel" as MessageKey, Icon: TourIcon }]
      : []),
    ...(preReviewCount > 0
      ? [{ id: "prereview" as Tool, labelKey: "prereview.panel" as MessageKey, Icon: SparkleIcon }]
      : []),
  ];
  const badgeFor = (id: Tool) =>
    id === "comments"
      ? openComments
      : id === "orphans"
        ? orphanCount
        : id === "problems"
          ? problemCount
          : id === "prereview"
            ? preReviewCount
            : id === "guidedreview"
              ? guidedOpen
              : 0;

  // Apply the user's custom order: listed tools first (in that order), the rest
  // keep their natural order after (sort is stable). Drag reorders the list.
  const rank = new Map(toolOrder.map((id, i) => [id, i]));
  const orderedTools = [...tools].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
  );

  const reorder = (from: Tool, to: Tool, after: boolean) => {
    if (from === to) return;
    const ids = orderedTools.map((x) => x.id).filter((id) => id !== from);
    const at = ids.indexOf(to) + (after ? 1 : 0);
    ids.splice(at, 0, from);
    // Keep any previously-ordered tool that isn't currently shown at the end.
    const hidden = toolOrder.filter((id) => !ids.includes(id));
    setToolOrder([...ids, ...hidden]);
  };

  // Pointer-based drag-to-reorder (HTML5 DnD is hijacked by Tauri's OS drop).
  const { dragging, over, onPointerDown } = usePointerReorder("y", (from, to, after) =>
    reorder(from as Tool, to as Tool, after),
  );
  const railRef = useRef<HTMLDivElement>(null);
  useFlip(railRef, orderedTools.map((x) => x.id).join(" "));

  // One shared accent bar that slides to the active tool (button pitch = 44px:
  // h-10 (40px) + gap-1 (4px)).
  const activeIndex = orderedTools.findIndex((x) => x.id === tool);

  return (
    <nav className="flex h-full w-12 flex-none flex-col items-center border-r border-line bg-surface py-2">
      <div
        ref={railRef}
        className="relative flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <span
          aria-hidden="true"
          className="absolute left-0 h-7 w-0.5 rounded-full bg-accent transition-[top,opacity] duration-200 ease-out"
          style={{
            top: activeIndex * 44 + 6,
            opacity: activeIndex >= 0 ? 1 : 0,
          }}
        />
        {orderedTools.map(({ id, labelKey, Icon }) => {
          const active = tool === id;
          const badge = badgeFor(id);
          return (
            <button
              key={id}
              type="button"
              data-tour={id}
              data-reorder-id={id}
              onPointerDown={onPointerDown(id)}
              onClick={() => selectTool(id)}
              title={t(labelKey)}
              aria-label={t(labelKey)}
              aria-pressed={active}
              className={`relative grid h-10 w-10 place-items-center transition-colors ${
                active ? "text-accent" : "text-faint hover:text-muted"
              } ${dragging === id ? "opacity-40" : ""}`}
            >
              {over?.id === id && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-1 z-10 h-0.5 bg-accent ${
                    over.after ? "bottom-0" : "top-0"
                  }`}
                />
              )}
              {/* Active tool: primary colour + duotone for a clear, calm accent. */}
              <Icon className="h-[18px] w-[18px]" weight={active ? "duotone" : "regular"} />
              {badge > 0 && (
                <Badge
                  tone="marker"
                  className="absolute top-1 right-1.5 h-3.5 min-w-3.5 text-[9px] font-bold"
                >
                  {badge}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-none flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => toggleDocs(true)}
          title={t("kb.title")}
          aria-label={t("kb.title")}
          className="grid h-10 w-10 place-items-center rounded-md text-faint transition-colors hover:bg-overlay hover:text-muted"
        >
          <DocsIcon className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={() => toggleGraph(true)}
          title={t("graph.title")}
          aria-label={t("graph.title")}
          className="grid h-10 w-10 place-items-center rounded-md text-faint transition-colors hover:bg-overlay hover:text-muted"
        >
          <GraphIcon className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          data-tour="settings"
          onClick={() => toggleSettings(true)}
          title={t("settings.title")}
          aria-label={t("settings.title")}
          className="grid h-10 w-10 place-items-center rounded-md text-faint transition-colors hover:bg-overlay hover:text-muted"
        >
          <SettingsIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </nav>
  );
}
