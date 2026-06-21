/** Settings panel: theme, theme mode, language, and code font. */
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useSettings, usePalette, THEMES, type ThemeName, type ThemeMode } from "../../lib/store";
import { useLocale, useT, type Locale, type MessageKey } from "../../i18n";
import { installCli, cliInstalled } from "../../lib/api";
import { checkForUpdates } from "../../lib/updater";
import { Select } from "../atoms/Select";
import { Drawer } from "../atoms/Drawer";
import { Checkbox } from "../atoms/Checkbox";
import { CloseIcon } from "../atoms/icons";

const FONT_PRESETS = [
  "JetBrains Mono",
  "SF Mono",
  "Cascadia Code",
  "Fira Code",
  "IBM Plex Mono",
  "Menlo",
];

export function Settings() {
  const open = usePalette((s) => s.settingsOpen);
  const toggle = usePalette((s) => s.toggleSettings);
  const settings = useSettings();
  const { locale, setLocale } = useLocale();
  const t = useT();

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => toggle(o)}
      ariaLabel={t("settings.title")}
      className="w-[min(420px,92vw)]"
    >
      <header className="flex flex-none items-center justify-between border-b border-line px-5 py-4">
        <h2 className="m-0 text-lg font-semibold">{t("settings.title")}</h2>
        <button
          type="button"
          aria-label={t("settings.close")}
          onClick={() => toggle(false)}
          className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <Field label={t("settings.themeMode")}>
            <Select
              value={settings.mode}
              onChange={(v) => settings.set({ mode: v as ThemeMode })}
              options={[
                { value: "manual", label: t("settings.mode.manual") },
                { value: "system", label: t("settings.mode.system") },
                { value: "auto", label: t("settings.mode.auto") },
              ]}
            />
          </Field>

          {settings.mode === "manual" ? (
            <Field label={t("settings.theme")}>
              <ThemeChoice
                value={settings.theme}
                onChange={(theme) => settings.set({ theme })}
                t={t}
              />
            </Field>
          ) : (
            <>
              <Field label={`${t("settings.theme")} · ${t("theme.reado-light")}`}>
                <ThemeChoice
                  value={settings.lightTheme}
                  onChange={(theme) => settings.set({ lightTheme: theme })}
                  filter={(theme) => theme.includes("light") || theme.includes("sepia")}
                  t={t}
                />
              </Field>
              <Field label={`${t("settings.theme")} · ${t("theme.reado-dark")}`}>
                <ThemeChoice
                  value={settings.darkTheme}
                  onChange={(theme) => settings.set({ darkTheme: theme })}
                  filter={(theme) => theme.includes("dark") || theme.includes("contrast")}
                  t={t}
                />
              </Field>
            </>
          )}

          <Field label={t("settings.language")}>
            <Select
              value={locale}
              onChange={(v) => setLocale(v as Locale)}
              options={[
                { value: "en", label: "English" },
                { value: "it", label: "Italiano" },
              ]}
            />
          </Field>

          <Field label={t("settings.codeFont")}>
            <Select
              value={settings.codeFont}
              onChange={(v) => settings.set({ codeFont: v })}
              options={[
                { value: "", label: "Default" },
                ...FONT_PRESETS.map((f) => ({
                  value: `"${f}", ui-monospace, monospace`,
                  label: f,
                })),
              ]}
            />
          </Field>

          <Field label={t("settings.notifications")}>
            <Checkbox
              checked={settings.completionSound}
              onChange={(v) => settings.set({ completionSound: v })}
              label={t("settings.completionSound")}
              className="text-sm text-muted"
            />
          </Field>

          <CliInstall />
          <AppVersion />
        </div>
    </Drawer>
  );
}

/** Install the bundled `reado` CLI onto the user's PATH (~/.local/bin). */
function CliInstall() {
  const t = useT();
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    cliInstalled().then(setInstalled).catch(() => setInstalled(false));
  }, []);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const path = await installCli();
      setInstalled(true);
      setResult({ ok: true, text: t("settings.cliDone", { path }) });
    } catch (e) {
      setResult({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">{t("settings.cli")}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink hover:bg-surface disabled:opacity-50"
        >
          {installed ? t("settings.cliReinstall") : t("settings.cliInstall")}
        </button>
        {installed && !result && <span className="text-xs text-faint">{t("settings.cliInstalled")}</span>}
      </div>
      <p className="text-xs leading-relaxed text-faint">{t("settings.cliHint")}</p>
      {result && (
        <p className={`text-xs leading-relaxed ${result.ok ? "text-faint" : "text-marker"}`}>
          {result.text}
        </p>
      )}
    </div>
  );
}

/** App version + a manual update check. */
function AppVersion() {
  const t = useT();
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);
  return (
    <div className="mt-2 flex items-center justify-between border-t border-line pt-4 text-xs">
      <span className="text-faint">
        Reado {version ? `v${version}` : "—"}
      </span>
      <button
        type="button"
        onClick={() => checkForUpdates(true)}
        className="rounded-md border border-line px-2 py-1 text-muted hover:border-line-strong hover:text-ink"
      >
        {t("settings.checkUpdates")}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

function ThemeChoice({
  value,
  onChange,
  filter,
  t,
}: {
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
  filter?: (theme: ThemeName) => boolean;
  t: ReturnType<typeof useT>;
}) {
  const options = filter ? THEMES.filter(filter) : THEMES;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
      {options.map((theme) => (
        <button
          key={theme}
          type="button"
          data-theme={theme}
          onClick={() => onChange(theme)}
          title={t(`theme.${theme}` as MessageKey)}
          className={`flex flex-col gap-2 rounded-md border p-2 ${
            value === theme
              ? "border-accent ring-1 ring-accent"
              : "border-line"
          }`}
        >
          <span className="flex h-[34px] items-center gap-1.5 rounded-sm border border-line bg-canvas px-2.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--syn-control)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--syn-string)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--marker)" }} />
          </span>
          <span className="text-left text-xs text-muted">
            {t(`theme.${theme}` as MessageKey)}
          </span>
        </button>
      ))}
    </div>
  );
}
