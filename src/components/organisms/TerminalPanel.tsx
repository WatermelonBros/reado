/**
 * The integrated-terminal dock (bottom or right of the workspace).
 *
 * A tab is a *group* that tiles one or more *panes* (each a live PTY) along an
 * axis. Launch buttons start `claude`/`codex`/`copilot` in the focused pane —
 * the entry point to the AI loop. Every pane stays mounted (hidden when not in
 * the active group) so PTYs and scrollback persist across tab/layout changes.
 */

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms/Badge"
import { Button } from "@/components/atoms/Button"
import { ContextMenu, type ContextMenuItem } from "@/components/atoms/ContextMenu"
import { IconButton } from "@/components/atoms/IconButton"
import {
  ClaudeIcon,
  CloseIcon,
  CodexIcon,
  CopilotIcon,
  GeminiIcon,
  LayoutIcon,
  OpenCodeIcon,
  PlusIcon,
  SendIcon,
  SparkleIcon,
  SplitIcon,
} from "@/components/atoms/icons"
import { AuditDialog, type AuditTarget } from "@/components/organisms/AuditDialog"
import { SendReviewDialog } from "@/components/organisms/SendReviewDialog"
import { Terminal } from "@/components/organisms/Terminal"
import { AGENT_BIN, AGENT_ORDER, type Agent, launchAgent } from "@/lib/agents"
import { agentInstalled } from "@/lib/api"
import { toRelative, useComments } from "@/lib/comments"
import { findPanel, useLayout } from "@/lib/layout"
import { useProject, useSettings } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"

// Brand colours for the agent launchers.
const CLAUDE_ORANGE = "#D97757"
const CODEX_TEAL = "#10A37F"
const COPILOT_VIOLET = "#8957E5"
const OPENCODE_GREY = "#656363"

/** The launcher row's *presentation*. Identity — which agents exist, in what
 *  order, and which binary each runs — belongs to `lib/agents.ts`; this only
 *  says how each one looks. Five buttons that differed by name, icon and brand
 *  colour were five copies of the same twenty-five lines. */
const AGENT_LOOK: Record<Agent, { name: string; Icon: typeof ClaudeIcon; color?: string }> = {
  "claude-code": { name: "Claude Code", Icon: ClaudeIcon, color: CLAUDE_ORANGE },
  codex: { name: "Codex", Icon: CodexIcon, color: CODEX_TEAL },
  copilot: { name: "Copilot", Icon: CopilotIcon, color: COPILOT_VIOLET },
  gemini: { name: "Gemini", Icon: GeminiIcon },
  opencode: { name: "OpenCode", Icon: OpenCodeIcon, color: OPENCODE_GREY },
}

// Below this panel width the labelled buttons collapse to icon-only.
const COMPACT_WIDTH = 560

export function TerminalPanel({ docked = false }: { docked?: boolean } = {}) {
  const sessions = useTerminals((s) => s.sessions)
  const activeId = useTerminals((s) => s.activeId)
  const groups = useTerminals((s) => s.groups)
  const activeGroupId = useTerminals((s) => s.activeGroupId)
  const add = useTerminals((s) => s.add)
  const split = useTerminals((s) => s.split)
  const remove = useTerminals((s) => s.remove)
  const removeGroup = useTerminals((s) => s.removeGroup)
  const setActive = useTerminals((s) => s.setActive)
  const setActiveGroup = useTerminals((s) => s.setActiveGroup)
  const setGroupDir = useTerminals((s) => s.setGroupDir)
  const setSizes = useTerminals((s) => s.setSizes)
  const toggle = useTerminals((s) => s.toggle)
  const root = useProject((s) => s.root)
  const active = useProject((s) => s.active)
  const height = useTerminals((s) => s.height)
  const setHeight = useTerminals((s) => s.setHeight)
  const width = useTerminals((s) => s.width)
  const setWidth = useTerminals((s) => s.setWidth)
  const togglePosition = useTerminals((s) => s.togglePosition)
  // Where the panel sits is the layout model's answer, not a second copy kept
  // here: dragging it to another dock has to change this too.
  const isRight = useLayout((s) => findPanel(s.layout, "terminal")?.area === "right")
  const openTaskCount = useComments(
    (s) => s.comments.filter((c) => c.kind === "task" && c.state === "open").length,
  )
  const { t } = useTranslation()

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null
  const titleOf = (paneId: string) => sessions.find((p) => p.id === paneId)?.title ?? "Terminal"

  // Collapse labelled buttons to icon-only when the panel is narrow.
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setCompact(el.clientWidth < COMPACT_WIDTH))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Probe which agent binaries are on PATH so the launch buttons can signal
  // (dimmed + a tooltip) which ones aren't installed. Mount-probe is enough;
  // launching a missing one still surfaces the existing not-installed notice.
  const [installed, setInstalled] = useState<Record<string, boolean>>({})
  useEffect(() => {
    let alive = true
    void Promise.all(AGENT_ORDER.map((a) => agentInstalled(AGENT_BIN[a])))
      .then((results) => {
        if (alive) setInstalled(Object.fromEntries(AGENT_ORDER.map((a, i) => [a, results[i]])))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const [reviewOpen, setReviewOpen] = useState(false)
  const [auditTarget, setAuditTarget] = useState<AuditTarget | null>(null)
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number; paneId: string } | null>(null)

  // Right-click a pane → terminal management menu (also suppresses the global
  // edit menu / native menu for this area).
  const openPaneMenu = (e: ReactMouseEvent, paneId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setActive(paneId)
    setPaneMenu({ x: e.clientX, y: e.clientY, paneId })
  }

  const paneMenuItems = (): ContextMenuItem[] => {
    if (!paneMenu) return []
    const group = groups.find((g) => g.paneIds.includes(paneMenu.paneId))
    const isMulti = (group?.paneIds.length ?? 0) > 1
    return [
      { label: t("terminal.new"), onSelect: () => add() },
      { label: t("terminal.split"), onSelect: () => split() },
      ...(isMulti && group
        ? [{ label: t("terminal.orientation"), onSelect: () => setGroupDir(group.id) }]
        : []),
      ...(isMulti
        ? [
            {
              label: t("terminal.closePane"),
              separatorBefore: true,
              onSelect: () => remove(paneMenu.paneId),
            },
          ]
        : []),
      {
        label: t("terminal.close"),
        separatorBefore: !isMulti,
        onSelect: () => group && removeGroup(group.id),
      },
      {
        label: isRight ? t("terminal.moveBottom") : t("terminal.moveRight"),
        separatorBefore: true,
        onSelect: togglePosition,
      },
    ]
  }
  const openAudit = () =>
    setAuditTarget(
      active ? { path: toRelative(root, active), isDir: false } : { path: ".", isDir: true },
    )

  // Resize the whole panel by dragging its inner edge. The pointer deltas are in
  // viewport (visual) pixels, but the panel width/height are layout pixels inside
  // the interface-zoom transform — so divide by the zoom to convert, otherwise the
  // panel resizes by the wrong amount at zoom ≠ 1.
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault()
    const zoom = useSettings.getState().zoom || 1
    const onMove = (ev: PointerEvent) =>
      isRight
        ? setWidth((window.innerWidth - ev.clientX) / zoom)
        : setHeight((window.innerHeight - ev.clientY) / zoom)
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  // Resize two adjacent panes by dragging the divider between pane k and k+1.
  const startPaneResize = (e: ReactPointerEvent, k: number) => {
    e.preventDefault()
    e.stopPropagation()
    const group = activeGroup
    const body = bodyRef.current
    if (!group || !body) return
    const horizontal = group.dir === "row"
    const rect = body.getBoundingClientRect()
    const axis = horizontal ? rect.width : rect.height
    const orig = [...group.sizes]
    const start = horizontal ? e.clientX : e.clientY
    const onMove = (ev: PointerEvent) => {
      const delta = ((horizontal ? ev.clientX : ev.clientY) - start) / Math.max(axis, 1)
      const a = orig[k] + delta
      const b = orig[k + 1] - delta
      const min = 0.1
      if (a < min || b < min) return
      const sizes = [...orig]
      sizes[k] = a
      sizes[k + 1] = b
      setSizes(group.id, sizes)
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  const paneIds = activeGroup?.paneIds ?? []
  const multi = paneIds.length > 1

  return (
    <div
      ref={rootRef}
      className={
        docked
          ? "relative flex min-h-0 min-w-0 flex-1 flex-col bg-canvas"
          : `relative flex flex-none flex-col bg-canvas ${
              isRight ? "h-full border-l border-line" : "border-t border-line"
            }`
      }
      style={docked ? undefined : isRight ? { width } : { height }}
    >
      {/* Resize handle straddling the inner border (self-sized mode only; docked,
          the dock owns the splitters). */}
      {!docked && (
        <div
          onPointerDown={startResize}
          className={
            isRight
              ? "absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-col-resize"
              : "absolute -top-1 right-0 left-0 z-10 h-2 cursor-row-resize"
          }
        />
      )}

      {/* Tab bar. */}
      <div className="flex h-9 flex-none items-center gap-1 border-b border-line pr-2 pl-1">
        <div
          role="tablist"
          className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {groups.map((g) => (
            <div
              key={g.id}
              className={`group flex items-center gap-2 rounded-md px-3 py-1 text-xs whitespace-nowrap transition-colors ${
                g.id === activeGroupId ? "bg-surface text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={g.id === activeGroupId}
                onClick={() => setActiveGroup(g.id)}
                className="flex items-center gap-2"
              >
                <span>{titleOf(g.paneIds[0])}</span>
                {g.paneIds.length > 1 && <Badge tone="neutral">{g.paneIds.length}</Badge>}
              </button>
              <button
                type="button"
                title={t("terminal.close")}
                aria-label={t("terminal.close")}
                onClick={(e) => {
                  e.stopPropagation()
                  removeGroup(g.id)
                }}
                className="grid h-4 w-4 place-items-center rounded-sm text-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-ink"
              >
                <CloseIcon className="block h-3 w-3" />
              </button>
            </div>
          ))}
          <IconButton
            label={t("terminal.new")}
            icon={<PlusIcon className="h-3.5 w-3.5" />}
            onClick={() => add()}
            size="sm"
            className="ml-1"
          />
        </div>

        {/* Send review (collapses to icon-only when narrow). */}
        <Button
          variant="primary"
          size="sm"
          onClick={() => setReviewOpen(true)}
          disabled={openTaskCount === 0}
          title={openTaskCount === 0 ? t("terminal.noTasks") : t("terminal.sendReview")}
        >
          <SendIcon className="h-3.5 w-3.5" />
          {!compact && t("terminal.sendReview")}
          {openTaskCount > 0 && <Badge tone="soft">{openTaskCount}</Badge>}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={openAudit}
          title={active ? t("tree.audit") : t("comments.auditProject")}
        >
          <SparkleIcon className="h-3.5 w-3.5" />
          {!compact && t("comments.audit")}
        </Button>

        {/* Layout cluster: split + orientation. */}
        <span className="mx-0.5 h-4 w-px flex-none bg-line" />
        <IconButton
          label={t("terminal.split")}
          icon={<SplitIcon className="h-3.5 w-3.5" />}
          onClick={() => split()}
          size="sm"
        />
        {multi && activeGroup && (
          <IconButton
            label={t("terminal.orientation")}
            icon={
              <SplitIcon
                className={`h-3.5 w-3.5 ${activeGroup.dir === "column" ? "rotate-90" : ""}`}
              />
            }
            onClick={() => setGroupDir(activeGroup.id)}
            size="sm"
          />
        )}

        {/* Agent launchers: icon-only, the only spot of brand colour. */}
        <span className="mx-0.5 h-4 w-px flex-none bg-line" />
        {AGENT_ORDER.map((id) => {
          const look = AGENT_LOOK[id]
          const missing = installed[id] === false
          return (
            <IconButton
              key={id}
              label={
                missing
                  ? t("agent.notInstalled", { name: look.name })
                  : t("terminal.launch", { name: look.name })
              }
              icon={<look.Icon className="h-4 w-4" />}
              onClick={() => void launchAgent(id, AGENT_BIN[id])}
              size="sm"
              className={missing ? "opacity-40" : ""}
              style={{ color: look.color }}
            />
          )
        })}
        <span className="mx-0.5 h-4 w-px flex-none bg-line" />
        {/* Position toggle only in self-sized mode; docked, the dock's move menu
            owns placement (bottom/right/stack). */}
        {!docked && (
          <IconButton
            label={isRight ? t("terminal.moveBottom") : t("terminal.moveRight")}
            icon={<LayoutIcon className={`h-3.5 w-3.5 ${isRight ? "rotate-90" : ""}`} />}
            onClick={togglePosition}
            size="sm"
          />
        )}
        <IconButton
          label={t("terminal.hide")}
          icon={<CloseIcon className="h-3.5 w-3.5" />}
          onClick={() => toggle(false)}
          size="sm"
        />
      </div>

      {/* Pane area. Every pane stays mounted; only the active group's panes are
          visible, tiled along the group's axis. CSS `order` interleaves dividers
          so nothing remounts (PTYs/scrollback persist). */}
      <div
        ref={bodyRef}
        className="flex min-h-0 flex-1 p-1"
        style={{ flexDirection: activeGroup?.dir ?? "row" }}
      >
        {sessions.map((s) => {
          const idx = paneIds.indexOf(s.id)
          if (idx === -1) {
            // A pane from another group: keep it mounted but out of layout.
            return (
              <div key={s.id} className="hidden">
                <Terminal id={s.id} cwd={root} active={false} />
              </div>
            )
          }
          return (
            <div
              key={s.id}
              onMouseDown={() => setActive(s.id)}
              onContextMenu={(e) => openPaneMenu(e, s.id)}
              className="group/pane relative min-h-0 min-w-0 overflow-hidden rounded-sm"
              style={{
                order: idx * 2,
                flexGrow: activeGroup?.sizes[idx] ?? 1,
                flexBasis: 0,
                boxShadow: multi && s.id === activeId ? "inset 0 0 0 1px var(--accent)" : undefined,
              }}
            >
              <Terminal id={s.id} cwd={root} active={s.id === activeId} />
              {multi && (
                <button
                  type="button"
                  aria-label={t("terminal.closePane")}
                  title={t("terminal.closePane")}
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(s.id)
                  }}
                  className="absolute top-1 right-1 z-10 grid h-5 w-5 place-items-center rounded-md bg-surface/80 text-faint opacity-0 transition-opacity group-hover/pane:opacity-100 group-focus-within/pane:opacity-100 focus-visible:opacity-100 hover:text-ink"
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        })}
        {/* Dividers between adjacent panes of the active group. */}
        {multi &&
          activeGroup &&
          paneIds
            .slice(0, -1)
            .map((_, k) => (
              <div
                key={`div-${activeGroup.id}-${k}`}
                onPointerDown={(e) => startPaneResize(e, k)}
                style={{ order: k * 2 + 1 }}
                className={`flex-none bg-line transition-colors hover:bg-line-strong ${
                  activeGroup.dir === "row" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
                }`}
              />
            ))}
      </div>

      {paneMenu && (
        <ContextMenu
          x={paneMenu.x}
          y={paneMenu.y}
          items={paneMenuItems()}
          onClose={() => setPaneMenu(null)}
        />
      )}

      <SendReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} />
      <AuditDialog target={auditTarget} onClose={() => setAuditTarget(null)} />
    </div>
  )
}
