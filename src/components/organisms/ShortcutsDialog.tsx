/**
 * Keyboard-shortcuts reference. A read-only, grouped list of every binding —
 * opened from Settings, the command palette, or the Help menu.
 */
import { usePalette } from "../../lib/store";
import { SHORTCUT_GROUPS } from "../../lib/shortcuts";

import { Modal } from "../atoms/Modal";
import { CloseIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

export function ShortcutsDialog() {
  const open = usePalette((s) => s.shortcutsOpen);
  const toggle = usePalette((s) => s.toggleShortcuts);
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && toggle(false)}
      ariaLabel={t("sc.title")}
      className="flex max-h-[80vh] w-[min(640px,92vw)] flex-col"
    >
      <header className="flex flex-none items-center justify-between border-b border-line px-5 py-3">
        <h2 className="m-0 text-sm font-semibold tracking-wide uppercase">{t("sc.title")}</h2>
        <button
          type="button"
          title={t("settings.close")} aria-label={t("settings.close")}
          onClick={() => toggle(false)}
          className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 gap-8 overflow-y-auto p-5 sm:columns-2">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.titleKey} className="mb-5 break-inside-avoid">
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-faint uppercase">
              {t(group.titleKey)}
            </h3>
            <ul className="m-0 list-none p-0">
              {group.items.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between gap-4 py-1 text-sm"
                >
                  <span className="text-muted">{s.label}</span>
                  <kbd className="flex-none rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">
                    {s.combo}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
