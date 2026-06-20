/**
 * Welcome / empty-editor screen. Calm and teaching: it surfaces the key
 * shortcuts rather than just saying "no file open".
 */
import { SHORTCUTS } from "../lib/shortcuts";
import { useT } from "../i18n";

export function Welcome() {
  const t = useT();
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="w-full max-w-[340px]">
        <h2 className="m-0 text-xl font-semibold tracking-tight">Reado</h2>
        <p className="mt-1 mb-6 text-sm text-muted">{t("app.tagline")}</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {SHORTCUTS.map((s) => (
            <li key={s.labelKey} className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted">{t(s.labelKey)}</span>
              <kbd className="flex-none rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-faint">
                {s.combo}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
