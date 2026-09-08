/**
 * "Open Editors" — the open tabs, as a list above the file tree.
 *
 * The tab strip already shows them, but it can be set to a single tab or hidden
 * entirely (`tabBar`), and at that point nothing in the window says what is
 * open. This is the list that always can: it shows unsaved edits, closes a file
 * without switching to it, and closes the saved ones in one go.
 *
 * Collapsed by default — the tree is what the panel is for — and its state is
 * remembered.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { IconButton } from "@/components/atoms/IconButton"
import { ChevronIcon, CloseIcon, FileIcon } from "@/components/atoms/icons"
import { toRelative } from "@/lib/comments"
import { useEditorActions, useProject, useSettings } from "@/lib/store"
import { tabLabels } from "./Tabs"

export function OpenEditors() {
  const tabs = useProject((s) => s.tabs)
  const active = useProject((s) => s.active)
  const root = useProject((s) => s.root)
  const setActive = useProject((s) => s.setActive)
  const close = useProject((s) => s.close)
  const iconMode = useSettings((s) => s.fileIcons)
  const dirtyPaths = useEditorActions((s) => s.dirtyPaths)
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  if (tabs.length === 0) return null
  const labels = tabLabels(tabs)

  return (
    <div className="flex-none border-b border-line">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 py-1 pl-1 text-left text-[10px] font-semibold tracking-wide text-faint uppercase hover:text-ink"
        >
          <ChevronIcon
            className={`h-3 w-3 flex-none transition-transform ${open ? "rotate-90" : ""}`}
          />
          {t("tabs.openEditors")}
          <span className="tabular-nums">({tabs.length})</span>
        </button>
      </div>
      {open && (
        <ul className="m-0 max-h-48 list-none overflow-y-auto p-0 pb-1">
          {tabs.map((path) => {
            const dirty = dirtyPaths.includes(toRelative(root, path))
            const label = labels.get(path) ?? { name: path }
            return (
              <li key={path} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => setActive(path)}
                  title={path}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 py-[3px] pl-5 text-left text-sm ${
                    active === path ? "bg-selection text-ink" : "text-muted hover:bg-surface"
                  }`}
                >
                  <FileIcon isDir={false} name={label.name} mode={iconMode} className="flex-none" />
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {label.name}
                  </span>
                  {label.dir && (
                    <span className="flex-none text-[10px] text-faint">{label.dir}</span>
                  )}
                  {dirty && (
                    <span
                      role="img"
                      aria-label={t("tabs.unsaved")}
                      title={t("tabs.unsaved")}
                      className="h-1.5 w-1.5 flex-none rounded-full bg-accent"
                    />
                  )}
                </button>
                <IconButton
                  size="xxs"
                  label={`${t("tabs.close")} ${label.name}`}
                  icon={<CloseIcon className="h-3 w-3" />}
                  onClick={() => close(path)}
                  className="mr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
