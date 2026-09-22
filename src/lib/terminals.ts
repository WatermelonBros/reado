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
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
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
  /** The profile this pane runs, when it was opened from one. Kept so a restart
   *  re-runs the same thing rather than dropping to the login shell. */
  profile?: string
  /** Where the shell starts. Absent means the project root — a terminal opened
   *  on a folder from the file tree carries that folder instead. */
  cwd?: string
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

/**
 * The name a new pane gets: the profile's, or `Terminal N`.
 *
 * Either way the number is the lowest unused one. Counting the open panes handed
 * out a duplicate as soon as one was closed (close #1 of two → the next pane is
 * a second "Terminal 2"); renamed tabs simply don't take part.
 */
const nextTitle = (sessions: TermSession[], profile?: string): string => {
  const base = profile?.trim() || "Terminal"
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: (\\d+))?$`)
  const used = new Set(
    sessions
      .map((s) => {
        const m = re.exec(s.title)
        return m ? Number(m[1] ?? 1) : 0
      })
      .filter(Boolean),
  )
  let n = 1
  while (used.has(n)) n++
  // The first of a profile carries no number: "Node REPL", then "Node REPL 2".
  return profile ? (n === 1 ? base : `${base} ${n}`) : `Terminal ${n}`
}

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
  /** Create a new tab (group with one pane) and focus it, optionally running a
   *  named profile. Returns the pane id. */
  add: (cwd?: string, profile?: string) => string
  /** Add a pane to the active group (split), focus it. Returns the pane id. */
  split: () => string
  /** Remove a pane; removes its group when it was the last one. */
  remove: (id: string) => void
  /** Restart a pane in place: swap its id so its <Terminal> remounts (kills the
   *  old PTY, spawns a fresh shell) while keeping its slot in the layout. */
  restart: (id: string) => void
  /** Pane ids known to be running an AI agent (so prompts go to the agent, not a
   *  bare shell). Reado's own record of what it launched, corrected against the
   *  tty by `terminalAgent` — the user launches and quits agents too. */
  agentTerminals: string[]
  /** The last agent the user launched (the default for new prompts), persisted. */
  lastAgent: string | null
  /** Mark a pane as running `agent` and remember it as the last used. */
  markAgent: (id: string, agent: string) => void
  /** Forget that a pane runs an agent — it quit, and what is there now is a
   *  shell that would *execute* a prompt written into it. */
  unmarkAgent: (id: string) => void
  /** Reorder tabs: drop the group `id` before (or `after`) `targetId`. */
  moveGroup: (id: string, targetId: string, after?: boolean) => void
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

      add: (cwd, profile) => {
        const id = newId()
        const gid = newGroupId()
        log.info("terminal opened", { id, profile })
        set((s) => ({
          sessions: [...s.sessions, { id, title: nextTitle(s.sessions, profile), cwd, profile }],
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
          sessions: [...s.sessions, { id, title: nextTitle(s.sessions) }],
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

      unmarkAgent: (id) =>
        set((s) =>
          s.agentTerminals.includes(id)
            ? { agentTerminals: s.agentTerminals.filter((t) => t !== id) }
            : s,
        ),

      moveGroup: (id, targetId, after = false) =>
        set((s) => {
          const from = s.groups.findIndex((g) => g.id === id)
          if (from < 0 || id === targetId || !s.groups.some((g) => g.id === targetId)) return s
          const groups = [...s.groups]
          const [moved] = groups.splice(from, 1)
          groups.splice(groups.findIndex((g) => g.id === targetId) + (after ? 1 : 0), 0, moved)
          return { groups }
        }),

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
              sessions: [{ id, title: nextTitle(s.sessions) }],
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

/** The raw bytes of one `pty-output-*` payload, or null when it is not a frame
 *  at all (a test's fake event, a future framing). */
function frameBytes(payload: unknown): Uint8Array | null {
  const raw = typeof payload === "string" ? payload : String(payload)
  try {
    return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * Decode one `pty-output-*` payload into text.
 *
 * The backend base64-frames PTY output so escape sequences and non-UTF-8 bytes
 * survive the JSON event boundary. Anything reading that stream for meaning has
 * to undo that first; reading the frame as if it were the text matches nothing,
 * and matches nothing *silently*, which is how a matcher can look wired up and
 * never fire.
 *
 * One frame at a time. A reader following a whole stream wants
 * [`listenPtyLines`], whose decoder carries state across frames.
 */
export function decodePtyOutput(payload: unknown): string {
  const bytes = frameBytes(payload)
  return bytes ? new TextDecoder().decode(bytes) : String(payload)
}

/**
 * Strip the ANSI a program writes when it thinks it has a terminal — and it
 * does, because Reado gives it a real one.
 *
 * Three families, and the first one is why this exists: a shell sets the window
 * title with an **OSC** sequence (`ESC ] 2 ; … BEL`) and writes it *in front of*
 * the first line the command prints. Every reader here anchors its pattern at
 * the start of the line — the problem matchers, the test verdicts — so that
 * invisible prefix is the difference between a build's first error being
 * clickable and being missed. **CSI** covers colour and the private modes
 * (`ESC [ ? 2004 l`) a prompt toggles, whose `?` is part of the sequence.
 */
export const plainText = (line: string): string =>
  line
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes are control characters by definition.
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes are control characters by definition.
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: a backspace is a control character by definition.
    .replace(/.\u0008/g, "")
    .replace(/\r/g, "")

/**
 * Cut a PTY chunk into the lines a reader should see, and keep what isn't a line
 * yet.
 *
 * The backend reads the PTY in 8 KB blocks, so a chunk boundary lands mid-line
 * routinely in any long run. A consumer that splits each chunk on its own sees
 * the two halves of a verdict line and matches neither — silently, leaving a
 * test that passed showing as still running. The partial tail is carried across
 * chunks here, in the one place that knows the framing, so no reader has to.
 */
export function framePtyLines(tail: string, text: string): { lines: string[]; tail: string } {
  const parts = (tail + text).split("\n")
  // The last piece has no newline after it yet: it is the start of the next
  // line, not a line.
  const rest = parts.pop() ?? ""
  // A bare carriage return is a *redraw*, not a separator to delete: cargo draws
  // its progress bar, returns to column 0 and writes the first error over it, all
  // inside one newline-terminated line. Splitting there is the difference between
  // a reader seeing `error[E0308]: …` at the start of a line and seeing it glued
  // behind `Building [===]`, where every anchored pattern misses it.
  return { lines: parts.flatMap((l) => l.split("\r")).filter((l) => l !== ""), tail: rest }
}

/**
 * Unsubscribe without the rejection escaping.
 *
 * Tauri's `unlisten` rejects when its listener map has already been torn down —
 * which is the normal case here, because the thing being unsubscribed from is a
 * PTY that just died. Two call sites guarded it by hand and five did not, so the
 * same `listeners[eventId].handlerId` unhandled rejection kept surfacing from
 * terminals, comments and search alike. One helper, so a new caller inherits the
 * guard instead of rediscovering it.
 */
export function offSafe(off: UnlistenFn | Promise<UnlistenFn> | null | undefined): void {
  if (!off) return
  void Promise.resolve(off)
    .then((fn) => fn())
    .catch(() => {})
}

/** Subscribe to a pane's output as complete lines — `framePtyLines` per chunk. */
export async function listenPtyLines(
  id: string,
  onLine: (line: string) => void,
): Promise<UnlistenFn> {
  let tail = ""
  // Per subscription, and streaming: the decoder holds the first bytes of a
  // multi-byte character split across two reads, which a fresh decoder per
  // frame would turn into U+FFFD. Sharing one across panes would interleave
  // that state, so it belongs here rather than at module scope.
  const decoder = new TextDecoder()
  return listen<string>(`pty-output-${id}`, (e) => {
    const bytes = frameBytes(e.payload)
    const text = bytes ? decoder.decode(bytes, { stream: true }) : String(e.payload)
    const framed = framePtyLines(tail, text)
    tail = framed.tail
    for (const line of framed.lines) onLine(line)
  })
}
