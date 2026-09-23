/**
 * Unified quick-open palette.
 *
 * One overlay serves three modes, each on its own shortcut:
 *   - commands (Cmd/Ctrl+K) — run an action
 *   - files    (Cmd/Ctrl+P) — fuzzy-open a file
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
import { listFiles, listSymbols, type Symbol as WorkspaceSymbol } from "@/lib/api"
import { useBookmarks } from "@/lib/bookmarks"
import { baseName, toRelative } from "@/lib/comments"
import { goToLine, useDocInfo } from "@/lib/docInfo"
import { shortcutFor } from "@/lib/keybindings"
import { lspDocumentSymbols, lspWorkspaceSymbols } from "@/lib/lsp"
import { runMenuCommand } from "@/lib/menu"
import { extractSymbols, type OutlineSymbol } from "@/lib/outline"
import { useProfiles } from "@/lib/profiles"
import { useReadProgress } from "@/lib/readProgress"
import { THEMES, usePalette, useProject, useRecents, useSettings } from "@/lib/store"
import { commandLine, runTask, useTasks } from "@/lib/tasks"
import { useTerminals } from "@/lib/terminals"
import { useTesting } from "@/lib/testing"
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
  const [wsymbols, setWsymbols] = useState<WorkspaceSymbol[]>([])
  const [fsymbols, setFsymbols] = useState<OutlineSymbol[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset transient state whenever the palette opens or changes mode.
  useEffect(() => {
    setQuery("")
    setSelected(0)
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

  // …and ask the language servers the same question. They know what the index
  // cannot see — generated symbols, symbols from dependencies — and they answer
  // per query rather than once. The index's results are already on screen, so a
  // slow server costs nothing; a stale answer is dropped.
  const [lspSymbols, setLspSymbols] = useState<WorkspaceSymbol[]>([])
  useEffect(() => {
    if (mode !== "wsymbols") {
      setLspSymbols([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void lspWorkspaceSymbols(query)
        .then((syms) => !cancelled && setLspSymbols(syms))
        .catch(() => {})
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, query])

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

  /** The list of rows for the current mode and query. */
  const rows: Row[] = useMemo(() => {
    if (mode === "commands") {
      return commandRows(t, { project, settings, close }).filter((r) =>
        r.label.toLowerCase().includes(query.toLowerCase()),
      )
    }
    if (mode === "files") {
      const results = query
        ? fuzzysort.go(query, files, { limit: 200, key: (f: string) => baseName(f) })
        : files.slice(0, 200).map((f) => ({ target: f, highlight: () => f }))
      return results.map((r) => {
        const path = "obj" in r ? (r.obj as string) : (r.target as string)
        return {
          label: baseName(path),
          detail: toRelative(project.root, path),
          run: () => {
            // list_files returns project-relative paths; open expects absolute.
            project.open(`${project.root}/${path}`)
            close()
          },
        }
      })
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
      // The index first (it ranks, and it is what the user has been looking at),
      // then anything the servers know that it doesn't. Same name, file and line
      // is the same symbol.
      const seen = new Set(wsymbols.map((s) => `${s.name}\u0000${s.path}\u0000${s.line}`))
      const all = [
        ...wsymbols,
        ...lspSymbols.filter((s) => !seen.has(`${s.name}\u0000${s.path}\u0000${s.line}`)),
      ]
      const filtered = query
        ? fuzzysort.go(query, all, { limit: 300, key: (s) => s.name }).map((r) => r.obj)
        : all.slice(0, 300)
      return filtered.map((s) => ({
        label: s.name,
        detail: `${s.kind} · ${toRelative(project.root, s.path)}:${s.line}`,
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
        label: baseName(p.path),
        detail: p.path,
        run: () => {
          void openProjectHere(p.path)
          close()
        },
      }))
    }
    if (mode === "tasks") {
      return useTasks.getState().tasks.map((task) => ({
        label: task.label,
        // Detected tasks say where they came from: a row nobody wrote is worth
        // distinguishing from one the project committed to.
        detail: task.detected
          ? `${commandLine(task)} · ${t("tasks.detected", { provider: task.detected })}`
          : commandLine(task),
        run: () => {
          void runTask(task)
          close()
        },
      }))
    }
    if (mode === "profiles") {
      return useProfiles.getState().profiles.map((p) => ({
        label: p.name,
        detail: p.id === useProfiles.getState().activeId ? t("profile.status") : undefined,
        run: () => {
          useProfiles.getState().switchTo(p.id)
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
  }, [mode, query, files, wsymbols, fsymbols, project, settings, t, open, toggleSettings, close])

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
              : mode === "profiles"
                ? "profile.switch"
                : mode === "tasks"
                  ? "tasks.run"
                  : "palette.placeholder"

  // What to show when there are no rows: a per-mode empty state instead of a
  // blank box. `commands` only speaks up once you've typed (an empty query isn't
  // "no results", it's "start typing"); the list modes always guide.
  const typed = query.trim().length >= 1
  const emptyMessage: string | null =
    mode === "commands"
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
        {rows.length === 0 ? (
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
      </div>
    </div>
  )
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
  const hasTests = useTesting.getState().files.length > 0
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
    cmd("onboarding:open", t("onboarding.open")),
    cmd("preview:toggle", t("preview.toggle")),
    cmd("preview:agentAccess", t("preview.agentAccess")),
    cmd("tours:open", t("tours.open")),
    cmd("tests:runAll", t("tests.runAll"), { when: hasTests }),
    cmd("git:graph", t("gitGraph.title"), { when: isRepo }),
    cmd("prereview:run", t("prereview.run"), { when: isRepo }),
    cmd("guided:start", t("guided.cmd.start"), { when: isRepo }),
    cmd("guided:open", t("guided.cmd.open")),
    cmd("loop:start", t("loop.cmd.start")),
    cmd("mcp:enable", t("mcp.enable")),
    cmd("anywhere:open", t("anywhere.open")),
    cmd("go:callHierarchy", t("hier.showCall"), { when: hasFile }),
    cmd("go:typeHierarchy", t("hier.showType"), { when: hasFile }),
    cmd("sel:lineEnds", t("editor.cursorsLineEnds"), { when: hasFile, stayOpen: true }),
    cmd("bookmarks:toggle", t("bookmarks.toggle"), { when: hasFile }),
    cmd("bookmarks:goto", t("bookmarks.goto"), { when: hasBookmarks, stayOpen: true }),
    cmd("tasks:run", t("tasks.run")),
    cmd("tasks:build", t("tasks.runBuild")),
    cmd("profile:create", t("profile.create")),
    // Only worth offering once there is somewhere to switch to.
    cmd("profile:switch", t("profile.switch"), {
      when: useProfiles.getState().profiles.length > 1,
      stayOpen: true,
    }),
    cmd("profile:rename", t("profile.rename")),
    cmd("profile:delete", t("profile.delete")),
    cmd("profile:export", t("profile.export")),
    cmd("profile:import", t("profile.import")),
    cmd("sync:export", t("sync.export")),
    cmd("sync:import", t("sync.import")),
    cmd("sync:exportFile", t("sync.exportFile")),
    cmd("sync:importFile", t("sync.importFile")),
    cmd("sync:saveToProject", t("sync.saveToProject"), { when: !!project.root }),
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
    cmd("view:output", t("output.panel")),
    cmd("view:problems", t("problems.panel")),
    cmd("terminal:runSelection", t("terminal.runSelection"), { when: hasFile }),
    cmd("terminal:clear", t("terminal.clear"), { when: hasTerminal, stayOpen: true }),
    cmd("terminal:restart", t("terminal.restart"), { when: hasTerminal, stayOpen: true }),
    // These three hand the palette to another mode rather than dismissing it.
    cmd("palette:symbols", t("symbols.goto"), { when: hasFile, stayOpen: true }),
    cmd("palette:wsymbols", t("symbols.gotoWorkspace"), { stayOpen: true }),
    cmd("palette:files", t("finder.placeholder"), { stayOpen: true }),
    // Search opens the Search panel — find *and* replace in one place — so the
    // palette gets out of the way like every other command that leaves it.
    cmd("palette:search", t("search.placeholder")),
    cmd("graph", t("graph.title")),
    cmd("docs", t("kb.title")),
    // Dismisses the palette itself, before its own dialog opens.
    cmd("semantic:search", t("semantic.search"), { stayOpen: true }),
    cmd("view:wrap", `${t("editor.wrap")}: ${settings.wrap ? "on" : "off"}`, { stayOpen: true }),
    cmd(
      "view:columnSelection",
      `${t("editor.columnSelection")}: ${settings.columnSelection ? "on" : "off"}`,
      { stayOpen: true },
    ),
    cmd("view:focus", `${t("editor.focus")}: ${settings.focusMode ? "on" : "off"}`, {
      stayOpen: true,
    }),
    cmd("view:stickyScroll", `${t("editor.sticky")}: ${settings.stickyScroll ? "on" : "off"}`, {
      stayOpen: true,
    }),
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
    cmd("view:showHidden", `${t("tree.showHidden")}: ${project.showHidden ? "on" : "off"}`, {
      stayOpen: true,
    }),
    cmd("go:back", t("nav.back"), { when: canBack, stayOpen: true }),
    cmd("go:forward", t("nav.forward"), { when: canForward, stayOpen: true }),
    cmd("reopenClosed", t("tabs.reopen"), { when: hasClosed, stayOpen: true }),
    cmd("view:sidebar", t("sidebar.toggle"), { stayOpen: true }),
    cmd("terminal:togglePosition", t("terminal.move"), { when: hasTerminal, stayOpen: true }),
    cmd("view:splitToggle", t("split.toggle"), { when: canSplit, stayOpen: true }),
    cmd("workspace:addFolder", t("workspace.addFolder")),
    cmd("workspace:open", t("workspace.openFile")),
    cmd("workspace:saveAs", t("workspace.saveAs")),
    cmd("settings", t("settings.title"), { stayOpen: true }),
    // Opens the settings dialog *on* its JSON view, not merely next to it.
    cmd("settings:json", t("settings.json"), { stayOpen: true }),
    cmd("help:shortcuts", t("sc.title"), { stayOpen: true }),
    cmd("checkUpdates", t("settings.checkUpdates"), { stayOpen: true }),
  ]
  // Quick theme switches.
  for (const theme of THEMES) {
    rows.push(
      cmd(`theme:${theme}`, `${t("settings.theme")}: ${t(`theme.${theme}` as MessageKey)}`, {
        stayOpen: true,
      }),
    )
  }
  // Drop commands whose precondition isn't met, so the palette lists only what's
  // actually applicable in the current context.
  return rows.filter((r) => r.when !== false)
}
