import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { TYPE_COLOR } from "@/components/atoms/commentMeta"
import { Dropdown, MenuRow } from "@/components/atoms/Dropdown"
import { MoreIcon } from "@/components/atoms/icons"
import { Textarea } from "@/components/atoms/Textarea"
import type { MessageKey } from "@/i18n"
import type { Proposal, Session } from "@/lib/api"
import { currentEntry, openProposals, useGuidedReview } from "@/lib/guidedReview"
import { useProject } from "@/lib/store"
import { Action, Confirm, FilePath, MENU_TRIGGER, SectionLabel } from "./parts"

/** The open proposals, the current file's first. */
export function ProposalList({ root, session }: { root: string; session: Session }) {
  const entry = currentEntry(session)
  const open = openProposals(session)
  const hasRoute = (session.route ?? []).length > 0
  const { t } = useTranslation()
  const store = useGuidedReview.getState

  // Proposals for the file currently in focus float to the top; the rest follow.
  const focusFile = entry?.file
  const ordered = useMemo(
    () => [...open].sort((a, b) => Number(b.file === focusFile) - Number(a.file === focusFile)),
    [open, focusFile],
  )
  // The current file's open proposals — the batch "approve/discard all" targets.
  const focusFileOpen = useMemo(() => open.filter((p) => p.file === focusFile), [open, focusFile])
  const disposeAll = (fn: (root: string, sessionId: string, id: string) => Promise<unknown>) => {
    // Snapshot ids first — each call mutates the proposal list.
    for (const id of focusFileOpen.map((p) => p.id)) void fn(root, session.id, id)
  }
  if (!hasRoute) return null
  return (
    <section className="mt-6 flex-none border-t border-line/70 pt-4">
      <div className="flex items-center justify-between pr-4">
        <SectionLabel>
          {t("guided.proposals")}
          {ordered.length > 0 && <span className="text-faint">· {ordered.length}</span>}
        </SectionLabel>
        {focusFileOpen.length >= 2 && (
          <div className="flex items-center gap-2">
            <Button size="sm" className="text-accent" onClick={() => disposeAll(store().accept)}>
              {t("guided.approveAll")}
            </Button>
            {/* Discarding the lot is N irreversible disposals from one
                    click; approving is not, so only this one asks. */}
            <Confirm
              confirmLabel={t("guided.discardAllConfirm", { count: focusFileOpen.length })}
              onConfirm={() => disposeAll(store().discard)}
            >
              {t("guided.discardAll")}
            </Confirm>
          </div>
        )}
      </div>
      {ordered.length === 0 ? (
        <p className="px-4 py-2 text-xs text-faint">{t("guided.noProposals")}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {ordered.map((p) => (
            <ProposalRow key={p.id} root={root} sessionId={session.id} p={p} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ProposalRow({ root, sessionId, p }: { root: string; sessionId: string; p: Proposal }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(p.body)
  const [busy, setBusy] = useState(false)
  const { t } = useTranslation()
  const store = useGuidedReview.getState
  const anchored = !!p.file && p.startLine > 0
  const color = p.type ? TYPE_COLOR[p.type] : "var(--text-muted)"

  // Run a disposal action with the row's buttons disabled while it's in flight —
  // a double-click on Approve would otherwise try to accept the same proposal
  // twice (core is now idempotent too, but the UI shouldn't fire it twice).
  const run = (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    void fn().finally(() => setBusy(false))
  }

  return (
    <li className="border-b border-line/60 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] text-faint">
        <span
          className="h-2 w-2 flex-none rounded-full"
          style={{ background: color }}
          aria-hidden="true"
        />
        <span className="font-medium uppercase tracking-wide" style={{ color }}>
          {t(`guided.at.${p.artifactType}` as MessageKey)}
        </span>
        {anchored && (
          <button
            type="button"
            onClick={() => useProject.getState().open(`${root}/${p.file}`, p.startLine)}
            className="flex min-w-0 flex-1 items-center gap-0.5 py-1 text-left text-[11px] hover:text-ink"
            title={`${p.file}:${p.startLine}`}
          >
            <FilePath file={p.file} />
            <span className="flex-none">:{p.startLine}</span>
          </button>
        )}
      </div>

      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="mt-1 resize-none px-2 py-1 text-xs focus:border-accent"
        />
      ) : (
        <p className="mt-1 text-xs leading-snug break-words [overflow-wrap:anywhere] text-ink">
          {p.body}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {editing ? (
          <>
            <Action
              tone="accent"
              disabled={busy}
              onClick={() => {
                run(() => store().edit(root, sessionId, p.id, draft))
                setEditing(false)
              }}
            >
              {t("guided.save")}
            </Action>
            <Confirm
              // Cancel used to throw away whatever had been typed, silently.
              guarded={draft !== p.body}
              confirmLabel={t("guided.cancelConfirm")}
              onConfirm={() => {
                setDraft(p.body)
                setEditing(false)
              }}
            >
              {t("guided.cancel")}
            </Confirm>
          </>
        ) : (
          <>
            {/* Five equal chips made the panel's most frequent decision a scan.
                The two answers the reviewer actually gives — yes, no — are the
                two visible controls; the rarer dispositions live one press
                deeper, in a menu that brings its own roving focus and ARIA. */}
            <Button
              variant="primary"
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={() => run(() => store().accept(root, sessionId, p.id))}
            >
              {t("guided.approve")}
            </Button>
            <Action
              disabled={busy}
              onClick={() => run(() => store().discard(root, sessionId, p.id))}
            >
              {t("guided.discard")}
            </Action>
            <Dropdown
              label={t("guided.moreActions")}
              placement="bottom"
              align="end"
              triggerClassName={MENU_TRIGGER}
              trigger={<MoreIcon className="h-3.5 w-3.5" />}
            >
              <MenuRow
                label={t("guided.approveNote")}
                onClick={() => run(() => store().accept(root, sessionId, p.id, true))}
              />
              <MenuRow
                label={t("guided.edit")}
                onClick={() => {
                  // Seed the editor from the *current* body, not a stale mount-time copy.
                  setDraft(p.body)
                  setEditing(true)
                }}
              />
              <MenuRow
                label={t("guided.falsePositive")}
                onClick={() =>
                  run(() => store().falsePositive(root, sessionId, p.id, t("guided.fpNote")))
                }
              />
            </Dropdown>
          </>
        )}
      </div>
    </li>
  )
}
