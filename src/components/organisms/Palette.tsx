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
import { useEffect, useMemo, useRef, useState } from "react";
import fuzzysort from "fuzzysort";
import {
  listFiles,
  searchText,
  listSymbols,
  type SearchMatch,
  type Symbol as WorkspaceSymbol,
} from "../../lib/api";
import {
  usePalette,
  useProject,
  useSettings,
  useEditorActions,
  useWorkspace,
  useRecents,
  THEMES,
} from "../../lib/store";
import { openProject } from "../../lib/window";
import { useTerminals } from "../../lib/terminals";
import { mod } from "../../lib/shortcuts";
import { checkForUpdates } from "../../lib/updater";
import {
  formatDocument,
  goToLine,
  goToBracket,
  gotoLastEdit,
  addCursorsToLineEnds,
  useDocInfo,
} from "../../lib/docInfo";
import { clearTerminal, restartTerminal } from "../../lib/agents";
import { extractSymbols, type OutlineSymbol } from "../../lib/outline";
import { lspDocumentSymbols } from "../../lib/lsp";
import { useReadProgress } from "../../lib/readProgress";
import { toRelative } from "../../lib/comments";
import { type MessageKey } from "../../i18n";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

interface Row {
  /** Primary line. */
  label: string;
  /** Secondary, dimmer line (path). */
  detail?: string;
  /** Optional keyboard-shortcut chip shown on the right. */
  hint?: string;
  run: () => void;
}

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function Palette() {
  const mode = usePalette((s) => s.mode);
  const close = usePalette((s) => s.close);
  const open = usePalette((s) => s.open);
  const toggleSettings = usePalette((s) => s.toggleSettings);
  const project = useProject();
  const settings = useSettings();
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [wsymbols, setWsymbols] = useState<WorkspaceSymbol[]>([]);
  const [fsymbols, setFsymbols] = useState<OutlineSymbol[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset transient state whenever the palette opens or changes mode.
  useEffect(() => {
    setQuery("");
    setSelected(0);
    setMatches([]);
    setSearchError(null);
    if (mode) inputRef.current?.focus();
  }, [mode]);

  // Load the file index lazily when entering file mode.
  useEffect(() => {
    if (mode === "files" && files.length === 0) {
      listFiles(project.root).then(setFiles).catch(() => setFiles([]));
    }
  }, [mode, project.root, files.length]);

  // Load the project symbol index lazily when entering workspace-symbol mode.
  useEffect(() => {
    if (mode === "wsymbols" && wsymbols.length === 0) {
      listSymbols(project.root).then(setWsymbols).catch(() => setWsymbols([]));
    }
  }, [mode, project.root, wsymbols.length]);

  // Load the active file's symbols when entering file-symbol mode: prefer the
  // language server's document symbols, fall back to the heuristic extractor.
  useEffect(() => {
    if (mode !== "symbols") return;
    const view = useDocInfo.getState().view;
    if (!view) {
      setFsymbols([]);
      return;
    }
    setFsymbols(extractSymbols(view.state.doc.toString()));
    let cancelled = false;
    const fromServer = lspDocumentSymbols(view);
    if (fromServer) {
      void fromServer.then((syms) => {
        if (!cancelled && syms && syms.length) setFsymbols(syms);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Debounced full-text search.
  useEffect(() => {
    if (mode !== "search" || query.trim().length < 2) {
      setMatches([]);
      return;
    }
    const id = setTimeout(() => {
      searchText(project.root, query)
        .then((m) => {
          setMatches(m);
          setSearchError(null);
        })
        .catch((e) => setSearchError(String(e)));
    }, 160);
    return () => clearTimeout(id);
  }, [mode, query, project.root]);

  /** The list of rows for the current mode and query. */
  const rows: Row[] = useMemo(() => {
    if (mode === "commands") {
      return commandRows(t, {
        project,
        settings,
        open,
        toggleSettings,
        requestCompose: () => {
          useEditorActions.getState().requestCompose();
          close();
        },
        requestExplain: () => {
          useEditorActions.getState().requestExplain();
          close();
        },
        requestPeek: () => {
          useEditorActions.getState().requestPeek();
          close();
        },
        openGraph: () => {
          useWorkspace.getState().toggleGraph(true);
          close();
        },
        openDocs: () => {
          useWorkspace.getState().toggleDocs(true);
          close();
        },
      }).filter((r) => r.label.toLowerCase().includes(query.toLowerCase()));
    }
    if (mode === "files") {
      const results = query
        ? fuzzysort.go(query, files, { limit: 200, key: (f: string) => basename(f) })
        : files.slice(0, 200).map((f) => ({ target: f, highlight: () => f }));
      return results.map((r) => {
        const path = "obj" in r ? (r.obj as string) : (r.target as string);
        return {
          label: basename(path),
          detail: relative(project.root, path),
          run: () => {
            // list_files returns project-relative paths; open expects absolute.
            project.open(`${project.root}/${path}`);
            close();
          },
        };
      });
    }
    if (mode === "search") {
      return matches.map((m) => ({
        label: m.text.trim() || basename(m.path),
        detail: `${relative(project.root, m.path)}:${m.line}`,
        run: () => {
          project.open(m.path, m.line);
          close();
        },
      }));
    }
    if (mode === "symbols") {
      const filtered = query
        ? fuzzysort.go(query, fsymbols, { limit: 300, key: (s) => s.name }).map((r) => r.obj)
        : fsymbols;
      return filtered.map((s) => ({
        label: s.name,
        detail: `${s.kind} · ${s.line}`,
        run: () => {
          goToLine(s.line);
          close();
        },
      }));
    }
    if (mode === "wsymbols") {
      const filtered = query
        ? fuzzysort.go(query, wsymbols, { limit: 300, key: (s) => s.name }).map((r) => r.obj)
        : wsymbols.slice(0, 300);
      return filtered.map((s) => ({
        label: s.name,
        detail: `${s.kind} · ${relative(project.root, s.path)}:${s.line}`,
        run: () => {
          project.open(s.path, s.line);
          close();
        },
      }));
    }
    if (mode === "recents") {
      const recents = useRecents.getState().projects;
      const filtered = query
        ? fuzzysort.go(query, recents, { limit: 100, key: (p) => p.path }).map((r) => r.obj)
        : recents;
      return filtered.map((p) => ({
        label: basename(p.path),
        detail: p.path,
        run: () => {
          openProject(p.path);
          close();
        },
      }));
    }
    return [];
  }, [mode, query, files, matches, wsymbols, fsymbols, project, settings, t, open, toggleSettings, close]);

  // Keep the selection in range as rows change.
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  if (!mode) return null;

  const placeholderKey: MessageKey =
    mode === "commands"
      ? "palette.placeholder"
      : mode === "files"
        ? "finder.placeholder"
        : mode === "symbols" || mode === "wsymbols"
          ? "symbols.placeholder"
          : mode === "recents"
            ? "recents.title"
            : "search.placeholder";

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      rows[selected]?.run();
    }
  };

  return (
    <div
      onMouseDown={close}
      className="animate-fade reado-scrim fixed inset-0 z-[100] flex items-start justify-center pt-[14vh]"
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-rise flex max-h-[60vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-lg border border-line-strong bg-overlay shadow-[var(--shadow)]"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t(placeholderKey)}
          spellCheck={false}
          className="w-full border-b border-line bg-transparent px-5 py-4 text-lg text-ink outline-none placeholder:text-faint"
        />
        {searchError ? (
          <div className="px-5 py-4 text-sm text-marker">
            {searchError.includes("ripgrep")
              ? t("search.ripgrepMissing")
              : searchError}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-4 text-sm text-faint">
            {mode === "search" && query.trim().length >= 2
              ? t("search.noResults")
              : null}
          </div>
        ) : (
          <ul role="listbox" className="m-0 list-none overflow-y-auto p-2">
            {rows.slice(0, 300).map((row, i) => (
              <li
                key={`${row.label}-${i}`}
                role="option"
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
                {row.hint && (
                  <kbd className="ml-auto flex-none rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-muted">
                    {row.hint}
                  </kbd>
                )}
              </li>
            ))}
          </ul>
        )}
        {mode === "search" && matches.length > 0 && (
          <div className="border-t border-line px-5 py-2 text-xs text-faint">
            {t("search.results", { count: matches.length })}
          </div>
        )}
      </div>
    </div>
  );
}

function relative(root: string, path: string): string {
  const rel = path.startsWith(root) ? path.slice(root.length) : path;
  return rel.replace(/^[\\/]+/, "").replace(/\\/g, "/");
}

interface CommandCtx {
  project: ReturnType<typeof useProject.getState>;
  settings: ReturnType<typeof useSettings.getState>;
  open: (mode: "commands" | "files" | "search" | "symbols" | "wsymbols") => void;
  toggleSettings: (open?: boolean) => void;
  requestCompose: () => void;
  requestExplain: () => void;
  requestPeek: () => void;
  openGraph: () => void;
  openDocs: () => void;
}

/** Static command list for Cmd+K. */
function commandRows(
  t: TFunction,
  {
    project,
    settings,
    open,
    toggleSettings,
    requestCompose,
    requestExplain,
    requestPeek,
    openGraph,
    openDocs,
  }: CommandCtx,
): Row[] {
  const rows: Row[] = [
    { label: t("comment.new"), hint: `${mod}⇧M`, run: requestCompose },
    { label: t("editor.explain"), run: requestExplain },
    { label: t("peek.def"), run: requestPeek },
    { label: t("editor.goToBracket"), run: goToBracket },
    { label: t("editor.lastEdit"), run: gotoLastEdit },
    { label: t("editor.cursorsLineEnds"), run: addCursorsToLineEnds },
    { label: t("editor.format"), hint: "⇧⌥F", run: () => void formatDocument() },
    { label: t("terminal.clear"), run: clearTerminal },
    { label: t("terminal.restart"), run: restartTerminal },
    { label: t("symbols.goto"), hint: `${mod}⇧O`, run: () => open("symbols") },
    { label: t("symbols.gotoWorkspace"), hint: `${mod}T`, run: () => open("wsymbols") },
    { label: t("graph.title"), run: openGraph },
    { label: t("kb.title"), run: openDocs },
    { label: t("finder.placeholder"), hint: `${mod}P`, run: () => open("files") },
    { label: t("search.placeholder"), hint: `${mod}⇧F`, run: () => open("search") },
    {
      label: `${t("editor.wrap")}: ${settings.wrap ? "on" : "off"}`,
      run: () => settings.set({ wrap: !settings.wrap }),
    },
    {
      label: `${t("editor.focus")}: ${settings.focusMode ? "on" : "off"}`,
      run: () => settings.set({ focusMode: !settings.focusMode }),
    },
    {
      label: `${t("editor.sticky")}: ${settings.stickyScroll ? "on" : "off"}`,
      run: () => settings.set({ stickyScroll: !settings.stickyScroll }),
    },
    {
      label: `${t("editor.measure")}: ${settings.readingWidth ? "on" : "off"}`,
      run: () => settings.set({ readingWidth: !settings.readingWidth }),
    },
    {
      label:
        project.active && useReadProgress.getState().read.has(toRelative(project.root, project.active))
          ? t("tree.markUnread")
          : t("tree.markRead"),
      run: () => {
        if (!project.active) return;
        const rel = toRelative(project.root, project.active);
        const isRead = useReadProgress.getState().read.has(rel);
        useReadProgress.getState().mark(project.root, rel, !isRead);
      },
    },
    {
      label: `${t("tree.showHidden")}: ${project.showHidden ? "on" : "off"}`,
      run: () => project.setShowHidden(!project.showHidden),
    },
    { label: t("nav.back"), hint: "⌥←", run: () => useProject.getState().goBack() },
    { label: t("nav.forward"), hint: "⌥→", run: () => useProject.getState().goForward() },
    {
      label: t("tabs.reopen"),
      hint: `${mod}⇧T`,
      run: () => useProject.getState().reopenClosed(),
    },
    {
      label: t("sidebar.toggle"),
      hint: `${mod}B`,
      run: () => useWorkspace.getState().toggleSidebar(),
    },
    { label: t("terminal.move"), run: () => useTerminals.getState().togglePosition() },
    {
      label: t("split.toggle"),
      hint: `${mod}\\`,
      run: () => {
        const p = useProject.getState();
        if (p.splitPath) p.closeSplit();
        else p.openSplit();
      },
    },
    { label: t("settings.title"), hint: `${mod},`, run: () => toggleSettings(true) },
    { label: t("sc.title"), run: () => usePalette.getState().toggleShortcuts(true) },
    { label: t("settings.checkUpdates"), run: () => checkForUpdates(true) },
  ];
  // Quick theme switches.
  for (const theme of THEMES) {
    rows.push({
      label: `${t("settings.theme")}: ${t(`theme.${theme}` as MessageKey)}`,
      run: () => settings.set({ theme, mode: "manual" }),
    });
  }
  return rows;
}
