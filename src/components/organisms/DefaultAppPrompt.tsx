/**
 * First-run prompt offering to make Reado the default app for text files.
 *
 * Shows once on the main window (production builds only — file associations don't
 * register in `tauri dev`), and never again once the user acts or ticks "don't
 * show again". The same action is always available from Settings.
 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings } from "../../lib/store";
import { makeDefaultApp } from "../../lib/defaults";
import { Modal } from "../atoms/Modal";
import { Checkbox } from "../atoms/Checkbox";
import { SparkleIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

export function DefaultAppPrompt() {
  const dismissed = useSettings((s) => s.defaultAppsDismissed);
  const [open, setOpen] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    // Only the main window, only bundled builds (dev can't register handlers),
    // and only until the user has dealt with it once.
    if (getCurrentWindow().label !== "main" || dismissed || !import.meta.env.PROD) return;
    const id = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(id);
    // Runs once on mount; `dismissed` is read at that point on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = (persist: boolean) => {
    if (persist || dontAsk) useSettings.getState().set({ defaultAppsDismissed: true });
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && close(false)}
      ariaLabel={t("defaultApp.title")}
      className="w-[min(440px,92vw)] p-5"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <SparkleIcon className="h-4 w-4 flex-none text-accent" />
          <h2 className="m-0 text-base font-semibold text-ink">{t("defaultApp.title")}</h2>
        </div>
        <p className="m-0 text-sm leading-relaxed text-muted">{t("defaultApp.body")}</p>
        <Checkbox
          checked={dontAsk}
          onChange={setDontAsk}
          label={t("defaultApp.dontAsk")}
          className="text-sm text-muted"
        />
        <div className="mt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {t("defaultApp.later")}
          </button>
          <button
            type="button"
            onClick={() => {
              void makeDefaultApp();
              close(true);
            }}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            {t("defaultApp.set")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
