/**
 * The slim, icon-only tool rail on the left edge.
 *
 * It switches the side panel between tools (Files, Search, Comments) and
 * collapses the panel when the active tool is clicked again. A settings gear
 * sits at the bottom. New tools (Git, Orphans, Graph, History) slot in here as
 * their capabilities land.
 */
import { useWorkspace, usePalette, type Tool } from "../lib/store";
import { useComments, openCount } from "../lib/comments";
import { useT, type MessageKey } from "../i18n";
import { FilesIcon, SearchIcon, MessageIcon, SettingsIcon } from "./icons";

const TOOLS: { id: Tool; labelKey: MessageKey; Icon: typeof SearchIcon }[] = [
  { id: "files", labelKey: "files.panel", Icon: FilesIcon },
  { id: "search", labelKey: "search.placeholder", Icon: SearchIcon },
  { id: "comments", labelKey: "comments.panel", Icon: MessageIcon },
];

export function ActivityBar() {
  const tool = useWorkspace((s) => s.tool);
  const selectTool = useWorkspace((s) => s.selectTool);
  const toggleSettings = usePalette((s) => s.toggleSettings);
  const badge = useComments((s) => openCount(s.comments));
  const t = useT();

  return (
    <nav className="flex w-12 flex-none flex-col items-center justify-between border-r border-line bg-surface py-2">
      <div className="flex flex-col items-center gap-1">
        {TOOLS.map(({ id, labelKey, Icon }) => {
          const active = tool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTool(id)}
              title={t(labelKey)}
              aria-label={t(labelKey)}
              aria-pressed={active}
              className={`relative grid h-9 w-9 place-items-center rounded-md transition-colors ${
                active
                  ? "bg-selection text-ink"
                  : "text-faint hover:bg-overlay hover:text-muted"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {id === "comments" && badge > 0 && (
                <span className="absolute top-1 right-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-marker px-1 text-[9px] font-bold text-on-accent">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => toggleSettings(true)}
        title={t("settings.title")}
        aria-label={t("settings.title")}
        className="grid h-9 w-9 place-items-center rounded-md text-faint transition-colors hover:bg-overlay hover:text-muted"
      >
        <SettingsIcon className="h-[18px] w-[18px]" />
      </button>
    </nav>
  );
}
