/**
 * The slim, icon-only tool rail on the left edge.
 *
 * It switches the side panel between tools (Files, Search, Comments) and
 * collapses the panel when the active tool is clicked again. A settings gear
 * sits at the bottom. New tools (Git, Orphans, Graph, History) slot in here as
 * their capabilities land.
 */
import { useWorkspace, usePalette, useProject, type Tool } from "../lib/store";
import { useComments, openCount } from "../lib/comments";
import { useT, type MessageKey } from "../i18n";
import {
  FilesIcon,
  SearchIcon,
  MessageIcon,
  GitBranchIcon,
  UnlinkIcon,
  GraphIcon,
  DocsIcon,
  SettingsIcon,
} from "./icons";

type ToolDef = { id: Tool; labelKey: MessageKey; Icon: typeof SearchIcon };

const BASE_TOOLS: ToolDef[] = [
  { id: "files", labelKey: "files.panel", Icon: FilesIcon },
  { id: "search", labelKey: "search.placeholder", Icon: SearchIcon },
  { id: "comments", labelKey: "comments.panel", Icon: MessageIcon },
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
  const t = useT();

  // Source Control appears in git repos; Orphans only when there's something to fix.
  const tools: ToolDef[] = [
    ...BASE_TOOLS,
    ...(isRepo
      ? [{ id: "git" as Tool, labelKey: "git.panel" as MessageKey, Icon: GitBranchIcon }]
      : []),
    ...(orphanCount > 0
      ? [{ id: "orphans" as Tool, labelKey: "orphans.panel" as MessageKey, Icon: UnlinkIcon }]
      : []),
  ];
  const badgeFor = (id: Tool) =>
    id === "comments" ? openComments : id === "orphans" ? orphanCount : 0;

  return (
    <nav className="flex w-12 flex-none flex-col items-center justify-between border-r border-line bg-surface py-2">
      <div className="flex flex-col items-center gap-1">
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
              {/* VS Code-style active indicator: an accent bar on the left edge. */}
              <span
                className={`absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-accent transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
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
          title={t("docs.title")}
          aria-label={t("docs.title")}
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
