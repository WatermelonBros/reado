/**
 * Unified quick-open palette.
 *
 * One overlay serves three modes, each on its own shortcut:
 *   - commands (Cmd/Ctrl+K) — run an action
 *   - files    (Cmd/Ctrl+P) — fuzzy-open a file
 *   - search   (Cmd/Ctrl+Shift+F) — full-text project search via ripgrep
 *
 * Keyboard-first: ↑/↓ move, Enter runs, Esc closes.
 */

import fuzzysort from "fuzzysort"
import type { TFunction } from "i18next"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/atoms/Input"
import { Kbd } from "@/components/atoms/Kbd"
import type { MessageKey } from "@/i18n"
import {
  listFiles,
  listSymbols,
  type SearchMatch,
  searchText,
  type Symbol as WorkspaceSymbol,
} from "@/lib/api"
import { useBookmarks } from "@/lib/bookmarks"
import { toRelative } from "@/lib/comments"
import { goToLine, toggleBookmarkAtCursor, useDocInfo } from "@/lib/docInfo"
import { useGuidedReview } from "@/lib/guidedReview"
import { shortcutFor } from "@/lib/keybindings"
import { lspDocumentSymbols } from "@/lib/lsp"
import { enableMcp } from "@/lib/mcp"
import { runMenuCommand } from "@/lib/menu"
import { useOnboarding } from "@/lib/onboarding"
import { extractSymbols, type OutlineSymbol } from "@/lib/outline"
import { usePreReview } from "@/lib/preReview"
import { usePreview } from "@/lib/preview"
import { saveSettingsToProject } from "@/lib/projectConfig"
import { prompt as promptDialog } from "@/lib/prompt"
import { useReadProgress } from "@/lib/readProgress"
import { useResolveLoop } from "@/lib/resolveLoop"
import { useSemanticSearch } from "@/lib/semanticSearch"
import {
  exportSettings,
  exportSettingsToFile,
  importSettings,
  importSettingsFromFile,
} from "@/lib/settingsSync"
import { THEMES, usePalette, useProject, useRecents, useSettings, useWorkspace } from "@/lib/store"
import { useTerminals } from "@/lib/terminals"
import { openProjectHere } from "@/lib/window"
import { acrossRoots, workspaceRoots } from "@/lib/workspace"

interface Row {
  /** Primary line. */
  label: string
  /** Secondary, dimmer line (path). */
  detail?: string
  /** Optional keyboard-shortcut chip shown on the right. */
  hint?: string
  /** Precondition: when `false` the command is hidden (its action would be a
   *  no-op or nonsensical in the current context — e.g. "comment on selection"
   *  with nothing selected). Undefined means always shown. */
  when?: boolean
  run: () => void
}

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p

/** The active editor's selected text, trimmed to a single line, or "". */
function selectionText(): string {
  const view = useDocInfo.getState().view
  if (!view) return ""
  const { from, to } = view.state.selection.main
  if (from === to) return ""
  return view.state.sliceDoc(from, to).split("\n")[0].trim()
}

export function Palette() {
  const mode = usePalette((s) => s.mode)
  const close = usePalette((s) => s.close)
  const open = usePalette((s) => s.open)
  const toggleSettings = usePalette((s) => s.toggleSettings)
  const project = useProject()
  const settings = useSettings()
  const { t } = useTranslation()

  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [wsymbols, setWsymbols] = useState<WorkspaceSymbol[]>([])
  const [fsymbols, setFsymbols] = useState<OutlineSymbol[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset transient state whenever the palette opens or changes mode.
  // Entering search with an active editor selection seeds it as the query.
  useEffect(() => {
    setQuery(mode === "search" ? selectionText() : "")
    setSelected(0)
    setMatches([])
    setSearchError(null)
    if (mode) {
      const el = inputRef.current
      el?.focus()
      el?.select()
    }
  }, [mode])

  // Load the file index lazily when entering file mode.
  useEffect(() => {
    if (mode === "files" && files.length === 0) {
      // Go to File spans the workspace: with two folders open, the file you
      // are looking for is as likely to be in the second as the first.
      acrossRoots(workspaceRoots(), listFiles)
        .then(setFiles)
        .catch(() => setFiles([]))
    }
  }, [mode, project.root, files.length])

  // Load the project symbol index lazily when entering workspace-symbol mode.
  useEffect(() => {
    if (mode === "wsymbols" && wsymbols.length === 0) {
      acrossRoots(workspaceRoots(), listSymbols)
        .then(setWsymbols)
        .catch(() => setWsymbols([]))
    }
  }, [mode, project.root, wsymbols.length])

  // Load the active file's symbols when entering file-symbol mode: prefer the
  // language server's document symbols, fall back to the heuristic extractor.
  useEffect(() => {
    if (mode !== "symbols") return
    const view = useDocInfo.getState().view
    if (!view) {
      setFsymbols([])
      return
    }
    setFsymbols(extractSymbols(view.state.doc.toString()))
    let cancelled = false
    const fromServer = lspDocumentSymbols(view)
    if (fromServer) {
      void fromServer.then((syms) => {
        if (!cancelled && syms && syms.length) setFsymbols(syms)
      })
    }
    return () => {
      cancelled = true
    }
  }, [mode])

  // Debounced full-text search.
  useEffect(() => {
    if (mode !== "search" || query.trim().length < 2) {
      setMatches([])
      return
    }
    const id = setTimeout(() => {
      searchText(project.root, query)
        .then((m) => {
          setMatches(m)
          setSearchError(null)
        })
        .catch((e) => setSearchError(String(e)))
    }, 160)
    return () => clearTimeout(id)
  }, [mode, query, project.root])

  /** The list of rows for the current mode and query. */
  const rows: Row[] = useMemo(() => {
    if (mode === "commands") {
      return commandRows(t, { project, settings, close }).filter((r) =>
        r.label.toLowerCase().includes(query.toLowerCase()),
      )
    }
    if (mode === "files") {
      const results = query
        ? fuzzysort.go(query, files, { limit: 200, key: (f: string) => basename(f) })
        : files.slice(0, 200).map((f) => ({ target: f, highlight: () => f }))
      return results.map((r) => {
        const path = "obj" in r ? (r.obj as string) : (r.target as string)
        return {
          label: basename(path),
          detail: relative(project.root, path),
          run: () => {
            // list_files returns project-relative paths; open expects absolute.
            project.open(`${project.root}/${path}`)
            close()
          },
        }
      })
    }
    if (mode === "search") {
      return matches.map((m) => ({
        label: m.text.trim() || basename(m.path),
        detail: `${relative(project.root, m.path)}:${m.line}`,
        run: () => {
          project.open(m.path, m.line)
          close()
        },
      }))
    }
    if (mode === "symbols") {
      const filtered = query
        ? fuzzysort.go(query, fsymbols, { limit: 300, key: (s) => s.name }).map((r) => r.obj)
        : fsymbols
      return filtered.map((s) => ({
        label: s.name,
        detail: `${s.kind} · ${s.line}`,
        run: () => {
          goToLine(s.line)
          close()
        },
      }))
    }
    if (mode === "wsymbols") {
      const filtered = query
        ? fuzzysort.go(query, wsymbols, { limit: 300, key: (s) => s.name }).map((r) => r.obj)
        : wsymbols.slice(0, 300)
      return filtered.map((s) => ({
        label: s.name,
        detail: `${s.kind} · ${relative(project.root, s.path)}:${s.line}`,
        run: () => {
          project.open(s.path, s.line)
          close()
        },
      }))
    }
    if (mode === "recents") {
      const recents = useRecents.getState().projects
      const filtered = query
        ? fuzzysort.go(query, recents, { limit: 100, key: (p) => p.path }).map((r) => r.obj)
        : recents
      return filtered.map((p) => ({
        label: basename(p.path),
        detail: p.path,
        run: () => {
          void openProjectHere(p.path)
          close()
        },
      }))
    }
    if (mode === "bookmarks") {
      const marks = useBookmarks.getState().bookmarks
      const filtered = query
        ? fuzzysort
            .go(query, marks, { limit: 200, key: (b) => `${b.path} ${b.snippet}` })
            .map((r) => r.obj)
        : marks
      return filtered.map((b) => ({
        label: b.snippet || `${b.path}:${b.line}`,
        detail: `${b.path}:${b.line}`,
        run: () => {
          useProject.getState().open(`${project.root}/${b.path}`, b.line)
          close()
        },
      }))
    }
    return []
  }, [
    mode,
    query,
    files,
    matches,
    wsymbols,
    fsymbols,
    project,
    settings,
    t,
    open,
    toggleSettings,
    close,
  ])

  // Keep the selection in range as rows change.
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, rows.length - 1)))
  }, [rows.length])

  if (!mode) return null

  const placeholderKey: MessageKey =
    mode === "commands"
      ? "palette.placeholder"
      : mode === "files"
        ? "finder.placeholder"
        : mode === "symbols" || mode === "wsymbols"
          ? "symbols.placeholder"
          : mode === "recents"
            ? "recents.title"
            : mode === "bookmarks"
              ? "bookmarks.panel"
              : "search.placeholder"

  // What to show when there are no rows: a per-mode empty state instead of a
  // blank box. `search`/`commands` only speak up once you've typed (an empty
  // query isn't "no results", it's "start typing"); the list modes always guide.
  const typed = query.trim().length >= (mode === "search" ? 2 : 1)
  const emptyMessage: string | null =
    mode === "search"
      ? typed
        ? t("search.noResults")
        : null
      : mode === "commands"
        ? typed
          ? t("palette.noResults")
          : null
        : mode === "files"
          ? t("finder.empty")
          : mode === "symbols" || mode === "wsymbols"
            ? t("symbols.empty")
            : mode === "recents"
              ? t("recents.empty")
              : mode === "bookmarks"
                ? t("bookmarks.empty")
                : null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      close()
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, rows.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      rows[selected]?.run()
    }
  }

  return (
    <div
      onMouseDown={close}
      // Quick input position: pinned near the top (the default — it stays put as
      // the result list grows or shrinks) or centred in the window.
      className={`animate-fade reado-scrim fixed inset-0 z-[100] flex justify-center ${
        settings.quickInputPosition === "center" ? "items-center" : "items-start pt-[14vh]"
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-rise flex max-h-[60vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-lg border border-line-strong bg-overlay shadow-[var(--shadow)]"
      >
        <Input
          variant="plain"
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t(placeholderKey)}
          spellCheck={false}
          className="rounded-none border-b border-line px-5 py-4 text-lg"
        />
        {searchError ? (
          <div className="px-5 py-4 text-sm text-marker">
            {searchError.includes("ripgrep") ? t("search.ripgrepMissing") : searchError}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-4 text-sm text-faint">{emptyMessage}</div>
        ) : (
          <div role="listbox" className="overflow-y-auto p-2">
            {rows.slice(0, 300).map((row, i) => (
              <div
                key={`${row.label}-${i}`}
                role="option"
                // Focus stays in the query input (this is an aria-activedescendant
                // listbox); the row is only programmatically focusable.
                tabIndex={-1}
                aria-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onClick={row.run}
                className={`flex min-w-0 cursor-pointer items-baseline gap-3 rounded-md px-3 py-2 ${
                  i === selected ? "bg-selection" : ""
                }`}
              >
                <span className="max-w-[60%] flex-none overflow-hidden text-ellipsis whitespace-nowrap text-base text-ink">
                  {row.label}
                </span>
                {row.detail && (
                  <span className="ml-auto overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-faint">
                    {row.detail}
                  </span>
                )}
                {row.hint && <Kbd className="ml-auto">{row.hint}</Kbd>}
              </div>
            ))}
          </div>
        )}
        {mode === "search" && matches.length > 0 && (
          <div className="border-t border-line px-5 py-2 text-xs text-faint">
            {t("search.results", { count: matches.length })}
          </div>
        )}
      </div>
    </div>
  )
}

function relative(root: string, path: string): string {
  const rel = path.startsWith(root) ? path.slice(root.length) : path
  return rel.replace(/^[\\/]+/, "").replace(/\\/g, "/")
}

interface CommandCtx {
  project: ReturnType<typeof useProject.getState>
  settings: ReturnType<typeof useSettings.getState>
  /** Dismiss the palette. Must be passed in: `commandRows` is module-level, so
   *  a bare `close()` here would silently resolve to the DOM global. */
  close: () => void
}

/** Static command list for Cmd+K. */
function commandRows(t: TFunction, { project, settings, close }: CommandCtx): Row[] {
  // Context flags: gate each command on its precondition so the palette only
  // lists what's actually applicable here (a "comment on selection" with nothing
  // selected, or "clear terminal" with no terminal, is just noise).
  const hasFile = !!project.active
  const view = useDocInfo.getState().view
  const hasSelection = !!view && !view.state.selection.main.empty
  const isRepo = project.git.isRepo
  const hasTerminal = useTerminals.getState().sessions.length > 0
  const canBack = project.navIndex > 0
  const canForward = project.navIndex < project.navStack.length - 1
  const hasClosed = project.closedTabs.length > 0
  const canSplit = hasFile || !!project.splitPath
  const hasBookmarks = useBookmarks.getState().bookmarks.length > 0
  /** Run a command and dismiss the palette — the shape most rows want. */
  const then = (fn: () => unknown) => () => {
    void fn()
    close()
  }

  /**
   * A row that runs a registered command.
   *
   * The palette used to carry its own copy of what each command does, and its
   * own idea of which key ran it — the fold rows still advertised `⌘⌥⇧[` long
   * after folding moved to `⌘K ⌘0`. Both now come from the one registry: the
   * chip is whatever is bound *now*, including a key the reader rebound.
   */
  const cmd = (id: string, label: string, o: { when?: boolean; stayOpen?: boolean } = {}): Row => ({
    label,
    hint: shortcutFor(id, settings.keybindings),
    when: o.when,
    // Most commands act and get out of the way; the ones that put something on
    // screen behind the palette, or that you may want to run twice, don't.
    run: o.stayOpen ? () => runMenuCommand(id) : then(() => runMenuCommand(id)),
  })

  const rows: Row[] = [
    cmd("comment:new", t("comment.new"), { when: hasSelection }),
    cmd("sel:explain", t("editor.explain"), { when: hasSelection }),
    cmd("sel:ask", t("qa.ask"), { when: hasSelection }),
    cmd("go:peek", t("peek.def"), { when: hasFile }),
    cmd("edit:quickFix", t("lsp.quickFix"), { when: hasFile }),
    cmd("edit:organizeImports", t("lsp.organizeImports"), { when: hasFile }),
    cmd("go:bracket", t("editor.goToBracket"), { when: hasFile, stayOpen: true }),
    cmd("go:lastEdit", t("editor.lastEdit"), { when: hasFile, stayOpen: true }),
    {
      label: t("onboarding.open"),
      run: () => {
        useOnboarding.getState().show()
        close()
      },
    },
    cmd("preview:toggle", t("preview.toggle")),
    {
      label: t("preview.agentAccess"),
      run: () => {
        const p = usePreview.getState()
        p.setAgentAccess(!p.agentAccess)
        close()
      },
    },
    {
      label: t("tours.open"),
      run: () => {
        useWorkspace.getState().selectTool("tours")
        close()
      },
    },
    {
      label: t("prereview.run"),
      when: isRepo,
      run: () => {
        usePreReview.getState().generate(project.root)
        useWorkspace.getState().selectTool("prereview")
        close()
      },
    },
    {
      label: t("guided.cmd.start"),
      when: isRepo,
      run: () => {
        void useGuidedReview.getState().start(project.root, { kind: "diff" }, "bug_risk")
        useWorkspace.getState().selectTool("guidedreview")
        close()
      },
    },
    {
      label: t("guided.cmd.open"),
      run: () => {
        useGuidedReview.getState().load(project.root)
        useWorkspace.getState().selectTool("guidedreview")
        close()
      },
    },
    {
      label: t("loop.cmd.start"),
      run: () => {
        void useResolveLoop.getState().start(project.root, [])
        useWorkspace.getState().selectTool("guidedreview")
        close()
      },
    },
    {
      label: t("mcp.enable"),
      run: () => {
        void enableMcp(project.root)
        close()
      },
    },
    {
      label: t("anywhere.open"),
      run: () => {
        usePalette.getState().toggleAnywhere(true)
        close()
      },
    },
    cmd("go:callHierarchy", t("hier.showCall"), { when: hasFile }),
    cmd("go:typeHierarchy", t("hier.showType"), { when: hasFile }),
    cmd("sel:lineEnds", t("editor.cursorsLineEnds"), { when: hasFile, stayOpen: true }),
    {
      label: t("bookmarks.toggle"),
      when: hasFile,
      run: () => {
        toggleBookmarkAtCursor()
        close()
      },
    },
    {
      label: t("bookmarks.goto"),
      when: hasBookmarks,
      run: () => usePalette.getState().open("bookmarks"),
    },
    {
      label: t("sync.export"),
      run: () => {
        void exportSettings()
        close()
      },
    },
    {
      label: t("sync.import"),
      run: () => {
        void importSettings()
        close()
      },
    },
    {
      label: t("sync.exportFile"),
      run: () => {
        void exportSettingsToFile()
        close()
      },
    },
    {
      label: t("sync.importFile"),
      run: () => {
        void importSettingsFromFile()
        close()
      },
    },
    {
      label: t("sync.saveToProject"),
      when: !!project.root,
      run: () => {
        void saveSettingsToProject(project.root)
        close()
      },
    },
    cmd("format", t("editor.format"), { when: hasFile, stayOpen: true }),
    // Editor commands run against the buffer and then get out of the way — the
    // palette is a launcher, not a panel, so each of these dismisses it.
    cmd("formatSelection", t("editor.formatSelection"), { when: hasSelection }),
    cmd("saveAll", t("editor.saveAll"), { when: hasFile }),
    // Text and line transforms. Each acts on the selection, or on the caret's
    // line when there is none, so they are useful without one.
    cmd("edit:upperCase", t("editor.upperCase"), { when: hasFile }),
    cmd("edit:lowerCase", t("editor.lowerCase"), { when: hasFile }),
    cmd("edit:titleCase", t("editor.titleCase"), { when: hasFile }),
    cmd("edit:sortAsc", t("editor.sortAsc"), { when: hasFile }),
    cmd("edit:sortDesc", t("editor.sortDesc"), { when: hasFile }),
    cmd("edit:dedupe", t("editor.deleteDuplicates"), { when: hasFile }),
    cmd("edit:joinLines", t("editor.joinLines"), { when: hasFile }),
    cmd("view:foldAll", t("editor.foldAll"), { when: hasFile }),
    cmd("view:unfoldAll", t("editor.unfoldAll"), { when: hasFile }),
    cmd("edit:trimWhitespace", t("editor.trimWhitespace"), { when: hasFile }),
    cmd("edit:reindent", t("editor.reindent"), { when: hasFile }),
    cmd("edit:convertSpaces", t("editor.convertToSpaces"), { when: hasFile }),
    cmd("edit:convertTabs", t("editor.convertToTabs"), { when: hasFile }),
    cmd("edit:cursorUndo", t("editor.cursorUndo"), { when: hasFile }),
    cmd("edit:cursorRedo", t("editor.cursorRedo"), { when: hasFile }),
    cmd("compareSaved", t("diff.compareWithSaved"), { when: hasFile }),
    cmd("terminal:clear", t("terminal.clear"), { when: hasTerminal, stayOpen: true }),
    cmd("terminal:restart", t("terminal.restart"), { when: hasTerminal, stayOpen: true }),
    // These four hand the palette to another mode rather than dismissing it.
    cmd("palette:symbols", t("symbols.goto"), { when: hasFile, stayOpen: true }),
    cmd("palette:wsymbols", t("symbols.gotoWorkspace"), { stayOpen: true }),
    cmd("palette:files", t("finder.placeholder"), { stayOpen: true }),
    cmd("palette:search", t("search.placeholder"), { stayOpen: true }),
    cmd("graph", t("graph.title")),
    cmd("docs", t("kb.title")),
    {
      label: t("semantic.search"),
      run: () => {
        close()
        void promptDialog({
          title: t("semantic.title"),
          placeholder: t("semantic.placeholder"),
        }).then((q) => q && useSemanticSearch.getState().run(q))
      },
    },
    cmd("view:wrap", `${t("editor.wrap")}: ${settings.wrap ? "on" : "off"}`, { stayOpen: true }),
    cmd("view:focus", `${t("editor.focus")}: ${settings.focusMode ? "on" : "off"}`, {
      stayOpen: true,
    }),
    {
      label: `${t("editor.sticky")}: ${settings.stickyScroll ? "on" : "off"}`,
      run: () => settings.set({ stickyScroll: !settings.stickyScroll }),
    },
    cmd("view:ribbon", `${t("editor.ribbon")}: ${settings.showRibbon ? "on" : "off"}`, {
      stayOpen: true,
    }),
    cmd(
      "read:toggle",
      project.active &&
        useReadProgress.getState().read.has(toRelative(project.root, project.active))
        ? t("tree.markUnread")
        : t("tree.markRead"),
      { when: hasFile, stayOpen: true },
    ),
    {
      label: `${t("tree.showHidden")}: ${project.showHidden ? "on" : "off"}`,
      run: () => project.setShowHidden(!project.showHidden),
    },
    cmd("go:back", t("nav.back"), { when: canBack, stayOpen: true }),
    cmd("go:forward", t("nav.forward"), { when: canForward, stayOpen: true }),
    cmd("reopenClosed", t("tabs.reopen"), { when: hasClosed, stayOpen: true }),
    cmd("view:sidebar", t("sidebar.toggle"), { stayOpen: true }),
    {
      label: t("terminal.move"),
      when: hasTerminal,
      run: () => useTerminals.getState().togglePosition(),
    },
    cmd("view:splitToggle", t("split.toggle"), { when: canSplit, stayOpen: true }),
    cmd("workspace:addFolder", t("workspace.addFolder")),
    cmd("settings", t("settings.title"), { stayOpen: true }),
    // Opens the settings dialog *on* its JSON view, not merely next to it.
    cmd("settings:json", t("settings.json"), { stayOpen: true }),
    cmd("help:shortcuts", t("sc.title"), { stayOpen: true }),
    cmd("checkUpdates", t("settings.checkUpdates"), { stayOpen: true }),
  ]
  // Quick theme switches.
  for (const theme of THEMES) {
    rows.push({
      label: `${t("settings.theme")}: ${t(`theme.${theme}` as MessageKey)}`,
      run: () => settings.set({ theme, mode: "manual" }),
    })
  }
  // Drop commands whose precondition isn't met, so the palette lists only what's
  // actually applicable in the current context.
  return rows.filter((r) => r.when !== false)
}
