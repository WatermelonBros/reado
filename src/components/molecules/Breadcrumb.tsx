/** Path breadcrumb for the active file, with the diff toggle and base picker. */
import { useEffect, useState } from "react";
import { gitRefs, type GitRefs } from "../../lib/api";
import { useProject, useEditorActions } from "../../lib/store";

import { ChevronIcon, DiffIcon, BlameIcon, SparkleIcon } from "../atoms/icons";
import { IconButton } from "../atoms/IconButton";
import { Select } from "../atoms/Select";
import { useSynopsis } from "../../lib/synopsis";
import { useTranslation } from "react-i18next";

export function Breadcrumb() {
  const root = useProject((s) => s.root);
  const active = useProject((s) => s.active);
  const isRepo = useProject((s) => s.git.isRepo);
  const navStack = useProject((s) => s.navStack);
  const navIndex = useProject((s) => s.navIndex);
  const goBack = useProject((s) => s.goBack);
  const goForward = useProject((s) => s.goForward);
  const diffing = useEditorActions((s) => s.diffing);
  const setDiffing = useEditorActions((s) => s.setDiffing);
  const diffBase = useEditorActions((s) => s.diffBase);
  const setDiffBase = useEditorActions((s) => s.setDiffBase);
  const blame = useEditorActions((s) => s.blame);
  const setBlame = useEditorActions((s) => s.setBlame);
  const dirty = useEditorActions((s) => s.dirty);
  const { t } = useTranslation();
  const [refs, setRefs] = useState<GitRefs>({ branches: [], commits: [] });

  // Load the diff base options when the diff turns on.
  useEffect(() => {
    if (diffing && isRepo) gitRefs(root).then(setRefs).catch(() => {});
  }, [diffing, isRepo, root]);

  if (!active) return null;

  const rel = (active.startsWith(root) ? active.slice(root.length) : active)
    .replace(/^[\\/]+/, "")
    .replace(/\\/g, "/");
  const segments = rel.split("/");

  const baseOptions = [
    { value: "HEAD", label: t("diff.head") },
    ...refs.branches.map((b) => ({ value: b, label: b })),
    ...refs.commits.map((c) => ({
      value: c.hash,
      label: `${c.hash} · ${c.subject.slice(0, 32)}`,
    })),
  ];

  return (
    <nav
      aria-label={t("breadcrumb.label")}
      className="flex flex-none items-center gap-0.5 border-b border-line bg-canvas px-4 py-2 text-xs text-faint select-none"
    >
      <div className="mr-1.5 flex flex-none items-center gap-0.5">
        <IconButton
          label={t("nav.back")}
          icon={<ChevronIcon className="h-[13px] w-[13px] rotate-180" />}
          onClick={goBack}
          disabled={navIndex <= 0}
          size="sm"
        />
        <IconButton
          label={t("nav.forward")}
          icon={<ChevronIcon className="h-[13px] w-[13px]" />}
          onClick={goForward}
          disabled={navIndex >= navStack.length - 1}
          size="sm"
        />
      </div>

      {segments.map((seg, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && <ChevronIcon className="h-[11px] w-[11px] opacity-60" />}
          <span className={i === segments.length - 1 ? "text-muted" : ""}>{seg}</span>
        </span>
      ))}

      {dirty && (
        <span
          className="ml-1 h-1.5 w-1.5 flex-none rounded-full bg-accent"
          title={t("editor.unsaved")}
        />
      )}

      <div className="ml-auto flex flex-none items-center gap-1.5">
        {diffing && isRepo && (
          <Select
            ariaLabel={t("diff.base")}
            variant="ghost"
            value={diffBase}
            onChange={setDiffBase}
            options={baseOptions}
          />
        )}
        {!diffing && (
          <IconButton
            label={t("synopsis.open")}
            icon={<SparkleIcon className="h-3.5 w-3.5" />}
            onClick={() => useSynopsis.getState().show(rel)}
            size="sm"
          />
        )}
        {isRepo && !diffing && (
          <IconButton
            label={t("blame.toggle")}
            icon={<BlameIcon className="h-3.5 w-3.5" weight={blame ? "duotone" : "regular"} />}
            onClick={() => setBlame(!blame)}
            active={blame}
            size="sm"
          />
        )}
        {isRepo && (
          <IconButton
            label={t("diff.toggle")}
            icon={<DiffIcon className="h-3.5 w-3.5" weight={diffing ? "duotone" : "regular"} />}
            onClick={() => setDiffing(!diffing)}
            active={diffing}
            size="sm"
          />
        )}
      </div>
    </nav>
  );
}
