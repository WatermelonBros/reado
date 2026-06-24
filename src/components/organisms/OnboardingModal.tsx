/**
 * Modal showing the AI-generated repo onboarding overview. Generation runs
 * through the terminal agent (see lib/onboarding). Relative Markdown links open
 * the referenced project file; external links open in the browser.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useOnboarding } from "../../lib/onboarding";
import { useProject } from "../../lib/store";
import { Modal } from "../atoms/Modal";
import { SparkleIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";

export function OnboardingModal() {
  const { open, status, text, stale } = useOnboarding();
  const root = useProject((s) => s.root);
  const openFile = useProject((s) => s.open);
  const { t } = useTranslation();

  const onLink = (href: string | undefined) => {
    if (!href) return;
    if (/^[a-z]+:\/\//i.test(href)) {
      void openUrl(href);
    } else {
      // A relative project path → open it and close the overview.
      openFile(`${root}/${href.replace(/^\.?\//, "")}`);
      useOnboarding.getState().close();
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && useOnboarding.getState().close()}
      ariaLabel={t("onboarding.title")}
      className="flex max-h-[80vh] w-[min(760px,92vw)] flex-col"
    >
      <header className="flex flex-none items-center gap-2 border-b border-line px-4 py-3">
        <SparkleIcon className="h-4 w-4 flex-none text-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {t("onboarding.title")}
        </span>
        <button
          type="button"
          onClick={() => useOnboarding.getState().regenerate()}
          disabled={status === "loading"}
          className="flex-none rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
        >
          {t("synopsis.regenerate")}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {status === "ready" && stale && (
          <p className="mb-3 rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-muted">
            {t("onboarding.stale")}
          </p>
        )}
        {status === "loading" && (
          <p className="text-sm text-muted">{t("onboarding.generating")}</p>
        )}
        {status === "error" && <p className="text-sm text-muted">{t("synopsis.error")}</p>}
        {status === "ready" && (
          <div className="prose-reado max-w-none text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      onLink(href);
                    }}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </Modal>
  );
}
