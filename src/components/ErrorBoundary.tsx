/**
 * Top-level error boundary.
 *
 * Without this, any render exception unmounts the whole React tree and the
 * window goes blank — indistinguishable from a crash, forcing a restart. This
 * catches it, keeps the app alive, shows the error (so it can be reported) and
 * offers a reload. Class component: error boundaries can't be hooks.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the webview console for diagnosis.
    console.error("Reado render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas p-8 text-ink">
        <div className="max-w-md">
          <h1 className="text-base font-semibold">{t("error.title")}</h1>
          <p className="mt-2 text-sm text-muted">{t("error.body")}</p>
          <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-line bg-surface p-3 text-[11px] text-faint">
            {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
            >
              {t("error.retry")}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:opacity-90"
            >
              {t("error.reload")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
