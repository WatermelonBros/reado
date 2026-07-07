/** Settings drawer with a sidebar of tabs: Appearance, Editor, Files, System. */
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  useSettings,
  usePalette,
  THEMES,
  FONT_SIZE_RANGE,
  LINE_HEIGHT_RANGE,
  type ThemeName,
  type ThemeMode,
  type SettingsState,
} from "../../lib/store";
import { useLocale, type Locale, type MessageKey } from "../../i18n";
import { installCli, cliInstalled } from "../../lib/api";
import { checkForUpdates } from "../../lib/updater";
import { logPath } from "../../lib/logger";
import { useTourGuide } from "../../lib/tour";
import { makeDefaultApp } from "../../lib/defaults";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Select } from "../atoms/Select";
import { Drawer } from "../atoms/Drawer";
import { Checkbox } from "../atoms/Checkbox";
import { SegmentedControl } from "../atoms/SegmentedControl";
import { CloseIcon } from "../atoms/icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

const FONT_PRESETS = [
  "JetBrains Mono",
  "SF Mono",
  "Cascadia Code",
  "Fira Code",
  "IBM Plex Mono",
  "Menlo",
];

type TabId = "appearance" | "editor" | "interface" | "files" | "system";

const TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "appearance", labelKey: "settings.tabs.appearance" },
  { id: "editor", labelKey: "settings.tabs.editor" },
  { id: "interface", labelKey: "settings.tabs.interface" },
  { id: "files", labelKey: "settings.tabs.files" },
  { id: "system", labelKey: "settings.tabs.system" },
];

export function Settings() {
  const open = usePalette((s) => s.settingsOpen);
  const toggle = usePalette((s) => s.toggleSettings);
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("appearance");

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => toggle(o)}
      ariaLabel={t("settings.title")}
      className="w-[min(720px,94vw)]"
    >
      <header className="flex flex-none items-center justify-between border-b border-line px-6 py-4">
        <h2 className="m-0 text-lg font-semibold">{t("settings.title")}</h2>
        <button
          type="button"
          title={t("settings.close")}
          aria-label={t("settings.close")}
          onClick={() => toggle(false)}
          className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Tab rail — the active thumb slides between tabs. */}
        <SegmentedControl
          value={tab}
          onChange={setTab}
          orientation="vertical"
          segments={TABS.map(({ id, labelKey }) => ({ id, label: t(labelKey) }))}
          ariaLabel={t("settings.title")}
          className="w-40 flex-none gap-0.5 border-r border-line p-2"
          segmentClassName="rounded-md px-3 py-1.5 text-left text-sm"
          thumbClassName="bg-surface rounded-md"
        />

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-6 py-6">
            {tab === "appearance" && <AppearanceTab />}
            {tab === "editor" && <EditorTab />}
            {tab === "interface" && <InterfaceTab />}
            {tab === "files" && <FilesTab />}
            {tab === "system" && <SystemTab />}
          </div>
          <AppVersion />
        </div>
      </div>
    </Drawer>
  );
}

function AppearanceTab() {
  const settings = useSettings();
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();

  return (
    <>
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
    </>
  );
}

function EditorTab() {
  const settings = useSettings();
  const { t } = useTranslation();

  return (
    <>
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

      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label={t("settings.fontSize")}
          value={settings.fontSize}
          min={FONT_SIZE_RANGE.min}
          max={FONT_SIZE_RANGE.max}
          step={1}
          onCommit={(n) => settings.set({ fontSize: n })}
        />
        <NumberField
          label={t("settings.lineHeight")}
          value={settings.lineHeight}
          min={LINE_HEIGHT_RANGE.min}
          max={LINE_HEIGHT_RANGE.max}
          step={0.05}
          onCommit={(n) => settings.set({ lineHeight: n })}
        />
      </div>

      <NumberField
        label={t("settings.ruler")}
        value={settings.rulerColumn}
        min={0}
        max={200}
        step={1}
        onCommit={(n) => settings.set({ rulerColumn: n })}
        hint={t("settings.rulerHint")}
      />

      <Field label={t("settings.lineNumbers")}>
        <Select
          value={settings.lineNumbers}
          onChange={(v) => settings.set({ lineNumbers: v as SettingsState["lineNumbers"] })}
          options={[
            { value: "off", label: t("settings.lineNumbersOff") },
            { value: "on", label: t("settings.lineNumbersOn") },
            { value: "relative", label: t("settings.lineNumbersRelative") },
          ]}
        />
      </Field>

      <Field label={t("settings.activeLine")}>
        <Select
          value={settings.activeLine}
          onChange={(v) => settings.set({ activeLine: v as SettingsState["activeLine"] })}
          options={[
            { value: "off", label: t("settings.activeLineOff") },
            { value: "gutter", label: t("settings.activeLineGutter") },
            { value: "line", label: t("settings.activeLineLine") },
            { value: "both", label: t("settings.activeLineBoth") },
          ]}
        />
      </Field>

      <Field label={t("settings.indentGuides")}>
        <Select
          value={settings.indentGuides}
          onChange={(v) => settings.set({ indentGuides: v as SettingsState["indentGuides"] })}
          options={[
            { value: "off", label: t("settings.indentGuidesOff") },
            { value: "all", label: t("settings.indentGuidesAll") },
            { value: "active", label: t("settings.indentGuidesActive") },
          ]}
        />
      </Field>

      <Field label={t("settings.autoSave")}>
        <Select
          value={settings.autoSave}
          onChange={(v) => settings.set({ autoSave: v as SettingsState["autoSave"] })}
          options={[
            { value: "off", label: t("settings.autoSaveOff") },
            { value: "afterDelay", label: t("settings.autoSaveAfterDelay") },
            { value: "onFocusChange", label: t("settings.autoSaveOnFocusChange") },
          ]}
        />
      </Field>

      <Section title={t("settings.aids")}>
        <ToggleField
          checked={settings.wrap}
          onChange={(v) => settings.set({ wrap: v })}
          label={t("editor.wrap")}
          hint={t("settings.wrapHint")}
        />
        <ToggleField
          checked={settings.stickyScroll}
          onChange={(v) => settings.set({ stickyScroll: v })}
          label={t("editor.sticky")}
          hint={t("settings.stickyHint")}
        />
        <ToggleField
          checked={settings.renderWhitespace}
          onChange={(v) => settings.set({ renderWhitespace: v })}
          label={t("settings.renderWhitespace")}
          hint={t("settings.whitespaceHint")}
        />
        <ToggleField
          checked={settings.bracketMatching}
          onChange={(v) => settings.set({ bracketMatching: v })}
          label={t("settings.bracketMatching")}
          hint={t("settings.bracketMatchingHint")}
        />
        <ToggleField
          checked={settings.focusMode}
          onChange={(v) => settings.set({ focusMode: v })}
          label={t("editor.focus")}
          hint={t("settings.focusHint")}
        />
      </Section>
    </>
  );
}

const ZOOM_PRESETS = [0.9, 1, 1.1, 1.25, 1.5];

function InterfaceTab() {
  const settings = useSettings();
  const { t } = useTranslation();
  const zoomValues = ZOOM_PRESETS.includes(settings.zoom)
    ? ZOOM_PRESETS
    : [...ZOOM_PRESETS, settings.zoom].sort((a, b) => a - b);

  return (
    <>
      <Field label={t("settings.zoom")}>
        <Select
          value={String(settings.zoom)}
          onChange={(v) => settings.set({ zoom: Number(v) })}
          options={zoomValues.map((z) => ({ value: String(z), label: `${Math.round(z * 100)}%` }))}
        />
      </Field>

      <Field label={t("settings.reduceMotion")}>
        <Select
          value={settings.reduceMotion}
          onChange={(v) => settings.set({ reduceMotion: v as SettingsState["reduceMotion"] })}
          options={[
            { value: "system", label: t("settings.reduceMotionSystem") },
            { value: "on", label: t("settings.reduceMotionOn") },
            { value: "off", label: t("settings.reduceMotionOff") },
          ]}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t("settings.cursorStyle")}>
          <Select
            value={settings.cursorStyle}
            onChange={(v) => settings.set({ cursorStyle: v as SettingsState["cursorStyle"] })}
            options={[
              { value: "line", label: t("settings.cursorLine") },
              { value: "block", label: t("settings.cursorBlock") },
              { value: "underline", label: t("settings.cursorUnderline") },
            ]}
          />
        </Field>
        <Field label={t("settings.cursorBlink")}>
          <Select
            value={settings.cursorBlink}
            onChange={(v) => settings.set({ cursorBlink: v as SettingsState["cursorBlink"] })}
            options={[
              { value: "blink", label: t("settings.cursorBlinkBlink") },
              { value: "smooth", label: t("settings.cursorBlinkSmooth") },
              { value: "solid", label: t("settings.cursorBlinkSolid") },
            ]}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t("settings.tabBar")}>
          <Select
            value={settings.tabBar}
            onChange={(v) => settings.set({ tabBar: v as SettingsState["tabBar"] })}
            options={[
              { value: "multiple", label: t("settings.tabBarMultiple") },
              { value: "single", label: t("settings.tabBarSingle") },
              { value: "hidden", label: t("settings.tabBarHidden") },
            ]}
          />
        </Field>
        <Field label={t("settings.scrollbar")}>
          <Select
            value={settings.scrollbar}
            onChange={(v) => settings.set({ scrollbar: v as SettingsState["scrollbar"] })}
            options={[
              { value: "auto", label: t("settings.scrollbarAuto") },
              { value: "always", label: t("settings.scrollbarAlways") },
              { value: "hidden", label: t("settings.scrollbarHidden") },
            ]}
          />
        </Field>
      </div>

      <Field label={t("settings.fileIcons")}>
        <Select
          value={settings.fileIcons}
          onChange={(v) => settings.set({ fileIcons: v as SettingsState["fileIcons"] })}
          options={[
            { value: "off", label: t("settings.fileIconsOff") },
            { value: "mono", label: t("settings.fileIconsMono") },
            { value: "colored", label: t("settings.fileIconsColored") },
          ]}
        />
        <p className="text-xs leading-relaxed text-faint">{t("settings.fileIconsHint")}</p>
      </Field>

      <Section title={t("settings.chrome")}>
        <Checkbox
          checked={settings.showActivityBar}
          onChange={(v) => settings.set({ showActivityBar: v })}
          label={t("settings.showActivityBar")}
          className="text-sm text-muted"
        />
        <Checkbox
          checked={settings.showStatusBar}
          onChange={(v) => settings.set({ showStatusBar: v })}
          label={t("settings.showStatusBar")}
          className="text-sm text-muted"
        />
        <Checkbox
          checked={settings.showBreadcrumbs}
          onChange={(v) => settings.set({ showBreadcrumbs: v })}
          label={t("settings.showBreadcrumbs")}
          className="text-sm text-muted"
        />
        <Checkbox
          checked={settings.showRibbon}
          onChange={(v) => settings.set({ showRibbon: v })}
          label={t("editor.ribbon")}
          className="text-sm text-muted"
        />
      </Section>
    </>
  );
}

function FilesTab() {
  const settings = useSettings();
  const { t } = useTranslation();

  return (
    <>
      <ExcludeGlobs
        value={settings.excludeGlobs}
        onCommit={(g) => settings.set({ excludeGlobs: g })}
      />
      <ToggleField
        checked={settings.restoreSession}
        onChange={(v) => settings.set({ restoreSession: v })}
        label={t("settings.restoreSession")}
        hint={t("settings.restoreSessionHint")}
      />
      <Section title={t("settings.onSave")}>
        <ToggleField
          checked={settings.trimTrailingWhitespace}
          onChange={(v) => settings.set({ trimTrailingWhitespace: v })}
          label={t("settings.trimTrailingWhitespace")}
          hint={t("settings.trimTrailingWhitespaceHint")}
        />
        <ToggleField
          checked={settings.insertFinalNewline}
          onChange={(v) => settings.set({ insertFinalNewline: v })}
          label={t("settings.insertFinalNewline")}
          hint={t("settings.insertFinalNewlineHint")}
        />
      </Section>
    </>
  );
}

/** Editable list of exclude globs — one per line, committed on blur so the tree
 *  doesn't re-list on every keystroke. */
function ExcludeGlobs({ value, onCommit }: { value: string[]; onCommit: (g: string[]) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value.join("\n"));
  useEffect(() => setDraft(value.join("\n")), [value]);
  const commit = () =>
    onCommit(
      draft
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  return (
    <Field label={t("settings.exclude")}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={4}
        spellCheck={false}
        placeholder={"node_modules\ndist\n*.log"}
        className="w-full resize-y rounded-md border border-line bg-canvas px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-line-strong"
      />
      <span className="text-xs leading-relaxed text-faint">{t("settings.excludeHint")}</span>
    </Field>
  );
}

function SystemTab() {
  const settings = useSettings();
  const { t } = useTranslation();

  return (
    <>
      <Section title={t("settings.review")}>
        <ToggleField
          checked={settings.showResolvedComments}
          onChange={(v) => settings.set({ showResolvedComments: v })}
          label={t("settings.showResolvedComments")}
          hint={t("settings.showResolvedCommentsHint")}
        />
        <ToggleField
          checked={settings.inlineDiagnostics}
          onChange={(v) => settings.set({ inlineDiagnostics: v })}
          label={t("settings.inlineDiagnostics")}
          hint={t("settings.inlineDiagnosticsHint")}
        />
      </Section>

      <Field label={t("settings.notifications")}>
        <Checkbox
          checked={settings.completionSound}
          onChange={(v) => settings.set({ completionSound: v })}
          label={t("settings.completionSound")}
          className="text-sm text-muted"
        />
      </Field>

      <DefaultApp />
      <LoggingSettings />
      <CliInstall />
    </>
  );
}

/** Make Reado the OS default for text/source files. */
function DefaultApp() {
  const { t } = useTranslation();
  return (
    <Section title={t("defaultApp.title")}>
      <button
        type="button"
        onClick={() => void makeDefaultApp()}
        className="self-start rounded-md border border-line px-2.5 py-1.5 text-sm text-ink hover:bg-surface"
      >
        {t("defaultApp.set")}
      </button>
      <p className="text-xs leading-relaxed text-faint">{t("defaultApp.hint")}</p>
    </Section>
  );
}

/** Diagnostic logging: enable toggle, detail level, and the file location. */
function LoggingSettings() {
  const { t } = useTranslation();
  const settings = useSettings();
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    logPath().then(setPath).catch(() => {});
  }, []);

  return (
    <Section title={t("settings.logging")}>
      <Checkbox
        checked={settings.logEnabled}
        onChange={(v) => settings.set({ logEnabled: v })}
        label={t("settings.logEnabled")}
        className="text-sm text-muted"
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">{t("settings.logLevel")}</span>
        <Select
          value={settings.logLevel}
          onChange={(v) => settings.set({ logLevel: v as SettingsState["logLevel"] })}
          options={[
            { value: "error", label: "Error" },
            { value: "warn", label: "Warn" },
            { value: "info", label: "Info" },
            { value: "debug", label: "Debug" },
            { value: "trace", label: "Trace" },
          ]}
        />
      </label>
      {/* The log-file cluster reads as one unit: buttons, its path, and the note. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => path && void revealItemInDir(path).catch(() => {})}
            disabled={!path}
            className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink hover:bg-surface disabled:opacity-50"
          >
            {t("settings.logReveal")}
          </button>
          <button
            type="button"
            onClick={() => path && void navigator.clipboard.writeText(path).catch(() => {})}
            disabled={!path}
            className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink hover:bg-surface disabled:opacity-50"
          >
            {t("settings.logCopyPath")}
          </button>
        </div>
        {path && <p className="break-all text-xs leading-relaxed text-faint">{path}</p>}
        <p className="text-xs leading-relaxed text-faint">{t("settings.logHint")}</p>
      </div>
    </Section>
  );
}

/** Install the bundled `reado` CLI onto the user's PATH (~/.local/bin). */
function CliInstall() {
  const { t } = useTranslation();
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
    <Section title={t("settings.cli")}>
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
    </Section>
  );
}

/** App version + a manual update check. */
function AppVersion() {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);
  return (
    <div className="flex flex-none items-center justify-between border-t border-line px-6 py-3 text-xs">
      <span className="text-faint">
        Reado {version ? `v${version}` : "—"}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            usePalette.getState().toggleSettings(false);
            useTourGuide.getState().run();
          }}
          className="rounded-md border border-line px-2 py-1 text-muted hover:border-line-strong hover:text-ink"
        >
          {t("tour.replay")}
        </button>
        <button
          type="button"
          onClick={() => usePalette.getState().toggleShortcuts(true)}
          className="rounded-md border border-line px-2 py-1 text-muted hover:border-line-strong hover:text-ink"
        >
          {t("settings.shortcuts")}
        </button>
        <button
          type="button"
          onClick={() => checkForUpdates(true)}
          className="rounded-md border border-line px-2 py-1 text-muted hover:border-line-strong hover:text-ink"
        >
          {t("settings.checkUpdates")}
        </button>
      </div>
    </div>
  );
}

/** Uppercase "eyebrow" label shared by every settings section header. */
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted";

/** A single labelled control (label wraps the input for a clean click target). */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2.5">
      <span className={EYEBROW}>{label}</span>
      {children}
    </label>
  );
}

/** A grouped section (heading + arbitrary content) for multi-control blocks. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <span className={EYEBROW}>{title}</span>
      {children}
    </section>
  );
}

/** A checkbox with a one-line description beneath it (aligned past the box), so
 *  a terse toggle explains what it does — and when its effect is visible. */
function ToggleField({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Checkbox checked={checked} onChange={onChange} label={label} className="text-sm text-ink" />
      <span className="pl-[22px] text-xs leading-relaxed text-faint">{hint}</span>
    </div>
  );
}

/** A clamped numeric field: free typing, committed (and clamped) on blur/Enter. */
function NumberField({
  label,
  value,
  min,
  max,
  step,
  onCommit,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (n: number) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    onCommit(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value);
  };
  return (
    <Field label={label}>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm text-ink outline-none focus:border-line-strong"
      />
      {hint && <span className="text-xs leading-relaxed text-faint">{hint}</span>}
    </Field>
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
  t: TFunction;
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
          aria-pressed={value === theme}
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
