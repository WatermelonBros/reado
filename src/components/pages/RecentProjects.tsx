/**
 * Launcher screen shown when no project is open: recent projects plus an
 * "open folder" action. Opening a project launches it in its own window.
 */
import { useRecents } from "../../lib/store";
import { openProject, pickFolderAndOpen } from "../../lib/window";

import { FolderOpenIcon, CloseIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

export function RecentProjects() {
  const projects = useRecents((s) => s.projects);
  const touch = useRecents((s) => s.touch);
  const remove = useRecents((s) => s.remove);
  const { t } = useTranslation();

  const pick = () => void pickFolderAndOpen();

  const launch = (path: string) => {
    touch(path);
    openProject(path);
  };

  return (
    <div
      className="grid h-full place-items-center overflow-y-auto bg-canvas p-8"
    >
      <div className="flex w-[min(560px,100%)] flex-col gap-8">
        <header className="text-center">
          <h1 className="m-0 text-[2.4rem] font-[650] tracking-[-0.02em]">Reado</h1>
          <p className="mt-2 text-lg text-muted">{t("app.tagline")}</p>
        </header>

        <button
          type="button"
          onClick={pick}
          className="flex items-center gap-4 rounded-lg border border-line bg-surface px-5 py-4 text-left transition-[border-color,transform] hover:-translate-y-px hover:border-accent"
        >
          <FolderOpenIcon className="h-[22px] w-[22px] flex-none text-accent" />
          <span className="flex flex-col">
            <strong className="text-lg">{t("recents.open")}</strong>
            <small className="text-sm text-muted">{t("recents.openHint")}</small>
          </span>
        </button>

        {/* How it works — quiet, three-step teaching so a first-run user (no
            recents yet) understands what Reado is for before opening anything. */}
        <section>
          <h2 className="mb-3 text-xs tracking-[0.06em] text-faint uppercase">
            {t("welcome.how")}
          </h2>
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
            {[t("welcome.step1"), t("welcome.step2"), t("welcome.step3")].map((step, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm text-muted">
                <span className="grid h-5 w-5 flex-none translate-y-0.5 place-items-center rounded-full border border-line text-xs text-faint">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="mb-2 text-xs tracking-[0.06em] text-faint uppercase">
            {t("recents.title")}
          </h2>
          {projects.length === 0 ? (
            <p className="m-0 text-sm text-muted">{t("recents.empty")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {projects.map((p) => (
                <li
                  key={p.path}
                  className="group flex items-stretch overflow-hidden rounded-md hover:bg-surface"
                >
                  <button
                    type="button"
                    onClick={() => launch(p.path)}
                    title={p.path}
                    className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2 text-left"
                  >
                    <span className="text-base text-ink">{p.name}</span>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-faint">
                      {p.path}
                    </span>
                  </button>
                  <button
                    type="button"
                    title={t("recents.remove")} aria-label={t("recents.remove")}
                    onClick={() => remove(p.path)}
                    className="grid w-[34px] place-items-center text-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-ink"
                  >
                    <CloseIcon className="h-[14px] w-[14px]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
