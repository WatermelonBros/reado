/**
 * Bottom status bar: active file, cursor position, document info (indentation,
 * encoding, line endings, language), git branch, open-comment count and agent
 * run status. Some items are clickable (go to line, convert line endings), in
 * the spirit of VS Code's status bar.
 */
import { useEffect, useRef, useState } from "react";
import { gitBranches, gitCheckout, type GitBranches } from "../../lib/api";
import { useCursor, useProject } from "../../lib/store";
import { useComments, openCount } from "../../lib/comments";
import {
  useDocInfo,
  goToLine,
  convertEol,
  LANGUAGE_OPTIONS,
  type Eol,
} from "../../lib/docInfo";
import { useTerminals } from "../../lib/terminals";
import { useT } from "../../i18n";
import { GitBranchIcon, MessageIcon, TerminalIcon } from "../atoms/icons";

/** Path relative to the project root, with forward slashes. */
function relativePath(root: string, path: string | null): string | null {
  if (!path) return null;
  const rel = path.startsWith(root) ? path.slice(root.length) : path;
  return rel.replace(/^[\\/]+/, "").replace(/\\/g, "/");
}

/** Shared style for a clickable status-bar item. */
const ITEM =
  "inline-flex items-center gap-[5px] whitespace-nowrap rounded-sm px-1 transition-colors hover:bg-overlay hover:text-ink";

/** A pop-up anchored above a status-bar item, dismissed on outside click/Esc. */
function Popover({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-50 mb-1 min-w-[120px] overflow-hidden rounded-md border border-line-strong bg-overlay py-1 shadow-[var(--shadow)]"
    >
      {children}
    </div>
  );
}

/** A menu row with an optional check, for the status-bar popovers. */
function MenuRow({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm hover:bg-surface ${
        checked ? "text-ink" : "text-muted"
      }`}
    >
      {label}
      {checked && <span className="text-accent">✓</span>}
    </button>
  );
}

export function StatusBar() {
  const root = useProject((s) => s.root);
  const active = useProject((s) => s.active);
  const git = useProject((s) => s.git);
  const { line, col } = useCursor();
  const eol = useDocInfo((s) => s.eol);
  const indentKind = useDocInfo((s) => s.indentKind);
  const indentSize = useDocInfo((s) => s.indentSize);
  const language = useDocInfo((s) => s.language);
  const setDoc = useDocInfo((s) => s.set);
  const openComments = useComments((s) => openCount(s.comments));
  const toggleTerminal = useTerminals((s) => s.toggle);
  const t = useT();

  const [menu, setMenu] = useState<"goto" | "eol" | "indent" | "language" | "branch" | null>(null);
  const [gotoValue, setGotoValue] = useState("");
  const [branches, setBranches] = useState<GitBranches | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);

  const openBranchMenu = () => {
    setBranchError(null);
    setBranches(null);
    setMenu("branch");
    gitBranches(root).then(setBranches).catch(() => setBranches(null));
  };

  const checkout = async (name: string, remote: boolean) => {
    try {
      await gitCheckout(root, name, remote);
      // The working tree now reflects the new branch; reload to re-init cleanly.
      window.location.reload();
    } catch (e) {
      setBranchError(String(e));
    }
  };

  const rel = relativePath(root, active);

  const submitGoto = () => {
    const n = parseInt(gotoValue, 10);
    if (Number.isFinite(n)) goToLine(n);
    setMenu(null);
    setGotoValue("");
  };

  return (
    <footer className="flex h-[26px] flex-none items-center justify-between border-t border-line bg-surface px-2 text-xs text-muted select-none">
      <div className="flex min-w-0 items-center gap-1">
        <span className="max-w-[40vw] overflow-hidden px-1 text-ellipsis whitespace-nowrap">
          {rel ?? t("status.noFile")}
        </span>
        {active && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu(menu === "goto" ? null : "goto")}
              title={t("status.goToLine")}
              className={ITEM}
            >
              Ln {line}, Col {col}
            </button>
            {menu === "goto" && (
              <Popover onClose={() => setMenu(null)}>
                <input
                  autoFocus
                  value={gotoValue}
                  inputMode="numeric"
                  onChange={(e) => setGotoValue(e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitGoto();
                  }}
                  placeholder={t("status.goToLinePlaceholder")}
                  className="block w-[160px] bg-transparent px-2.5 py-1 text-sm text-ink outline-none placeholder:text-faint"
                />
              </Popover>
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-1">
        {active && (
          <>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu(menu === "indent" ? null : "indent")}
                title={t("status.indent")}
                className={ITEM}
              >
                {t(indentKind === "tabs" ? "status.tabs" : "status.spaces", {
                  size: indentSize,
                })}
              </button>
              {menu === "indent" && (
                <Popover onClose={() => setMenu(null)}>
                  {(["spaces", "tabs"] as const).map((kind) => (
                    <MenuRow
                      key={kind}
                      label={t(kind === "tabs" ? "status.useTabs" : "status.useSpaces")}
                      checked={indentKind === kind}
                      onClick={() => {
                        setDoc({ indentKind: kind });
                        setMenu(null);
                      }}
                    />
                  ))}
                  <div className="my-1 border-t border-line" />
                  {[2, 4, 8].map((size) => (
                    <MenuRow
                      key={size}
                      label={String(size)}
                      checked={indentSize === size}
                      onClick={() => {
                        setDoc({ indentSize: size });
                        setMenu(null);
                      }}
                    />
                  ))}
                </Popover>
              )}
            </div>
            <span className="px-1">UTF-8</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu(menu === "eol" ? null : "eol")}
                title={t("status.eol")}
                className={ITEM}
              >
                {eol}
              </button>
              {menu === "eol" && (
                <Popover onClose={() => setMenu(null)}>
                  {(["LF", "CRLF"] as Eol[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        if (opt !== eol) convertEol(opt);
                        setMenu(null);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-surface ${
                        opt === eol ? "text-ink" : "text-muted"
                      }`}
                    >
                      {opt}
                      {opt === eol && <span className="text-accent">✓</span>}
                    </button>
                  ))}
                </Popover>
              )}
            </div>
            {language && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenu(menu === "language" ? null : "language")}
                  title={t("status.language")}
                  className={ITEM}
                >
                  {language}
                </button>
                {menu === "language" && (
                  <Popover onClose={() => setMenu(null)}>
                    <div className="max-h-[40vh] overflow-y-auto">
                      {LANGUAGE_OPTIONS.map((name) => (
                        <MenuRow
                          key={name}
                          label={name}
                          checked={language === name}
                          onClick={() => {
                            setDoc({ language: name, languageOverride: name });
                            setMenu(null);
                          }}
                        />
                      ))}
                    </div>
                  </Popover>
                )}
              </div>
            )}
          </>
        )}
        {git.isRepo ? (
          <div className="relative">
            <button
              type="button"
              className={ITEM}
              title={t("status.branch")}
              onClick={() => (menu === "branch" ? setMenu(null) : openBranchMenu())}
            >
              <GitBranchIcon className="h-[13px] w-[13px]" />
              {git.branch ?? "—"}
            </button>
            {menu === "branch" && (
              <Popover onClose={() => setMenu(null)}>
                <div className="max-h-72 w-60 overflow-y-auto py-1">
                  {!branches ? (
                    <p className="px-3 py-2 text-sm text-faint">{t("common.loading")}</p>
                  ) : (
                    <>
                      {branchError && (
                        <p className="mx-3 my-1.5 rounded-sm bg-surface px-2 py-1 text-xs whitespace-pre-wrap text-marker">
                          {branchError}
                        </p>
                      )}
                      <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-faint uppercase">
                        {t("branch.local")}
                      </div>
                      {branches.local.length === 0 && (
                        <p className="px-3 py-1 text-sm text-faint">—</p>
                      )}
                      {branches.local.map((b) => (
                        <MenuRow
                          key={`l:${b}`}
                          label={b}
                          checked={b === branches.current}
                          onClick={() => void checkout(b, false)}
                        />
                      ))}
                      {branches.remote.length > 0 && (
                        <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold tracking-wide text-faint uppercase">
                          {t("branch.remote")}
                        </div>
                      )}
                      {branches.remote.map((b) => (
                        <MenuRow key={`r:${b}`} label={b} onClick={() => void checkout(b, true)} />
                      ))}
                    </>
                  )}
                </div>
              </Popover>
            )}
          </div>
        ) : (
          <span className="px-1 text-faint">{t("status.notGit")}</span>
        )}
        <span
          className="inline-flex items-center gap-[5px] px-1 whitespace-nowrap"
          title="open comments"
        >
          <MessageIcon className="h-[13px] w-[13px]" />
          {t("status.comments", { count: openComments })}
        </span>
        <span className="px-1 text-faint">{t("status.agentIdle")}</span>
        <button
          type="button"
          onClick={() => toggleTerminal()}
          title={`${t("terminal.toggle")} (⌘J)`}
          aria-label={t("terminal.toggle")}
          className="inline-flex items-center gap-[5px] rounded-sm px-1 text-faint transition-colors hover:text-ink"
        >
          <TerminalIcon className="h-[13px] w-[13px]" />
        </button>
      </div>
    </footer>
  );
}
