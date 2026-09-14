/**
 * The Search side panel: full-text project search via ripgrep, with results
 * grouped by file. Selecting a result navigates the editor to that line.
 */
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { ContextMenu, type ContextMenuItem } from "@/components/atoms/ContextMenu"
import { IconButton } from "@/components/atoms/IconButton"
import { Input } from "@/components/atoms/Input"
import { CloseIcon, MoreIcon } from "@/components/atoms/icons"
import { Textarea } from "@/components/atoms/Textarea"
import { SearchResultsEditor } from "@/components/organisms/SearchResultsEditor"
import {
  replaceInFile,
  replaceText,
  type SearchMatch,
  type SearchOpts,
  searchText,
} from "@/lib/api"
import { toRelative } from "@/lib/comments"
import { useFileUndo } from "@/lib/fileUndo"
import { mod } from "@/lib/shortcuts"
import { useProject, useWorkspace } from "@/lib/store"
import { acrossRoots, rootFor, workspaceRoots } from "@/lib/workspace"

/** Enter searches live; Shift+Enter inserts a newline (multi-line snippets). */
const multilineKeys = (e: React.KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) e.preventDefault()
}
/** Grow the box with its content, 1–6 rows. */
const rowsFor = (text: string) => Math.min(6, Math.max(1, text.split("\n").length))

// Cap the rows we actually mount. A broad query can hit the backend's 2000-match
// cap → ~4000 DOM nodes, janking every keystroke. Render the first N (like the
// command palette) and offer a "refine your search" hint when truncated. Full
// virtualization is a separate follow-up.
const RENDER_CAP = 300

export function SearchPanel() {
  const root = useProject((s) => s.root)
  // Walking a result list is browsing, so each one lands in the preview tab the
  // next one replaces, instead of leaving twenty tabs behind.
  const open = useProject((s) => s.openPreview)
  const pendingSearch = useWorkspace((s) => s.pendingSearch)
  const clearPendingSearch = useWorkspace((s) => s.clearPendingSearch)
  // "Find in Folder": everything below (search, replace, the counts) is limited
  // to this folder while it is set.
  const scope = useWorkspace((s) => s.searchScope)
  const setScope = useWorkspace((s) => s.setSearchScope)
  const { t } = useTranslation()

  // Restore the last query so leaving and returning to the Search tool doesn't
  // lose it (the debounced effect below re-runs the search from the seed).
  const [query, setQuery] = useState(() => useWorkspace.getState().searchQuery)

  // Persist the query so it survives a tool-switch / reopen.
  useEffect(() => {
    useWorkspace.getState().setSearchQuery(query)
  }, [query])

  const queryRef = useRef<HTMLTextAreaElement>(null)
  // Seed the query when something requests a search (⌘⇧F, Find references, Find in
  // Folder) and put the caret in the field — the request *is* "I want to type here".
  // An empty request keeps the last query and selects it, the way every editor's
  // find does, so reopening the panel doesn't throw the query away.
  useEffect(() => {
    if (pendingSearch === null) return
    if (pendingSearch) setQuery(pendingSearch)
    clearPendingSearch()
    queryRef.current?.focus()
    queryRef.current?.select()
  }, [pendingSearch, clearPendingSearch])
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [replacement, setReplacement] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  // Search toggles (VS Code-style): case sensitive, whole word, regex.
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regex, setRegex] = useState(false)
  // "Files to include" / "files to exclude", remembered like the query itself.
  const include = useWorkspace((s) => s.searchInclude)
  const exclude = useWorkspace((s) => s.searchExclude)
  const setGlobs = useWorkspace((s) => s.setSearchGlobs)
  const [showGlobs, setShowGlobs] = useState(() => !!include || !!exclude)
  const opts = useMemo<SearchOpts>(
    () => ({ caseSensitive, wholeWord, regex, scope, include, exclude }),
    [caseSensitive, wholeWord, regex, scope, include, exclude],
  )

  // Results the user has waved away for this query. A key, not an index, so
  // dismissing one doesn't shift the rest.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; match: SearchMatch } | null>(null)
  // The editable view of the whole result list.
  const [editingResults, setEditingResults] = useState(false)
  const matchKey = (m: SearchMatch) => `${m.path}:${m.line}`

  // Walking the history with ↑/↓ from the query field. -1 is "what I typed".
  const history = useWorkspace((s) => s.searchHistory)
  const pushHistory = useWorkspace((s) => s.pushSearchHistory)
  const historyPos = useRef(-1)
  const onQueryKeys = (e: React.KeyboardEvent) => {
    multilineKeys(e)
    // Only from a single-line query: in a multi-line snippet ↑/↓ are movement.
    if (query.includes("\n") || history.length === 0) return
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
    e.preventDefault()
    const next = e.key === "ArrowUp" ? historyPos.current + 1 : historyPos.current - 1
    historyPos.current = Math.max(-1, Math.min(history.length - 1, next))
    setQuery(historyPos.current === -1 ? "" : history[historyPos.current])
  }

  /** Re-run the current search — after a rewrite the old result list is a lie. */
  // Search covers every folder in the workspace: "search the project" has to
  // mean the project you have open, not the first folder of it.
  const runSearch = () => acrossRoots(workspaceRoots(), (r) => searchText(r, query, opts))
  const refresh = async () => setMatches(await runSearch())

  // Project-wide replace, behind a confirm step and recorded as one undoable
  // action: it rewrites files, and ⌘Z has to be able to take it back. It runs
  // with `opts` — the same toggles and globs the results above were found with,
  // so Replace All can only ever rewrite the list you are looking at.
  const doReplace = async () => {
    setConfirming(false)
    try {
      // Scoped results, scoped rewrite: replacing project-wide while showing one
      // folder's matches would be a trap.
      // One call per workspace folder: search spans them, so the rewrite has to.
      const results = await Promise.all(
        workspaceRoots().map((r) => replaceText(r, query, replacement, opts)),
      )
      const res = {
        changed: results.reduce((n, r) => n + r.changed, 0),
        backups: results.flatMap((r) => r.backups),
      }
      if (res.backups.length > 0) useFileUndo.getState().record({ kind: "replace", ...res })
      setStatus(t("search.replaceUndo", { count: res.changed, key: `${mod}Z` }))
      await refresh()
    } catch (e) {
      setStatus(String(e))
    }
  }

  /**
   * Replace one match, or every match in one file.
   *
   * The position is what identifies a match, not an index: two occurrences on
   * one line are different matches, and the row you right-clicked is the one you
   * meant. Recorded on the same undo stack as the project-wide replace.
   */
  const replaceSome = async (m: SearchMatch, wholeFile: boolean) => {
    try {
      const res = await replaceInFile(
        // The folder that owns the match, not the window's first one.
        rootFor(m.path),
        m.path,
        query,
        replacement,
        opts,
        wholeFile ? [] : [[m.line, m.column]],
      )
      if (res.backups.length > 0) useFileUndo.getState().record({ kind: "replace", ...res })
      setStatus(
        wholeFile
          ? t("search.replaceUndo", { count: res.changed, key: `${mod}Z` })
          : t("search.replacedOne"),
      )
      await refresh()
    } catch (e) {
      setStatus(String(e))
    }
  }

  // Debounced search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([])
      setError(null)
      setSearching(false)
      return
    }
    setDismissed(new Set())
    const id = setTimeout(() => {
      // A slow ripgrep on a big repo shouldn't read as "no results / frozen":
      // flag the pending state so the panel can say it's searching.
      setSearching(true)
      runSearch()
        .then((m) => {
          setMatches(m)
          setError(null)
          pushHistory(query)
        })
        .catch((e) => setError(String(e)))
        .finally(() => setSearching(false))
    }, 180)
    return () => clearTimeout(id)
  }, [query, root, opts, pushHistory])

  const shown = matches.filter((m) => !dismissed.has(matchKey(m)))
  const dismiss = (keys: string[]) => setDismissed((prev) => new Set([...prev, ...keys]))
  const menuItems: ContextMenuItem[] = menu
    ? [
        // Replace is only offered with something to replace *with*; an empty
        // replacement field would silently delete the match.
        ...(replacement
          ? [
              {
                label: t("search.replaceThis"),
                onSelect: () => void replaceSome(menu.match, false),
              },
              {
                label: t("search.replaceFile"),
                separatorBefore: false,
                onSelect: () => void replaceSome(menu.match, true),
              },
            ]
          : []),
        {
          label: t("search.copyMatch"),
          separatorBefore: !!replacement,
          onSelect: () => void clipboardWriteText(menu.match.text.trim()).catch(() => {}),
        },
        {
          label: t("search.copyPath"),
          onSelect: () =>
            void clipboardWriteText(
              `${toRelative(rootFor(menu.match.path), menu.match.path)}:${menu.match.line}`,
            ).catch(() => {}),
        },
        {
          label: t("search.dismiss"),
          separatorBefore: true,
          onSelect: () => dismiss([matchKey(menu.match)]),
        },
        {
          label: t("search.dismissFile"),
          onSelect: () => dismiss(matches.filter((m) => m.path === menu.match.path).map(matchKey)),
        },
      ]
    : []

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-col gap-1.5 border-b border-line p-2">
        {scope && (
          <div className="flex items-center gap-1 text-xs text-muted">
            <span className="shrink-0">{t("search.inFolder")}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-ink" title={scope}>
              {scope}
            </span>
            <IconButton
              size="xxs"
              label={t("search.clearScope")}
              onClick={() => setScope(null)}
              icon={<CloseIcon className="h-3 w-3" />}
            />
          </div>
        )}
        {/* The case / whole-word / regex toggles sit inside the input, right edge. */}
        <div className="relative">
          <Textarea
            mono
            ref={queryRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setStatus(null)
              setConfirming(false)
            }}
            onKeyDown={onQueryKeys}
            rows={rowsFor(query)}
            placeholder={t("search.placeholder")}
            spellCheck={false}
            className="resize-none bg-canvas py-1.5 pr-[74px] pl-2 placeholder:font-sans"
          />
          <div className="absolute top-1 right-1 flex items-center gap-0.5">
            <FlagButton
              active={caseSensitive}
              onClick={() => setCaseSensitive((v) => !v)}
              label="Aa"
              title={t("search.caseSensitive")}
            />
            <FlagButton
              active={wholeWord}
              onClick={() => setWholeWord((v) => !v)}
              label="ab"
              title={t("search.wholeWord")}
            />
            <FlagButton
              active={regex}
              onClick={() => setRegex((v) => !v)}
              label=".*"
              title={t("search.regex")}
            />
            <IconButton
              size="sm"
              active={showGlobs}
              label={t("search.globs")}
              icon={<MoreIcon className="h-3.5 w-3.5" />}
              onClick={() => setShowGlobs((v) => !v)}
              className={`border ${
                showGlobs || include || exclude
                  ? "border-accent bg-[color-mix(in_oklch,var(--accent)_18%,transparent)]"
                  : "border-line"
              }`}
            />
          </div>
        </div>
        {showGlobs && (
          <div className="flex flex-col gap-1">
            <Input
              value={include}
              onChange={(e) => setGlobs({ include: e.target.value })}
              placeholder={t("search.include")}
              spellCheck={false}
              className="bg-canvas font-mono text-xs placeholder:font-sans"
            />
            <Input
              value={exclude}
              onChange={(e) => setGlobs({ exclude: e.target.value })}
              placeholder={t("search.exclude")}
              spellCheck={false}
              className="bg-canvas font-mono text-xs placeholder:font-sans"
            />
            <span className="text-[10px] leading-relaxed text-faint">{t("search.globsHint")}</span>
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <Textarea
            mono
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={multilineKeys}
            rows={rowsFor(replacement)}
            placeholder={t("search.replacePlaceholder")}
            spellCheck={false}
            className="min-w-0 flex-1 resize-none bg-canvas placeholder:font-sans"
          />
          {confirming ? (
            <button
              type="button"
              onClick={doReplace}
              title={t("search.replaceConfirm")}
              className="flex-none rounded-md bg-marker px-2 py-1.5 text-xs font-semibold text-on-accent hover:brightness-110"
            >
              {t("search.replaceConfirm")}
            </button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={matches.length === 0}
              title={t("search.replaceAll")}
            >
              {t("search.replaceAll")}
            </Button>
          )}
        </div>
        {/* The careful alternative to Replace All: every hit as text, edited by
            hand, with the ones that shouldn't change simply left alone. */}
        {matches.length > 0 && (
          <button
            type="button"
            onClick={() => setEditingResults(true)}
            className="self-start text-xs text-accent underline underline-offset-2 hover:text-ink"
          >
            {t("search.openInEditor")}
          </button>
        )}
        {status && <span className="text-xs text-faint">{status}</span>}
        {dismissed.size > 0 && (
          <div className="flex items-center gap-2 text-[10px] text-faint">
            <span>{t("search.dismissed", { count: dismissed.size })}</span>
            <button
              type="button"
              onClick={() => setDismissed(new Set())}
              className="underline underline-offset-2 hover:text-ink"
            >
              {t("search.restore")}
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <p className="px-4 py-4 text-xs text-marker">
            {error.includes("ripgrep") ? t("search.ripgrepMissing") : error}
          </p>
        ) : searching && query.trim().length >= 2 ? (
          <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("search.searching")}</p>
        ) : matches.length === 0 ? (
          <p className="px-4 py-6 text-xs leading-relaxed text-faint">
            {query.trim().length >= 2 ? t("search.noResults") : ""}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {shown.slice(0, RENDER_CAP).map((m, i) => (
              <li key={`${m.path}-${m.line}-${i}`} className="group relative">
                <button
                  type="button"
                  onClick={() => open(m.path, m.line)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, match: m })
                  }}
                  title={`${toRelative(rootFor(m.path), m.path)}:${m.line}`}
                  className="flex w-full flex-col gap-0.5 py-1.5 pr-7 pl-3 text-left hover:bg-surface"
                >
                  <span className="overflow-hidden font-mono text-sm text-ellipsis whitespace-nowrap text-muted">
                    {m.text.trim()}
                  </span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-faint">
                    {toRelative(rootFor(m.path), m.path)}:{m.line}
                  </span>
                </button>
                {/* Waving a result away is the fastest way to work a long list
                    down; it costs nothing because the next search restores it. */}
                <IconButton
                  size="xxs"
                  label={t("search.dismiss")}
                  icon={<CloseIcon className="h-3 w-3" />}
                  onClick={() => dismiss([matchKey(m)])}
                  className="absolute top-1.5 right-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                />
              </li>
            ))}
            {shown.length > RENDER_CAP && (
              <li className="px-3 py-2 text-[10px] leading-relaxed text-faint">
                {t("search.truncated", {
                  shown: RENDER_CAP,
                  total: shown.length,
                  defaultValue: "Showing {shown} of {total} — refine your search.",
                })}
              </li>
            )}
          </ul>
        )}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
      <SearchResultsEditor
        matches={matches}
        open={editingResults}
        onClose={() => setEditingResults(false)}
        onApplied={() => void refresh()}
      />
    </div>
  )
}

/** A small square search-mode toggle (case / whole-word / regex). */
function FlagButton({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean
  onClick: () => void
  label: string
  title: string
}) {
  return (
    <IconButton
      size="sm"
      active={active}
      label={title}
      icon={<span className="font-mono text-[11px] font-semibold">{label}</span>}
      onClick={onClick}
      className={`border ${
        active
          ? "border-accent bg-[color-mix(in_oklch,var(--accent)_18%,transparent)]"
          : "border-line"
      }`}
    />
  )
}
