/**
 * A single terminal tab: an xterm.js view bound to a backend PTY.
 *
 * Stays mounted (hidden when inactive) so the PTY connection and scrollback
 * survive tab switches. Streams output from `pty-output-{id}` and forwards
 * keystrokes and resizes back to the PTY.
 *
 * Output is navigable: `path:line:col` tokens are clickable (open the file in
 * the editor) and URLs open in the browser. Cmd+F searches the scrollback.
 *
 * Files get *in* the same way they get out: dropping files on the terminal, or
 * pasting an image, types their paths at the cursor — an agent running in the
 * PTY can only be handed a file by name.
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import {
  readText as clipboardReadText,
  writeText as clipboardWriteText,
} from "@tauri-apps/plugin-clipboard-manager"
import { openUrl } from "@tauri-apps/plugin-opener"
import { FitAddon } from "@xterm/addon-fit"
import { SearchAddon } from "@xterm/addon-search"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { type IDisposable, type ILink, Terminal as XTerm } from "@xterm/xterm"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/atoms/Input"
import { ChevronIcon, CloseIcon, SearchIcon } from "@/components/atoms/icons"
import {
  anywherePublishAgent,
  clipboardImageToTemp,
  ptyKill,
  ptyResize,
  ptySpawn,
  ptyWrite,
  resolvePath,
} from "@/lib/api"
import { notify, notifyError } from "@/lib/notice"
import { useProject, useSettings } from "@/lib/store"
import { shellQuote, terminalLinks, useTerminals } from "@/lib/terminals"
import { xtermFontFamily, xtermLinkColor, xtermTheme } from "@/lib/xtermTheme"

const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/** Terminal font size at 100% interface zoom (multiplied by the zoom factor). */
const BASE_FONT_SIZE = 13

interface Props {
  id: string
  cwd: string
  active: boolean
}

/** The mirrored tail, per terminal. Bounded: a phone wants the last screenful of
 *  an agent working, not an unbounded transcript. */
const MIRROR_CHARS = 8000
const mirrorTail = new Map<string, string>()
let mirrorPending: ReturnType<typeof setTimeout> | null = null

/** Append to the mirror and publish, coalesced — an agent emits output in bursts
 *  and a publish per chunk would be a command per byte. */
function mirrorToPhone(id: string, bytes: Uint8Array) {
  // The mirror carries text, not the raw stream: the phone renders it into its
  // own terminal, which does its own decoding.
  const next = (mirrorTail.get(id) ?? "") + new TextDecoder().decode(bytes)
  mirrorTail.set(id, next.length > MIRROR_CHARS ? next.slice(-MIRROR_CHARS) : next)
  if (mirrorPending) return
  mirrorPending = setTimeout(() => {
    mirrorPending = null
    void anywherePublishAgent(id, mirrorTail.get(id) ?? "").catch(() => {})
  }, 400)
}

export function Terminal({ id, cwd, active }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const { t } = useTranslation()
  // null = search box hidden; a string = open with that query.
  const [query, setQuery] = useState<string | null>(null)
  const lastSize = useRef({ rows: 0, cols: 0 })

  const syncSize = useCallback(() => {
    const fit = fitRef.current
    const term = termRef.current
    const host = hostRef.current
    if (!fit || !term || !host || host.clientWidth === 0) return
    try {
      fit.fit()
    } catch {
      return
    }
    const { rows, cols } = term
    if (rows === lastSize.current.rows && cols === lastSize.current.cols) return
    lastSize.current = { rows, cols }
    ptyResize(id, rows, cols).catch(() => {})
  }, [id])

  // Create the terminal and PTY once.
  useEffect(() => {
    if (!hostRef.current) return
    const term = new XTerm({
      theme: xtermTheme(),
      fontFamily: useSettings.getState().codeFont || xtermFontFamily(),
      // The interface zoom is applied to the terminal via the font size (and the
      // host is counter-scaled below), not the ancestor CSS transform — so xterm's
      // mouse→cell mapping stays correct and selection/copy land on the right cell.
      fontSize: BASE_FONT_SIZE * (useSettings.getState().zoom || 1),
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    // URLs in output open in the browser via the OS, not an in-app webview.
    term.loadAddon(new WebLinksAddon((_e, uri) => void openUrl(uri)))
    term.open(hostRef.current)
    termRef.current = term
    fitRef.current = fit
    searchRef.current = search

    // Resolving the link colour walks the DOM, and links are repainted as often
    // as the output changes — so resolve it once, alongside the theme.
    let linkColor = xtermLinkColor()

    // xtermTheme() resolves tokens to concrete colours once, so re-apply them
    // (and the code font) whenever the active theme changes on <html>.
    const themeObserver = new MutationObserver(() => {
      term.options.theme = xtermTheme()
      term.options.fontFamily = useSettings.getState().codeFont || xtermFontFamily()
      linkColor = xtermLinkColor()
      paintedKey = "" // the layout is unchanged; force the recolour through
      paintLinks()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    })

    // Make `path:line:col` tokens open the file in the editor, and scheme-less
    // addresses open in the browser.
    term.registerLinkProvider({
      provideLinks(y, cb) {
        const buf = term.buffer.active.getLine(y - 1)
        if (!buf) return cb(undefined)
        const links: ILink[] = terminalLinks(buf.translateToString(true)).map((l) => ({
          text: l.text,
          range: { start: { x: l.start + 1, y }, end: { x: l.start + l.length, y } },
          activate: () => {
            if (l.url) return void openUrl(l.url)
            const root = useProject.getState().root
            const path = l.path!
            // `search`: agents print `Terminal.tsx:104`, not the path from the
            // project root, so the plain root-join misses almost every time.
            resolvePath(root, path, true)
              .then((abs) =>
                abs
                  ? useProject.getState().open(abs, l.line)
                  : notify("info", t("terminal.noFile", { path })),
              )
              .catch((e) => notifyError("terminal", t("terminal.noFile", { path }), e))
          },
        }))
        cb(links.length ? links : undefined)
      },
    })

    // Colour every link in the viewport, not just the hovered one: xterm
    // underlines on hover and does nothing otherwise, so output gives no hint
    // that it can be clicked. A decoration recolours the cells it covers, which
    // is the only way to restyle text the terminal has already drawn.
    // ponytail: viewport only, redrawn whenever the link layout changes — the
    // scrollback isn't decorated until it scrolls back into view.
    const painted: IDisposable[] = []
    let paintedKey = ""
    const paintLinks = () => {
      const buf = term.buffer.active
      const found: { offset: number; x: number; width: number }[] = []
      let key = ""
      for (let row = 0; row < term.rows; row++) {
        const abs = buf.viewportY + row
        const line = buf.getLine(abs)
        if (!line) continue
        for (const l of terminalLinks(line.translateToString(true))) {
          found.push({ offset: abs - (buf.baseY + buf.cursorY), x: l.start, width: l.length })
          key += `${abs}:${l.start}:${l.text}|`
        }
      }
      // Registering a decoration schedules another render, which lands straight
      // back here: bail unless the links themselves moved or changed.
      if (key === paintedKey) return
      paintedKey = key
      for (const d of painted) d.dispose()
      painted.length = 0
      for (const { offset, x, width } of found) {
        const marker = term.registerMarker(offset)
        if (!marker) continue
        painted.push(marker)
        // `bottom` so a selection still paints over the link.
        const d = term.registerDecoration({
          marker,
          x,
          width,
          foregroundColor: linkColor,
          layer: "bottom",
        })
        if (d) painted.push(d)
      }
    }
    term.onRender(paintLinks)

    const unlisten: UnlistenFn[] = []
    let disposed = false

    requestAnimationFrame(async () => {
      if (disposed) return
      try {
        fit.fit()
      } catch {
        /* container not measured yet */
      }
      lastSize.current = { rows: term.rows, cols: term.cols }
      try {
        await ptySpawn(id, cwd, term.rows, term.cols)
      } catch {
        // No backend session was created (bad $SHELL, invalid cwd, openpty
        // failure…). Surface it instead of leaving a silent dead pane, and don't
        // wire input/listeners to a PTY that isn't there.
        term.write("\r\n\x1b[31m[failed to start terminal]\x1b[0m\r\n")
        return
      }
      if (disposed) return

      unlisten.push(
        await listen<string>(`pty-output-${id}`, (e) => {
          const text = decode(e.payload)
          term.write(text)
          // Mirror an agent pane to any paired phone. Best-effort and rate-limited
          // by the tail buffer below: Anywhere may be off, and a phone watching an
          // agent work wants the recent output, not every byte re-sent.
          if (useTerminals.getState().agentTerminals.includes(id)) mirrorToPhone(id, text)
        }),
      )
      unlisten.push(
        await listen(`pty-exit-${id}`, () => term.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n")),
      )
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true
        const key = e.key.toLowerCase()
        // Copy: Cmd+C (mac), Ctrl+Shift+C, or Ctrl+C while text is selected
        // (Windows/Linux). Bare Ctrl+C with no selection stays SIGINT.
        if (
          key === "c" &&
          (e.metaKey || (e.ctrlKey && e.shiftKey) || (e.ctrlKey && term.hasSelection()))
        ) {
          const sel = term.getSelection()
          if (sel) {
            e.preventDefault()
            void clipboardWriteText(sel).catch(() => {})
            return false
          }
        }
        // Paste: Cmd+V (mac) or Ctrl+Shift+V (Windows/Linux). term.paste keeps
        // bracketed-paste mode intact so TUIs receive it as a paste, not typing.
        if (key === "v" && (e.metaKey || (e.ctrlKey && e.shiftKey))) {
          e.preventDefault()
          // Native clipboard read (not navigator.clipboard) so Windows WebView2
          // doesn't prompt for clipboard permission on every paste.
          void clipboardReadText()
            .catch(() => "")
            .then(async (text) => {
              if (text) return term.paste(text)
              // No text: an image on the clipboard becomes a temp PNG whose path
              // is typed instead — a PTY can't carry the bytes.
              const file = await clipboardImageToTemp()
              if (file) term.paste(`${shellQuote(file)} `)
            })
            .catch((err) => notifyError("terminal", t("terminal.pasteImageFailed"), err))
          return false
        }
        // Cmd+F (or Ctrl+Shift+F) opens search — Ctrl+F alone stays readline's.
        if (e.key.toLowerCase() === "f" && (e.metaKey || (e.ctrlKey && e.shiftKey))) {
          e.preventDefault()
          setQuery((q) => (q === null ? "" : q))
          return false
        }
        // Shift+Enter inserts a newline instead of submitting: ESC+CR is the
        // sequence TUI agents (Claude/Codex) and readline read as "newline".
        // preventDefault is essential: returning false stops xterm processing
        // but not the browser default, so without it the hidden textarea also
        // emits a plain Enter (\r) and the agent submits anyway.
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault()
          void ptyWrite(id, "\x1b\r")
          return false
        }
        return true
      })
      term.onData((data) => ptyWrite(id, data))

      document.fonts?.ready.then(() => !disposed && syncSize())
    })

    return () => {
      disposed = true
      themeObserver.disconnect()
      // A rejecting unlisten (listener map already torn down) must not escape.
      unlisten.forEach((off) => void Promise.resolve(off()).catch(() => {}))
      ptyKill(id).catch(() => {})
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let raf = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(syncSize)
    })
    observer.observe(host)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [syncSize])

  // Files dropped on the terminal are typed as quoted paths at the cursor — the
  // way you hand a file to an agent running in the PTY. OS drops arrive through
  // Tauri (HTML5 drop events never fire with the OS handler on) with a
  // physical-pixel position, so hit-test it against this pane: every terminal
  // stays mounted, and only the one under the cursor should take the drop.
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop" || !event.payload.paths.length) return
      const host = hostRef.current
      const term = termRef.current
      if (!host || !term) return
      const dpr = window.devicePixelRatio || 1
      const { x, y } = event.payload.position
      const el = document.elementFromPoint(x / dpr, y / dpr)
      if (!el || !host.contains(el)) return
      // `paste` (not ptyWrite) so bracketed-paste mode is honoured and a TUI
      // agent reads it as a paste rather than as fast typing.
      term.paste(`${event.payload.paths.map(shellQuote).join(" ")} `)
      term.focus()
    })
    return () => {
      // Terminals unmount on pane close; swallow a rejecting unlisten so it
      // doesn't surface as an unhandled rejection.
      void un.then((f) => f()).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const term = termRef.current
    if (!term) return
    requestAnimationFrame(() => {
      syncSize()
      term.focus()
    })
  }, [active, syncSize])

  // Re-apply the code font when the setting changes at runtime (matches Editor).
  const codeFont = useSettings((s) => s.codeFont)
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontFamily = codeFont || xtermFontFamily()
    requestAnimationFrame(syncSize)
  }, [codeFont, syncSize])

  // Interface zoom drives the terminal font size (not a CSS transform), and the
  // host is counter-scaled in the JSX so the terminal has no net scale — keeping
  // xterm's coordinate mapping (selection, links) correct at any zoom. Re-fit so
  // the cols/rows track the new cell size.
  const zoom = useSettings((s) => s.zoom) || 1
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = BASE_FONT_SIZE * zoom
    requestAnimationFrame(syncSize)
  }, [zoom, syncSize])

  const find = (q: string, back = false) => {
    if (!q) return
    if (back) searchRef.current?.findPrevious(q)
    else searchRef.current?.findNext(q)
  }
  const closeSearch = () => {
    setQuery(null)
    searchRef.current?.clearDecorations?.()
    termRef.current?.focus()
  }

  return (
    <div className="relative h-full w-full">
      {query !== null && (
        <div className="absolute top-2 right-3 z-30 flex items-center gap-1 rounded-md border border-line-strong bg-overlay px-1.5 py-1 shadow-[var(--shadow)]">
          <SearchIcon className="h-3.5 w-3.5 flex-none text-faint" />
          <Input
            variant="plain"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              find(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") find(query, e.shiftKey)
              if (e.key === "Escape") closeSearch()
            }}
            placeholder={t("terminal.search")}
            className="w-44 px-0 py-0"
          />
          <button
            type="button"
            onClick={() => find(query, true)}
            title={t("terminal.searchPrev")}
            className="grid h-5 w-5 flex-none place-items-center rounded text-muted hover:bg-surface hover:text-ink"
          >
            <ChevronIcon className="h-3.5 w-3.5 -rotate-90" />
          </button>
          <button
            type="button"
            onClick={() => find(query)}
            title={t("terminal.searchNext")}
            className="grid h-5 w-5 flex-none place-items-center rounded text-muted hover:bg-surface hover:text-ink"
          >
            <ChevronIcon className="h-3.5 w-3.5 rotate-90" />
          </button>
          <button
            type="button"
            onClick={closeSearch}
            title={t("common.cancel")}
            className="grid h-5 w-5 flex-none place-items-center rounded text-muted hover:bg-surface hover:text-ink"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {/* Counter-scale the terminal so it carries NO net interface-zoom transform.
          The ancestor scales everything by `zoom`; we scale the host by `1/zoom`
          (net 1) and size it at `zoom×` so it still fills the panel. xterm then
          maps mouse coordinates in an untransformed space — selection, copy and
          clickable links land on the right cell — while the font size (set above)
          keeps it visually in step with the zoomed UI. At zoom 1 this is a no-op. */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `scale(${1 / zoom})`,
          width: `${zoom * 100}%`,
          height: `${zoom * 100}%`,
        }}
      >
        <div ref={hostRef} data-terminal-id={id} className="h-full w-full" />
      </div>
    </div>
  )
}
