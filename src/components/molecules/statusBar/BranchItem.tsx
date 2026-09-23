import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Dropdown, MenuLabel, MenuRow } from "@/components/atoms/Dropdown"
import { GitBranchIcon } from "@/components/atoms/icons"
import { type GitBranches, gitBranches, gitCheckout, gitInfo } from "@/lib/api"
import { notifyError } from "@/lib/notice"
import { useProject } from "@/lib/store"
import { ITEM } from "./shared"

/** The current branch, and a switch to any other — local or remote. */
export function BranchItem() {
  const root = useProject((s) => s.root)
  const git = useProject((s) => s.git)
  const { t } = useTranslation()
  const [branches, setBranches] = useState<GitBranches | null>(null)

  const loadBranches = () => {
    setBranches(null)
    gitBranches(root)
      .then(setBranches)
      .catch(() => setBranches(null))
  }

  const checkout = async (name: string, remote: boolean) => {
    try {
      await gitCheckout(root, name, remote)
      // Refresh in place. A full page reload would tear down the terminals and
      // tabs; instead update the branch + tree now, and let the file watcher
      // reload the open file and re-anchor comments for the new working tree.
      useProject.getState().setGit(await gitInfo(root))
      useProject.getState().bumpTree()
    } catch (e) {
      // Picking a branch closes the menu, so the reason it didn't happen has to
      // go where the other failures go — a dirty working tree is the usual one.
      notifyError("statusBar", String(e))
    }
  }

  if (!git.isRepo) return <span className="px-1 text-faint">{t("status.notGit")}</span>
  return (
    <Dropdown
      label={t("status.branch")}
      triggerClassName={ITEM}
      onOpen={loadBranches}
      className="max-h-72 w-60 overflow-y-auto"
      trigger={
        <>
          <GitBranchIcon className="h-[13px] w-[13px]" />
          {git.branch ?? "—"}
        </>
      }
    >
      {!branches ? (
        <p className="px-3 py-2 text-sm text-faint">{t("common.loading")}</p>
      ) : (
        <>
          <MenuLabel>{t("branch.local")}</MenuLabel>
          {branches.local.length === 0 && <p className="px-3 py-1 text-sm text-faint">—</p>}
          {branches.local.map((b) => (
            <MenuRow
              key={`l:${b}`}
              value={`l:${b}`}
              label={b}
              checked={b === branches.current}
              onClick={() => void checkout(b, false)}
            />
          ))}
          {branches.remote.length > 0 && <MenuLabel>{t("branch.remote")}</MenuLabel>}
          {branches.remote.map((b) => (
            <MenuRow
              key={`r:${b}`}
              value={`r:${b}`}
              label={b}
              onClick={() => void checkout(b, true)}
            />
          ))}
        </>
      )}
    </Dropdown>
  )
}
