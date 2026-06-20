/**
 * Welcome / empty-editor screen. Calm and teaching: it explains the core loop
 * (read → comment → resolve) and surfaces the key shortcuts, rather than just
 * saying "no file open".
 */
import { SHORTCUTS } from "../../lib/shortcuts";
import { useT, type MessageKey } from "../../i18n";

const STEPS: MessageKey[] = ["welcome.step1", "welcome.step2", "welcome.step3"];

export function Welcome() {
  const t = useT();
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="w-full max-w-[380px]">
        <h2 className="m-0 text-xl font-semibold tracking-tight">Reado</h2>
        <p className="mt-1 mb-7 text-sm text-muted">{t("app.tagline")}</p>

        <p className="mb-2 text-xs font-medium tracking-wide text-faint uppercase">
          {t("welcome.how")}
        </p>
        <ol className="m-0 mb-7 flex list-none flex-col gap-2.5 p-0">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-2.5">
              <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-surface text-[11px] font-semibold text-muted">
                {i + 1}
              </span>
              <span className="text-sm leading-snug text-muted">{t(step)}</span>
            </li>
          ))}
        </ol>

        <p className="mb-2 text-xs font-medium tracking-wide text-faint uppercase">
          {t("welcome.shortcuts")}
        </p>
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
