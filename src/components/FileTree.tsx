/**
 * Lazy, gitignore-aware file tree.
 *
 * Directories load their children on first expand (`list_dir`), so even large
 * repositories render instantly. The "show hidden" toggle re-fetches with
 * ignore rules disabled. Clicking a file opens it in the editor.
 */
import { useCallback, useEffect, useState } from "react";
import { listDir, type DirEntry } from "../lib/api";
import { useProject } from "../lib/store";
import { useT } from "../i18n";
import { FileIcon, ChevronIcon } from "./icons";

export function FileTree() {
  const root = useProject((s) => s.root);
  const showHidden = useProject((s) => s.showHidden);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div role="tree" className="flex-1 overflow-y-auto py-2">
        {/* `key` forces a full reload of the tree when the toggle flips. */}
        <DirChildren
          key={String(showHidden)}
          root={root}
          dir={root}
          depth={0}
          showHidden={showHidden}
        />
      </div>
    </div>
  );
}

interface DirChildrenProps {
  root: string;
  dir: string;
  depth: number;
  showHidden: boolean;
}

function DirChildren({ root, dir, depth, showHidden }: DirChildrenProps) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const t = useT();

  useEffect(() => {
    let cancelled = false;
    listDir(root, dir, showHidden)
      .then((e) => !cancelled && setEntries(e))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [root, dir, showHidden]);

  if (entries === null) {
    return (
      <div className="px-4 py-2 text-xs text-faint" style={indent(depth)}>
        {t("common.loading")}
      </div>
    );
  }
  if (entries.length === 0 && depth === 0) {
    return <div className="px-4 py-2 text-xs text-faint">{t("tree.empty")}</div>;
  }
  return (
    <>
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          root={root}
          entry={entry}
          depth={depth}
          showHidden={showHidden}
        />
      ))}
    </>
  );
}

const indent = (depth: number) => ({ paddingLeft: `${depth * 14 + 8}px` });

function TreeNode({
  root,
  entry,
  depth,
  showHidden,
}: {
  root: string;
  entry: DirEntry;
  depth: number;
  showHidden: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = useProject((s) => s.open);
  const active = useProject((s) => s.active);

  const onClick = useCallback(() => {
    if (entry.isDir) setExpanded((e) => !e);
    else open(entry.path);
  }, [entry, open]);

  const isActive = !entry.isDir && active === entry.path;

  return (
    <>
      <button
        type="button"
        style={indent(depth)}
        onClick={onClick}
        role="treeitem"
        aria-expanded={entry.isDir ? expanded : undefined}
        title={entry.name}
        className={`flex w-full items-center gap-1.5 py-[3px] pr-3 text-left text-sm text-ink transition-colors ${
          isActive ? "bg-selection" : "hover:bg-surface"
        }`}
      >
        {entry.isDir ? (
          <ChevronIcon
            className={`h-[13px] w-[13px] flex-none text-faint transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        ) : (
          <span className="w-[13px] flex-none" />
        )}
        <FileIcon isDir={entry.isDir} expanded={expanded} name={entry.name} />
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
          {entry.name}
        </span>
      </button>
      {entry.isDir && expanded && (
        <DirChildren
          root={root}
          dir={entry.path}
          depth={depth + 1}
          showHidden={showHidden}
        />
      )}
    </>
  );
}
