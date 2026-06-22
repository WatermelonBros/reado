/**
 * Extensions marketplace (Phase 1: language servers).
 *
 * Lists the available language-server extensions with their install status
 * (detected on the user's real PATH), an enable/disable toggle, and a one-click
 * Install that runs the server's install command in the integrated terminal.
 */
import { useCallback, useEffect, useState } from "react";
import { lspInstalled, linuxPackageManager, submitToTerminal } from "../../lib/api";
import { LANG_SERVERS, useExtensions, currentOS, installCmd, type LinuxPm } from "../../lib/extensions";
import { useTerminals } from "../../lib/terminals";
import { Checkbox } from "../atoms/Checkbox";
import { FetchIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

export function ExtensionsPanel() {
  const { t } = useTranslation();
  const disabled = useExtensions((s) => s.disabled);
  const toggle = useExtensions((s) => s.toggle);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(() => {
    setChecking(true);
    Promise.all(
      LANG_SERVERS.map((s) => lspInstalled(s.id).then((ok) => [s.id, ok] as const).catch(() => [s.id, false] as const)),
    )
      .then((pairs) => setInstalled(Object.fromEntries(pairs)))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    recheck();
  }, [recheck]);

  const os = currentOS();
  const [linuxPm, setLinuxPm] = useState<LinuxPm | null>(null);
  useEffect(() => {
    if (os === "linux") linuxPackageManager().then((pm) => setLinuxPm(pm as LinuxPm | null)).catch(() => {});
  }, [os]);
  const install = (cmd: string) => {
    const term = useTerminals.getState();
    const id = term.activeId ?? term.add();
    submitToTerminal(id, cmd, id === term.activeId ? 0 : 400);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-none items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-xs text-faint">{t("ext.languageServers")}</span>
        <button
          type="button"
          onClick={recheck}
          disabled={checking}
          title={t("ext.recheck")}
          aria-label={t("ext.recheck")}
          className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-overlay hover:text-ink disabled:opacity-40"
        >
          <FetchIcon className={`h-4 w-4 ${checking ? "opacity-50" : ""}`} />
        </button>
      </div>

      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {LANG_SERVERS.map((s) => {
          const isInstalled = installed[s.id];
          const enabled = !disabled.includes(s.id);
          const cmd = installCmd(s, os, linuxPm);
          return (
            <li key={s.id} className="border-b border-line/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {s.name}
                </span>
                {isInstalled ? (
                  <span className="flex-none text-[11px] font-medium text-[var(--syn-string)]">
                    {t("ext.installed")}
                  </span>
                ) : cmd ? (
                  <button
                    type="button"
                    onClick={() => install(cmd)}
                    title={cmd}
                    className="flex-none rounded-md border border-line-strong px-2 py-0.5 text-[11px] font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                  >
                    {t("ext.install")}
                  </button>
                ) : (
                  <span className="flex-none text-[11px] text-faint">{t("ext.manual")}</span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">{s.description}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <Checkbox
                  checked={enabled}
                  onChange={(v) => toggle(s.id, v)}
                  label={t("ext.enabled")}
                  className="text-[11px] text-muted"
                />
                {s.requires && !isInstalled && (
                  <span className="truncate text-[11px] text-faint" title={s.requires}>
                    {t("ext.requires", { name: s.requires })}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
