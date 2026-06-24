/**
 * The slim, icon-only tool rail on the left edge.
 *
 * It switches the side panel between tools (Files, Search, Comments) and
 * collapses the panel when the active tool is clicked again. A settings gear
 * sits at the bottom. New tools (Git, Orphans, Graph, History) slot in here as
 * their capabilities land.
 */
import { useWorkspace, usePalette, useProject, type Tool } from "../../lib/store";
import { useComments, openCount } from "../../lib/comments";
import { useSpecs } from "../../lib/specs";
import { useDiagnostics } from "../../lib/diagnostics";
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
} from "../atoms/icons";

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
  const { t } = useTranslation();

  // Source Control appears in git repos; Orphans only when there's something to
  // fix; Specs only when the project has an OpenSpec/speckit plan.
  const tools: ToolDef[] = [
    ...BASE_TOOLS,
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
  ];
  const badgeFor = (id: Tool) =>
    id === "comments"
      ? openComments
      : id === "orphans"
        ? orphanCount
        : id === "problems"
          ? problemCount
          : 0;

  // One shared accent bar that slides to the active tool (button pitch = 44px:
  // h-10 (40px) + gap-1 (4px)).
  const activeIndex = tools.findIndex((x) => x.id === tool);

  return (
    <nav className="flex w-12 flex-none flex-col items-center justify-between border-r border-line bg-surface py-2">
      <div className="relative flex flex-col items-center gap-1">
        <span
          aria-hidden="true"
          className="absolute left-0 h-7 w-0.5 rounded-full bg-accent transition-[top,opacity] duration-200 ease-out"
          style={{
            top: activeIndex * 44 + 6,
            opacity: activeIndex >= 0 ? 1 : 0,
          }}
        />
        {tools.map(({ id, labelKey, Icon }) => {
          const active = tool === id;
          const badge = badgeFor(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTool(id)}
              title={t(labelKey)}
              aria-label={t(labelKey)}
              aria-pressed={active}
              className={`relative grid h-10 w-10 place-items-center transition-colors ${
                active ? "text-ink" : "text-faint hover:text-muted"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {badge > 0 && (
                <span className="absolute top-1 right-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-marker px-1 text-[9px] font-bold text-on-accent">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1">
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
