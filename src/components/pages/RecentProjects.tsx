/**
 * Launcher screen shown when no project is open. It adapts to context instead of
 * showing one fixed layout:
 *   - First run (no recents) → an onboarding: wordmark, tagline, a prominent
 *     "open folder" action, and the quiet three-step teaching.
 *   - Returning (has recents) → a calm, left-aligned utility: the recent list is
 *     the hero; opening another folder is a secondary action below it.
 *
 * Keyboard-first for its engineer audience: ⌘/Ctrl+O opens a folder anywhere;
 * ↑/↓ move through recents and Enter opens the highlighted one. Opening a
 * project launches it in its own window.
 */
import { useEffect, useState } from "react";
import { useRecents } from "../../lib/store";
import { openProjectHere, pickFolderAndOpen } from "../../lib/window";

import { FolderOpenIcon, CloseIcon, ChevronIcon } from "../atoms/icons";
import { IconButton } from "../atoms/IconButton";
import { useTranslation } from "react-i18next";

// ponytail: navigator.platform is deprecated but reliable in the Tauri webview,
// and this only picks the glyph shown in the shortcut hint.
const MOD =
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘" : "Ctrl+";

/** The Reado wordmark with an accent text-caret and a quiet tagline sub-mark. */
function Wordmark({ tagline }: { tagline: string }) {
  return (
    <header className="animate-rise mb-9" style={{ animationFillMode: "backwards" }}>
      <h1 className="m-0 flex items-center text-[1.9rem] font-[680] leading-none tracking-[-0.03em] text-ink">
        Reado
        <span
          aria-hidden
          className="ml-1 h-[1.1rem] w-[3px] rounded-[1px] bg-accent"
        />
      </h1>
      <p className="mt-2 text-[11px] tracking-[0.04em] text-faint">{tagline}</p>
    </header>
  );
}

/** The shortcut hint chip shown on the "open folder" actions. */
function Kbd() {
  return (
    <kbd className="ml-auto rounded border border-line px-1.5 py-0.5 font-mono text-[10px] leading-none text-faint">
      {MOD}O
    </kbd>
  );
}

export function RecentProjects() {
  const projects = useRecents((s) => s.projects);
  const remove = useRecents((s) => s.remove);
  const { t } = useTranslation();

  const pick = () => void pickFolderAndOpen();
  const launch = (path: string) => void openProjectHere(path);

  // Abbreviate the home dir to `~` so the path reads as a location, not a full
  // absolute string (macOS/Linux `/Users|/home/<user>` and Windows `C:\Users\<user>`).
  // Purely cosmetic — the row's title tooltip keeps the real path.
  const prettyPath = (path: string) =>
    path.replace(/^([A-Za-z]:)?[\\/](Users|home)[\\/][^\\/]+/, "~");

  const hasRecents = projects.length > 0;

  // Keyboard selection through the recents (-1 = nothing highlighted yet). Clamped
  // on render so removing a row can't leave the highlight pointing past the end.
  const [selRaw, setSel] = useState(-1);
  const sel = Math.min(selRaw, projects.length - 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        pick();
        return;
      }
      if (!hasRecents) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, projects.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => (s <= 0 ? 0 : s - 1));
      } else if (e.key === "Enter" && sel >= 0) {
        e.preventDefault();
        launch(projects[sel].path);
      } else if (e.key === "Escape") {
        setSel(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasRecents, projects, sel]);

  return (
    <div className="grid h-full place-items-center overflow-y-auto bg-canvas px-8 py-12">
      <div className="flex w-[min(440px,100%)] flex-col">
        <Wordmark tagline={t("app.tagline")} />

        {hasRecents ? (
          <>
            <h2
              className="animate-rise mb-1.5 text-xs tracking-[0.06em] text-faint uppercase"
              style={{ animationDelay: "40ms", animationFillMode: "backwards" }}
            >
              {t("recents.title")}
            </h2>
            <ul className="m-0 mb-3 flex list-none flex-col p-0">
              {projects.map((p, i) => {
                const selected = i === sel;
                return (
                  <li
                    key={p.path}
                    ref={
                      selected
                        ? (el) => el?.scrollIntoView({ block: "nearest" })
                        : undefined
                    }
                    className={`group animate-rise -mx-3 flex items-center overflow-hidden rounded-md pr-1.5 transition-colors ${
                      selected ? "bg-surface" : "hover:bg-surface"
                    }`}
                    style={{
                      animationDelay: `${80 + i * 40}ms`,
                      animationFillMode: "backwards",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => launch(p.path)}
                      onMouseEnter={() => setSel(-1)}
                      title={p.path}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2 text-left"
                    >
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] leading-tight text-ink">
                        {p.name}
                      </span>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] leading-tight text-faint">
                        {prettyPath(p.path)}
                      </span>
                    </button>
                    {/* Fixed-width control rail: a resting chevron (this row opens) that
                        swaps to the remove ✕ on hover — same slot, so the row never
                        reflows when the ✕ appears. */}
                    <span className="relative grid h-7 w-7 flex-none place-items-center">
                      <ChevronIcon
                        className={`pointer-events-none col-start-1 row-start-1 h-4 w-4 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 ${
                          selected ? "text-accent" : "text-faint/40"
                        }`}
                      />
                      <IconButton
                        label={t("recents.remove")}
                        icon={<CloseIcon className="h-[14px] w-[14px]" />}
                        onClick={() => {
                          remove(p.path);
                          setSel(-1);
                        }}
                        className="pointer-events-none col-start-1 row-start-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:opacity-100"
                      />
                    </span>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={pick}
              style={{ animationDelay: `${80 + projects.length * 40}ms`, animationFillMode: "backwards" }}
              className="animate-rise -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2.5 rounded-md px-3 py-2 text-left text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <FolderOpenIcon className="h-[18px] w-[18px] flex-none text-accent" />
              <span className="text-sm">{t("recents.open")}</span>
              <Kbd />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={pick}
              style={{ animationDelay: "40ms", animationFillMode: "backwards" }}
              className="animate-rise mb-9 flex items-center gap-3.5 rounded-lg border border-accent/30 bg-accent/[0.07] px-4 py-3.5 text-left transition-[border-color,transform] hover:-translate-y-px hover:border-accent/60"
            >
              <FolderOpenIcon className="h-[22px] w-[22px] flex-none text-accent" />
              <span className="flex flex-col">
                <strong className="text-[15px] text-ink">{t("recents.open")}</strong>
                <small className="text-xs text-muted">{t("recents.openHint")}</small>
              </span>
              <Kbd />
            </button>

            {/* Quiet three-step teaching so a first-run user understands what Reado
                is for before opening anything. */}
            <h2
              className="animate-rise mb-3 text-xs tracking-[0.06em] text-faint uppercase"
              style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
            >
              {t("welcome.how")}
            </h2>
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {[t("welcome.step1"), t("welcome.step2"), t("welcome.step3")].map((step, i) => (
                <li
                  key={i}
                  className="animate-rise flex items-baseline gap-3 text-sm text-muted"
                  style={{ animationDelay: `${120 + i * 40}ms`, animationFillMode: "backwards" }}
                >
                  <span className="grid h-5 w-5 flex-none translate-y-0.5 place-items-center rounded-full border border-line text-[11px] text-faint">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
