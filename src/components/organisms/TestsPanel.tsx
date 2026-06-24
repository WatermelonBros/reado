/**
 * Tests panel: detected test runners, run in the integrated terminal (the results
 * surface). Run the whole suite or the current file's tests.
 */
import { useTests } from "../../lib/tests";
import { useProject } from "../../lib/store";
import { useTranslation } from "react-i18next";

export function TestsPanel() {
  const runners = useTests((s) => s.runners);
  const active = useProject((s) => s.active);
  const { t } = useTranslation();

  if (runners.length === 0) {
    return <p className="px-4 py-6 text-xs leading-relaxed text-faint">{t("tests.empty")}</p>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ul className="m-0 flex-1 list-none overflow-y-auto p-0 py-1">
        {runners.map((r) => (
          <li key={r.id} className="border-b border-line px-3 py-2">
            <div className="mb-1.5 font-mono text-xs text-ink">{r.label}</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => useTests.getState().runAll(r)}
                className="rounded-md bg-surface px-2 py-0.5 text-[11px] text-accent hover:text-ink"
              >
                {t("tests.runAll")}
              </button>
              {r.fileCmd && active && (
                <button
                  type="button"
                  onClick={() => useTests.getState().runFile(r)}
                  className="rounded-md bg-surface px-2 py-0.5 text-[11px] text-muted hover:text-ink"
                >
                  {t("tests.runFile")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="flex-none border-t border-line px-3 py-2 text-[11px] text-faint">
        {t("tests.note")}
      </p>
    </div>
  );
}
