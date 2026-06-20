/**
 * A single terminal tab: an xterm.js view bound to a backend PTY.
 *
 * Stays mounted (hidden when inactive) so the PTY connection and scrollback
 * survive tab switches. Streams output from `pty-output-{id}` and forwards
 * keystrokes and resizes back to the PTY.
 */
import { useEffect, useRef } from "react";
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

  // Keep the PTY size in sync with the rendered terminal.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      const fit = fitRef.current;
      const term = termRef.current;
      if (!fit || !term || host.clientWidth === 0) return;
      try {
        fit.fit();
        ptyResize(id, term.rows, term.cols).catch(() => {});
      } catch {
        /* not measurable right now */
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [id]);

  // Refit and focus when this tab becomes active (it may have been hidden).
  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      try {
        fit.fit();
        ptyResize(id, term.rows, term.cols).catch(() => {});
        term.focus();
      } catch {
        /* ignore */
      }
    });
  }, [active, id]);

  return <div ref={hostRef} className="h-full w-full" />;
}
