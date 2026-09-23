import { useTranslation } from "react-i18next"
import { IconButton } from "@/components/atoms/IconButton"
import { DiscardIcon, MinusIcon, PlusIcon } from "@/components/atoms/icons"
import { InlineConfirm } from "@/components/molecules/InlineConfirm"
import type { GitChange } from "@/lib/api"
import { baseName } from "@/lib/comments"
import { STATUS } from "@/lib/gitStatus"
import { dirName } from "@/lib/paths"

// Components at module level, never declared in the panel's body: declared in
// the body, a component is a fresh type each render, and the 4s status poll
// would remount every row — and each row carries IconButtons, whose tooltip
// machines would be torn down fifteen times a minute.

/** One changed file: open it as its diff, stage/unstage it, or discard it. */
export function GitChangeRow({
  change: c,
  confirming,
  onSelect,
  onArmDiscard,
  onDiscard,
  onToggleStage,
}: {
  change: GitChange
  /** The discard confirmation is up for this row. */
  confirming: boolean
  onSelect: () => void
  /** Put the discard confirmation up (a path) or take it down (null). */
  onArmDiscard: (path: string | null) => void
  onDiscard: () => void
  onToggleStage: () => void
}) {
  const { t } = useTranslation()
  const s = STATUS[c.status]
  return (
    <li className="group/row">
      <div className="flex items-center gap-2 px-3 py-1 text-sm transition-colors hover:bg-surface">
        <button
          type="button"
          onClick={onSelect}
          title={c.path}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-ink">{baseName(c.path)}</span>
          <span className="truncate text-xs text-faint">{dirName(c.path)}</span>
        </button>
        {confirming ? (
          <InlineConfirm
            question={`${t("git.discard")}?`}
            confirmLabel={t("comment.delete")}
            onConfirm={onDiscard}
            onCancel={() => onArmDiscard(null)}
          />
        ) : (
          <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
            {!c.staged && (
              <IconButton
                size="xs"
                danger
                label={t("git.discard")}
                icon={<DiscardIcon className="h-3.5 w-3.5" />}
                onClick={() => onArmDiscard(c.path)}
              />
            )}
            <IconButton
              size="xs"
              label={c.staged ? t("git.unstage") : t("git.stage")}
              icon={
                c.staged ? (
                  <MinusIcon className="h-3.5 w-3.5" />
                ) : (
                  <PlusIcon className="h-3.5 w-3.5" />
                )
              }
              onClick={onToggleStage}
            />
          </div>
        )}
        <span className="flex-none font-mono text-xs font-semibold" style={{ color: s.color }}>
          {s.letter}
        </span>
      </div>
    </li>
  )
}

/** A group's heading (Staged / Changes), its count, and its whole-group actions. */
export function GitGroupHeader({
  label,
  count,
  actions,
}: {
  label: string
  count: number
  actions: { onClick: () => void; label: string; Icon: typeof PlusIcon; danger?: boolean }[]
}) {
  return (
    <div className="group/hdr flex items-center gap-2 px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
      <span>{label}</span>
      <span className="text-faint">{count}</span>
      <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/hdr:opacity-100 group-focus-within/hdr:opacity-100">
        {actions.map((a) => (
          <IconButton
            key={a.label}
            size="xs"
            danger={a.danger}
            label={a.label}
            icon={<a.Icon className="h-3.5 w-3.5" />}
            onClick={a.onClick}
          />
        ))}
      </div>
    </div>
  )
}
