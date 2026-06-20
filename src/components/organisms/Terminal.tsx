/**
 * A single terminal tab: an xterm.js view bound to a backend PTY.
 *
 * Stays mounted (hidden when inactive) so the PTY connection and scrollback
 * survive tab switches. Streams output from `pty-output-{id}` and forwards
 * keystrokes and resizes back to the PTY.
 */
import { useCallback, useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ptySpawn, ptyWrite, ptyResize, ptyKill } from "../../lib/api";
import { xtermTheme } from "../../lib/xtermTheme";

const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

interface Props {
  id: string;
  cwd: string;
  active: boolean;
}

export function Terminal({ id, cwd, active }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Last size pushed to the PTY. Resending an unchanged size still raises
  // SIGWINCH, which makes a TUI (Claude/Codex use Ink) repaint its whole frame —
  // and xterm's reflow turns repeated repaints into duplicated lines. So we only
  // forward a resize when the dimensions actually change.
  const lastSize = useRef({ rows: 0, cols: 0 });

  // Fit to the container and forward the size to the PTY, but only when it
  // changed. Safe to call as often as we like.
  const syncSize = useCallback(() => {
    const fit = fitRef.current;
    const term = termRef.current;
    const host = hostRef.current;
    if (!fit || !term || !host || host.clientWidth === 0) return;
    try {
      fit.fit();
    } catch {
      return; // not measurable right now
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
      fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fit;

    const unlisten: UnlistenFn[] = [];
    let disposed = false;

    // Fit, spawn the PTY at the fitted size, then wire output and input.
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
      term.onData((data) => ptyWrite(id, data));

      // Once the web font is ready the cell metrics change; refit so the PTY's
      // column count matches what's actually rendered before an agent reads it.
      document.fonts?.ready.then(() => !disposed && syncSize());
    });

    return () => {
      disposed = true;
      unlisten.forEach((off) => off());
      ptyKill(id).catch(() => {});
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the PTY size in sync with the rendered terminal. Coalesce bursts of
  // resize events (e.g. dragging the panel edge) into one sync per frame.
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

  // Refit and focus when this tab becomes active (it may have been hidden).
  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    if (!term) return;
    requestAnimationFrame(() => {
      syncSize();
      term.focus();
    });
  }, [active, syncSize]);

  return <div ref={hostRef} className="h-full w-full" />;
}
