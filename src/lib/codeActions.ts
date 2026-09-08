/**
 * Quick Fix and the rest of the code-action family, in front of the LSP call.
 *
 * The language server answers with a flat list of everything it can do at a
 * position — a fix for a diagnostic, a refactor, a whole-file source action —
 * and the menu has to make the difference visible, because "add the missing
 * import" and "move this to a new file" are not the same kind of decision.
 */
import { t } from "@/i18n"
import { useDocInfo } from "./docInfo"
import { lspCodeActions, type ResolvedAction } from "./lsp"
import { notify, notifyError } from "./notice"

/** The groups the menu shows, in the order it shows them. */
export type ActionGroup = "fix" | "refactor" | "source" | "other"

/** Which group an action's LSP `kind` belongs to. */
export function groupOf(kind: string | undefined): ActionGroup {
  if (!kind) return "other"
  if (kind.startsWith("quickfix")) return "fix"
  if (kind.startsWith("refactor")) return "refactor"
  if (kind.startsWith("source")) return "source"
  return "other"
}

export const GROUP_LABEL: Record<ActionGroup, string> = {
  fix: "lsp.actionKindFix",
  refactor: "lsp.actionKindRefactor",
  source: "lsp.actionKindSource",
  other: "lsp.actionKindOther",
}

const ORDER: ActionGroup[] = ["fix", "refactor", "source", "other"]

/**
 * Sort actions into menu order: fixes first, then refactors, then source-wide
 * ones — and inside each group, the action the server marked as preferred.
 */
export function sortActions(actions: ResolvedAction[]): ResolvedAction[] {
  return [...actions].sort((a, b) => {
    const byGroup = ORDER.indexOf(groupOf(a.kind)) - ORDER.indexOf(groupOf(b.kind))
    if (byGroup !== 0) return byGroup
    return Number(!!b.isPreferred) - Number(!!a.isPreferred)
  })
}

/**
 * The actions available at the current selection, or null when there is no
 * server to ask.
 *
 * `only` narrows the request to one kind — that is how "Organize Imports" asks
 * for exactly that and nothing else.
 */
export async function actionsAtCursor(only?: string[]): Promise<ResolvedAction[] | null> {
  const view = useDocInfo.getState().view
  if (!view) return null
  const { from, to } = view.state.selection.main
  const actions = await lspCodeActions(view, from, to, only)
  return actions && sortActions(actions)
}

/** Run one action, reporting a failure rather than swallowing it. */
export async function runAction(action: ResolvedAction): Promise<void> {
  try {
    await action.apply()
    useDocInfo.getState().view?.focus()
  } catch (e) {
    notifyError("codeActions", t("lsp.actionFailed"), e)
  }
}

/**
 * Organize Imports: ask for that one source action and run it.
 *
 * A menu with a single entry is a worse answer than just doing the thing, so
 * this skips the picker entirely.
 */
export async function organizeImports(): Promise<void> {
  const actions = await actionsAtCursor(["source.organizeImports"])
  if (actions === null) {
    notify("info", t("lsp.noServer"))
    return
  }
  const action = actions.find((a) => a.kind?.startsWith("source.organizeImports")) ?? actions[0]
  if (!action) {
    notify("info", t("lsp.noActions"))
    return
  }
  await runAction(action)
}
