/**
 * Custom title bar (window chrome).
 *
 * Replaces the OS title bar so the strip follows Reado's theme on every platform
 * and hosts a Command Center. On macOS the window keeps its native traffic lights
 * (`titleBarStyle: Overlay`) and its system menu bar; on Windows/Linux we drop
 * the native decorations and draw our own menu bar (left), window controls
 * (right), and min/max/close. The whole strip is a drag region except for the
 * interactive zones.
 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePalette } from "../../lib/store";
import { currentOS } from "../../lib/extensions";
import { mod } from "../../lib/shortcuts";
import { SearchIcon, MinusIcon, CloseIcon } from "../atoms/icons";
import { MenuBar } from "../molecules/MenuBar";
import { useTranslation } from "react-i18next";

const os = currentOS();
const isMac = os === "mac";

/** Overlapping-squares glyph for "restore"; a single square for "maximize". */
const MaximizeGlyph = ({ maximized }: { maximized: boolean }) =>
  maximized ? (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
      <rect x="2.5" y="0.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
      <rect x="0.5" y="2.5" width="7" height="7" rx="1" fill="var(--bg)" stroke="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
      <rect x="0.75" y="0.75" width="8.5" height="8.5" rx="1" fill="none" stroke="currentColor" />
    </svg>
  );

function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const { t } = useTranslation();
  const win = getCurrentWindow();

  useEffect(() => {
    win.isMaximized().then(setMaximized).catch(() => {});
    const un = win.onResized(() => win.isMaximized().then(setMaximized).catch(() => {}));
    return () => void un.then((f) => f());
  }, [win]);

  const btn =
    "grid h-full w-11 place-items-center text-muted transition-colors hover:bg-surface hover:text-ink";
  return (
    <div className="flex h-full flex-none items-stretch">
      <button type="button" className={btn} title={t("window.minimize")} onClick={() => void win.minimize()}>
        <MinusIcon className="h-3 w-3" />
      </button>
      <button
        type="button"
        className={btn}
        title={t(maximized ? "window.restore" : "window.maximize")}
        onClick={() => void win.toggleMaximize()}
      >
        <MaximizeGlyph maximized={maximized} />
      </button>
      <button
        type="button"
        className="grid h-full w-11 place-items-center text-muted transition-colors hover:bg-danger hover:text-white"
        title={t("window.close")}
        onClick={() => void win.close()}
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function TitleBar({ projectName }: { projectName: string | null }) {
  const { t } = useTranslation();

  // Win/Linux: shed the native decorations at runtime (the config keeps them so
  // the window is usable if this never runs); macOS uses Overlay from the config.
  useEffect(() => {
    if (!isMac) getCurrentWindow().setDecorations(false).catch(() => {});
  }, []);

  const openPalette = () => usePalette.getState().open("commands");

  // The Command Center pill (centered): project name + ⌘K, opens the palette.
  const pill = projectName ? (
    <button
      type="button"
      onClick={openPalette}
      title={t("titlebar.search")}
      className="pointer-events-auto flex h-6 min-w-[200px] max-w-[44vw] items-center gap-2 rounded-md border border-line bg-surface/70 px-2.5 text-xs text-muted transition-colors hover:border-accent/40 hover:bg-surface hover:text-ink"
    >
      <SearchIcon className="h-3 w-3 flex-none opacity-70" />
      <span className="truncate">{projectName}</span>
      <kbd className="ml-auto flex-none font-sans text-[10px] tracking-wide text-faint">{mod}K</kbd>
    </button>
  ) : (
    <span className="pointer-events-none text-xs font-medium tracking-wide text-faint">Reado</span>
  );

  return (
    <div
      data-tauri-drag-region
      className={`relative z-30 flex h-9 flex-none items-center border-b border-line bg-canvas select-none ${
        isMac ? "pl-[72px] pr-2" : "pl-1"
      }`}
    >
      {isMac ? (
        // macOS: traffic lights sit top-left; the pill floats centered on the window.
        <div className="pointer-events-none absolute inset-x-0 flex justify-center">{pill}</div>
      ) : (
        // Win/Linux: menu bar (left) · pill (center) · window controls (right).
        <>
          <MenuBar />
          <div className="flex min-w-0 flex-1 justify-center px-3">{pill}</div>
          <WindowControls />
        </>
      )}
    </div>
  );
}
