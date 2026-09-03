/**
 * Integrated-terminal state.
 *
 * Two layers:
 *   - `sessions` — the flat list of panes, each backed by a live PTY in Rust.
 *     `activeId` is the *focused* pane (where input / agent launches go). Kept
 *     flat so the launch buttons, dialogs and git actions stay simple.
 *   - `groups` — the layout over those panes. A group is a tab; it tiles its
 *     panes along one axis (`dir`) with `sizes` weights. `activeGroupId` is the
 *     visible tab.
 *
 * PTYs outlive tab switches and layout changes: each pane's `<Terminal>` stays
 * mounted (hidden when not in the active group) so scrollback persists.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { ptyWrite } from "./api"
import { findPanel, useLayout } from "./layout"
import { createLogger } from "./logger"
import { useSettings } from "./store"

const log = createLogger("terminals")

/**
 * A clickable span found in one line of terminal output: either a web address
 * (opened in the browser) or a file path (opened in the editor).
 */
export interface TermLink {
  /** 0-based offset of the span in the line, and its length. */
  start: number
  length: number
  text: string
  /** Set for a web address; `path` is set instead for a file. */
  url?: string
  path?: string
  line?: number
}

// An address printed without a scheme, which `WebLinksAddon` (it only knows
// `scheme://…`) leaves behind: a dev server (`localhost:3000`, `127.0.0.1:8080`)
// or a bare domain. A host:port needs the port, so the word "localhost" in prose
// isn't a link; a domain needs a known TLD, so `Terminal.tsx` stays a file.
// ponytail: hand-picked TLDs, chosen not to collide with file extensions
// (no `.sh`, `.app`, `.ai`) — swap in a public-suffix list if it starts missing.
const HOST_RE =
  /\b(?:(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})|(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|dev|edu|gov|info|xyz|it)(?::\d{2,5})?)(?:\/[\w\-./~%&=?#+@:]*)?/gi

// An email address, and a URL that already carries its scheme — both matched
// only so the passes below skip them (`WebLinksAddon` owns scheme-ful URLs).
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g
const URL_RE = /\b[a-zA-Z][\w+.-]*:\/\/\S+/g

// A file path printed in output, with an optional :line:col or (line,col)
// suffix. Requires a real extension so we don't underline arbitrary words.
const PATH_RE = /(\/?[\w.\-~/@]*[\w-]+\.[A-Za-z][\w]*)(?::(\d+)(?::\d+)?|\((\d+),\d+\))?/g

/**
 * Find the clickable spans in one line of terminal output.
 *
 * Order matters, and each pass claims its span so the next leaves it alone:
 * `a@b.com` and `google.com` both parse as filenames with an extension, and an
 * email is neither a file nor a site — it is claimed but never linked, and so
 * is a `scheme://…` URL, which `WebLinksAddon` already owns.
 */
export function terminalLinks(text: string): TermLink[] {
  const links: TermLink[] = []
  const claimed: [number, number][] = []
  const taken = (i: number) => claimed.some(([from, to]) => i >= from && i < to)
  // `matchAll` over `exec`: these regexes live at module scope, so a loop that
  // walks `lastIndex` carries state from whatever line it last ran on.
  const claim = (m: RegExpExecArray) => claimed.push([m.index, m.index + m[0].length])

  for (const m of text.matchAll(URL_RE)) claim(m)
  for (const m of text.matchAll(EMAIL_RE)) claim(m)

  for (const m of text.matchAll(HOST_RE)) {
    if (taken(m.index)) continue
    claim(m)
    // A dev server is plain http; anything named by domain is https.
    const scheme = /^(?:localhost|\d)/.test(m[0]) ? "http" : "https"
    links.push({ start: m.index, length: m[0].length, text: m[0], url: `${scheme}://${m[0]}` })
  }

  for (const m of text.matchAll(PATH_RE)) {
    if (taken(m.index)) continue
    const line = m[2] ? +m[2] : m[3] ? +m[3] : undefined
    links.push({ start: m.index, length: m[0].length, text: m[0], path: m[1], line })
  }
  return links
}

/**
 * Quote a path for the shell (or an agent's prompt) so spaces survive.
 * POSIX quoting: on Windows `cmd` wants double quotes, but a space in a dropped
 * path is rare enough there that the extra platform branch isn't worth it.
 */
export const shellQuote = (p: string) =>
  /^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`

/**
 * Type `paths` into the terminal pane under a client point; false if none is
 * there. Handing a file to an agent running in a PTY means naming it, so both
 * drag sources end here — OS drops (Tauri) and drags from the file tree, which
 * are pointer events and never reach Tauri's drag-drop channel.
 */
export function dropPathsIntoTerminal(clientX: number, clientY: number, paths: string[]): boolean {
  const host = document
    .elementFromPoint(clientX, clientY)
    ?.closest<HTMLElement>("[data-terminal-id]")
  const id = host?.dataset.terminalId
  if (!id || !paths.length) return false
  void ptyWrite(id, `${paths.map(shellQuote).join(" ")} `)
  host?.querySelector<HTMLTextAreaElement>("textarea.xterm-helper-textarea")?.focus()
  return true
}

export interface TermSession {
  id: string
  title: string
}

export interface TermGroup {
  id: string
  /** Tiling axis: "row" = side-by-side, "column" = stacked. */
  dir: "row" | "column"
  /** Panes in this group, in display order. */
  paneIds: string[]
  /** Flex weights parallel to `paneIds` (sum ≈ 1). */
  sizes: number[]
}

// A per-window salt so PTY/group ids never collide across windows: each window
// runs its own module instance with `counter` starting at 0, so without the salt
// two windows opening a terminal in the same millisecond would mint the same id
// and then share one backend PTY (crossed output, double writes).
const WIN = (globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`).slice(0, 8)
let counter = 0
const newId = () => `t_${WIN}_${Date.now().toString(36)}_${counter++}`
const newGroupId = () => `g_${WIN}_${Date.now().toString(36)}_${counter++}`

/** Evenly weighted sizes for `n` panes. */
const even = (n: number): number[] => Array(n).fill(1 / n)

interface TerminalsState {
  sessions: TermSession[]
  /** The focused pane — input, launches and review/audit injection target it. */
  activeId: string | null
  groups: TermGroup[]
  activeGroupId: string | null
  /** Whether the bottom terminal panel is visible. */
  open: boolean
  /** Panel height in px when docked at the bottom (drag-resizable). */
  height: number
  setHeight: (px: number) => void
  /** Panel width in px when docked on the right (drag-resizable). */
  width: number
  setWidth: (px: number) => void
  /** Flip the panel between the bottom and right dock. Where it *is* lives in
   *  the layout model — this store no longer keeps a second copy of it. */
  togglePosition: () => void
  /** Create a new tab (group with one pane) and focus it. Returns the pane id. */
  add: () => string
  /** Add a pane to the active group (split), focus it. Returns the pane id. */
  split: () => string
  /** Remove a pane; removes its group when it was the last one. */
  remove: (id: string) => void
  /** Restart a pane in place: swap its id so its <Terminal> remounts (kills the
   *  old PTY, spawns a fresh shell) while keeping its slot in the layout. */
  restart: (id: string) => void
  /** Pane ids where Reado launched an AI agent (so prompts go to the agent, not a
   *  bare shell). */
  agentTerminals: string[]
  /** The last agent the user launched (the default for new prompts), persisted. */
  lastAgent: string | null
  /** Mark a pane as running `agent` and remember it as the last used. */
  markAgent: (id: string, agent: string) => void
  /** Remove a whole group (tab) and all its panes. */
  removeGroup: (groupId: string) => void
  /** Focus a pane (and select its group). */
  setActive: (id: string) => void
  /** Select a group (tab) and focus its first pane. */
  setActiveGroup: (groupId: string) => void
  /** Toggle/set a group's tiling axis. */
  setGroupDir: (groupId: string, dir?: "row" | "column") => void
  /** Set a group's pane size weights. */
  setSizes: (groupId: string, sizes: number[]) => void
  setTitle: (id: string, title: string) => void
  /** Toggle (or set) the panel; opening with no tabs creates the first one. */
  toggle: (open?: boolean) => void
}

export const useTerminals = create<TerminalsState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeId: null,
      groups: [],
      activeGroupId: null,
      agentTerminals: [],
      lastAgent: null,
      open: false,
      height: 280,
      // Clamp so the panel can't swallow the whole window or vanish. `px` is a layout
      // pixel; convert the viewport size by the interface zoom so the cap is right at
      // zoom ≠ 1.
      setHeight: (px) =>
        set({
          height: Math.max(
            120,
            Math.min(px, window.innerHeight / (useSettings.getState().zoom || 1) - 160),
          ),
        }),
      width: 480,
      setWidth: (px) =>
        set({
          width: Math.max(
            240,
            Math.min(px, window.innerWidth / (useSettings.getState().zoom || 1) - 360),
          ),
        }),
      togglePosition: () => {
        const layout = useLayout.getState()
        const at = findPanel(layout.layout, "terminal")?.area
        layout.move("terminal", at === "right" ? "bottom" : "right")
      },

      add: () => {
        const id = newId()
        const gid = newGroupId()
        log.info("terminal opened", { id })
        set((s) => ({
          sessions: [...s.sessions, { id, title: `Terminal ${s.sessions.length + 1}` }],
          groups: [...s.groups, { id: gid, dir: "row", paneIds: [id], sizes: [1] }],
          activeId: id,
          activeGroupId: gid,
          open: true,
        }))
        return id
      },

      split: () => {
        const gid = get().activeGroupId
        if (!gid) return get().add()
        const id = newId()
        set((s) => ({
          sessions: [...s.sessions, { id, title: `Terminal ${s.sessions.length + 1}` }],
          groups: s.groups.map((g) =>
            g.id === gid
              ? { ...g, paneIds: [...g.paneIds, id], sizes: even(g.paneIds.length + 1) }
              : g,
          ),
          activeId: id,
          open: true,
        }))
        return id
      },

      remove: (id) => {
        log.info("terminal closed", { id })
        return set((s) => {
          const sessions = s.sessions.filter((t) => t.id !== id)
          const groups = s.groups
            .map((g) => {
              if (!g.paneIds.includes(id)) return g
              const paneIds = g.paneIds.filter((p) => p !== id)
              return { ...g, paneIds, sizes: even(paneIds.length) }
            })
            .filter((g) => g.paneIds.length > 0)
          return {
            sessions,
            groups,
            agentTerminals: s.agentTerminals.filter((t) => t !== id),
            ...resolveActive(s, groups, new Set([id])),
          }
        })
      },

      restart: (id) =>
        set((s) => {
          if (!s.sessions.some((t) => t.id === id)) return s
          const nid = newId()
          return {
            sessions: s.sessions.map((t) => (t.id === id ? { ...t, id: nid } : t)),
            groups: s.groups.map((g) =>
              g.paneIds.includes(id)
                ? { ...g, paneIds: g.paneIds.map((p) => (p === id ? nid : p)) }
                : g,
            ),
            activeId: s.activeId === id ? nid : s.activeId,
            // The fresh shell has no agent.
            agentTerminals: s.agentTerminals.filter((t) => t !== id),
          }
        }),

      markAgent: (id, agent) =>
        set((s) => ({
          agentTerminals: s.agentTerminals.includes(id)
            ? s.agentTerminals
            : [...s.agentTerminals, id],
          lastAgent: agent,
        })),

      removeGroup: (groupId) =>
        set((s) => {
          const group = s.groups.find((g) => g.id === groupId)
          if (!group) return s
          const gone = new Set(group.paneIds)
          const sessions = s.sessions.filter((t) => !gone.has(t.id))
          const groups = s.groups.filter((g) => g.id !== groupId)
          return {
            sessions,
            groups,
            agentTerminals: s.agentTerminals.filter((t) => !gone.has(t)),
            ...resolveActive(s, groups, gone),
          }
        }),

      setActive: (id) =>
        set((s) => ({
          activeId: id,
          activeGroupId: s.groups.find((g) => g.paneIds.includes(id))?.id ?? s.activeGroupId,
        })),

      setActiveGroup: (groupId) =>
        set((s) => ({
          activeGroupId: groupId,
          activeId: s.groups.find((g) => g.id === groupId)?.paneIds[0] ?? s.activeId,
        })),

      setGroupDir: (groupId, dir) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId ? { ...g, dir: dir ?? (g.dir === "row" ? "column" : "row") } : g,
          ),
        })),

      setSizes: (groupId, sizes) =>
        set((s) => ({
          groups: s.groups.map((g) => (g.id === groupId ? { ...g, sizes } : g)),
        })),

      setTitle: (id, title) =>
        set((s) => ({
          sessions: s.sessions.map((t) => (t.id === id ? { ...t, title } : t)),
        })),

      toggle: (open) => {
        // Opening the terminal has to reveal the dock it lives in as well:
        // hiding the panel is a separate switch, and without this ⌘J (and the
        // menu item, and the status bar) is a dead key while the panel is
        // hidden — it flips `open` on a region nothing is drawing.
        if (open ?? !get().open) {
          const at = findPanel(useLayout.getState().layout, "terminal")
          if (at) useLayout.getState().toggleArea(at.area, false)
        }
        set((s) => {
          const next = open ?? !s.open
          if (next && s.groups.length === 0) {
            const id = newId()
            const gid = newGroupId()
            return {
              open: true,
              sessions: [{ id, title: "Terminal 1" }],
              groups: [{ id: gid, dir: "row", paneIds: [id], sizes: [1] }],
              activeId: id,
              activeGroupId: gid,
            }
          }
          return { open: next }
        })
      },
    }),
    {
      // Persist only the layout preferences — sessions/groups reference live PTYs
      // that don't survive a restart.
      name: "reado.terminal-layout",
      partialize: (s) => ({
        height: s.height,
        width: s.width,
        lastAgent: s.lastAgent,
      }),
      // v1 dropped `position`: the dock model owns where the terminal sits. A
      // user who had moved it to the right before the model existed would
      // otherwise find it back at the bottom, so carry the old value across once.
      version: 1,
      migrate: (persisted, from) => {
        const state = (persisted ?? {}) as { position?: "bottom" | "right" }
        if (from < 1 && state.position === "right") {
          useLayout.getState().move("terminal", "right")
        }
        const { position: _dropped, ...rest } = state
        return rest
      },
    },
  ),
)

/** After removing pane(s), recompute the focused pane / active group / open flag.
 *  `removed` is the set of pane ids that were actually removed, so focus is only
 *  relocated when the focused pane was genuinely one of them (not just because an
 *  unrelated group was closed while the focused pane survived). */
function resolveActive(
  prev: { activeId: string | null; activeGroupId: string | null; open: boolean },
  groups: TermGroup[],
  removed: Set<string>,
): { activeId: string | null; activeGroupId: string | null; open: boolean } {
  let activeGroupId = prev.activeGroupId
  let activeId = prev.activeId
  // Keep the active group if it survived; otherwise fall back to the last group.
  if (!activeGroupId || !groups.some((g) => g.id === activeGroupId)) {
    activeGroupId = groups[groups.length - 1]?.id ?? null
  }
  // Keep the focused pane if it survived and belongs to the active group;
  // otherwise focus the active group's last pane.
  const active = groups.find((g) => g.id === activeGroupId)
  if (!activeId || removed.has(activeId) || !active?.paneIds.includes(activeId)) {
    activeId = active?.paneIds[active.paneIds.length - 1] ?? null
  }
  return { activeId, activeGroupId, open: groups.length > 0 && prev.open }
}
