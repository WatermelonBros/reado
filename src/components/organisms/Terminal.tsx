/**
 * A single terminal tab: an xterm.js view bound to a backend PTY.
 *
 * Stays mounted (hidden when inactive) so the PTY connection and scrollback
 * survive tab switches. Streams output from `pty-output-{id}` and forwards
 * keystrokes and resizes back to the PTY.
 *
 * Output is navigable: `path:line:col` tokens are clickable (open the file in
 * the editor) and URLs open in the browser. Cmd+F searches the scrollback.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as XTerm, type ILink } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readText as clipboardReadText, writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ptySpawn, ptyWrite, ptyResize, ptyKill, resolvePath } from "../../lib/api";
import { useProject, useSettings } from "../../lib/store";
import { xtermTheme, xtermFontFamily } from "../../lib/xtermTheme";
import { useTranslation } from "react-i18next";
import { SearchIcon, ChevronIcon, CloseIcon } from "../atoms/icons";
import { Input } from "../atoms/Input";

const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Terminal font size at 100% interface zoom (multiplied by the zoom factor). */
const BASE_FONT_SIZE = 13;

// A file path printed in output, with an optional :line:col or (line,col) suffix.
// Requires a real extension so we don't underline arbitrary words.
const PATH_RE =
  /(\/?[\w.\-~/@]*[\w\-]+\.[A-Za-z][\w]*)(?::(\d+)(?::\d+)?|\((\d+),\d+\))?/g;

interface Props {
  id: string;
  cwd: string;
  active: boolean;
}

export function Terminal({ id, cwd, active }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const { t } = useTranslation();
  // null = search box hidden; a string = open with that query.
  const [query, setQuery] = useState<string | null>(null);
  const lastSize = useRef({ rows: 0, cols: 0 });

  const syncSize = useCallback(() => {
    const fit = fitRef.current;
    const term = termRef.current;
    const host = hostRef.current;
    if (!fit || !term || !host || host.clientWidth === 0) return;
    try {
      fit.fit();
    } catch {
      return;
    }
    const { rows, cols } = term;
    if (rows === lastSize.current.rows && cols === lastSize.current.cols) return;
    lastSize.current = { rows, cols };
    ptyResize(id, rows, cols).catch(() => {});
  }, [id]);

  // Create the terminal and PTY once.
  useEffect(() => {
    if (!hostRef.current) return;
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
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    // URLs in output open in the browser via the OS, not an in-app webview.
    term.loadAddon(new WebLinksAddon((_e, uri) => void openUrl(uri)));
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    // xtermTheme() resolves tokens to concrete colours once, so re-apply them
    // (and the code font) whenever the active theme changes on <html>.
    const themeObserver = new MutationObserver(() => {
      term.options.theme = xtermTheme();
      term.options.fontFamily = useSettings.getState().codeFont || xtermFontFamily();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Make `path:line:col` tokens clickable → open the file in the editor.
    term.registerLinkProvider({
      provideLinks(y, cb) {
        const buf = term.buffer.active.getLine(y - 1);
        if (!buf) return cb(undefined);
        const text = buf.translateToString(true);
        const links: ILink[] = [];
        PATH_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = PATH_RE.exec(text))) {
          // Skip matches that are actually the tail of a URL (WebLinks owns those).
          if (/[a-zA-Z][\w+.-]*:\/\/\S*$/.test(text.slice(0, m.index))) continue;
          const full = m[0];
          const path = m[1];
          const lineNo = m[2] ? +m[2] : m[3] ? +m[3] : undefined;
          const startX = m.index + 1;
          links.push({
            text: full,
            range: { start: { x: startX, y }, end: { x: startX + full.length - 1, y } },
            activate: () => {
              const root = useProject.getState().root;
              resolvePath(root, path)
                .then((abs) => abs && useProject.getState().open(abs, lineNo))
                .catch(() => {});
            },
          });
        }
        cb(links.length ? links : undefined);
      },
    });

    const unlisten: UnlistenFn[] = [];
    let disposed = false;

    requestAnimationFrame(async () => {
      if (disposed) return;
      try {
        fit.fit();
      } catch {
        /* container not measured yet */
      }
      lastSize.current = { rows: term.rows, cols: term.cols };
      await ptySpawn(id, cwd, term.rows, term.cols).catch(() => {});

      unlisten.push(
        await listen<string>(`pty-output-${id}`, (e) => term.write(decode(e.payload))),
      );
      unlisten.push(
        await listen(`pty-exit-${id}`, () =>
          term.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n"),
        ),
      );
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;
        const key = e.key.toLowerCase();
        // Copy: Cmd+C (mac), Ctrl+Shift+C, or Ctrl+C while text is selected
        // (Windows/Linux). Bare Ctrl+C with no selection stays SIGINT.
        if (
          key === "c" &&
          (e.metaKey || (e.ctrlKey && e.shiftKey) || (e.ctrlKey && term.hasSelection()))
        ) {
          const sel = term.getSelection();
          if (sel) {
            e.preventDefault();
            void clipboardWriteText(sel).catch(() => {});
            return false;
          }
        }
        // Paste: Cmd+V (mac) or Ctrl+Shift+V (Windows/Linux). term.paste keeps
        // bracketed-paste mode intact so TUIs receive it as a paste, not typing.
        if (key === "v" && (e.metaKey || (e.ctrlKey && e.shiftKey))) {
          e.preventDefault();
          // Native clipboard read (not navigator.clipboard) so Windows WebView2
          // doesn't prompt for clipboard permission on every paste.
          void clipboardReadText().then((t) => t && term.paste(t)).catch(() => {});
          return false;
        }
        // Cmd+F (or Ctrl+Shift+F) opens search — Ctrl+F alone stays readline's.
        if (e.key.toLowerCase() === "f" && (e.metaKey || (e.ctrlKey && e.shiftKey))) {
          e.preventDefault();
          setQuery((q) => (q === null ? "" : q));
          return false;
        }
        // Shift+Enter inserts a newline instead of submitting: ESC+CR is the
        // sequence TUI agents (Claude/Codex) and readline read as "newline".
        // preventDefault is essential: returning false stops xterm processing
        // but not the browser default, so without it the hidden textarea also
        // emits a plain Enter (\r) and the agent submits anyway.
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault();
          void ptyWrite(id, "\x1b\r");
          return false;
        }
        return true;
      });
      term.onData((data) => ptyWrite(id, data));

      document.fonts?.ready.then(() => !disposed && syncSize());
    });

    return () => {
      disposed = true;
      themeObserver.disconnect();
      // A rejecting unlisten (listener map already torn down) must not escape.
      unlisten.forEach((off) => void Promise.resolve(off()).catch(() => {}));
      ptyKill(id).catch(() => {});
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncSize);
    });
    observer.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [syncSize]);

  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    if (!term) return;
    requestAnimationFrame(() => {
      syncSize();
      term.focus();
    });
  }, [active, syncSize]);

  // Re-apply the code font when the setting changes at runtime (matches Editor).
  const codeFont = useSettings((s) => s.codeFont);
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = codeFont || xtermFontFamily();
    requestAnimationFrame(syncSize);
  }, [codeFont, syncSize]);

  // Interface zoom drives the terminal font size (not a CSS transform), and the
  // host is counter-scaled in the JSX so the terminal has no net scale — keeping
  // xterm's coordinate mapping (selection, links) correct at any zoom. Re-fit so
  // the cols/rows track the new cell size.
  const zoom = useSettings((s) => s.zoom) || 1;
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = BASE_FONT_SIZE * zoom;
    requestAnimationFrame(syncSize);
  }, [zoom, syncSize]);

  const find = (q: string, back = false) => {
    if (!q) return;
    if (back) searchRef.current?.findPrevious(q);
    else searchRef.current?.findNext(q);
  };
  const closeSearch = () => {
    setQuery(null);
    searchRef.current?.clearDecorations?.();
    termRef.current?.focus();
  };

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
              setQuery(e.target.value);
              find(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") find(query, e.shiftKey);
              if (e.key === "Escape") closeSearch();
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
        style={{ transform: `scale(${1 / zoom})`, width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
      >
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </div>
  );
}
