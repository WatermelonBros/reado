import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { Checkbox } from "@/components/atoms/Checkbox"
import { Input } from "@/components/atoms/Input"
import { Select } from "@/components/atoms/Select"
import { cliInstalled, installCli, mascotMonitors } from "@/lib/api"
import { makeDefaultApp } from "@/lib/defaults"
import { logPath } from "@/lib/logger"
import { notify, notifyError } from "@/lib/notice"
import { type DEFAULTS, type SettingsState, useSettings } from "@/lib/store"
import { Field, LinesField, NumberField, Section, ToggleField } from "./fields"

export function SystemTab() {
  const settings = useSettings()
  const { t } = useTranslation()

  return (
    <>
      <Section id="review" title={t("settings.review")}>
        <ToggleField
          settingKey="showResolvedComments"
          checked={settings.showResolvedComments}
          onChange={(v) => settings.set({ showResolvedComments: v })}
          label={t("settings.showResolvedComments")}
          hint={t("settings.showResolvedCommentsHint")}
        />
        <ToggleField
          settingKey="inlineDiagnostics"
          checked={settings.inlineDiagnostics}
          onChange={(v) => settings.set({ inlineDiagnostics: v })}
          label={t("settings.inlineDiagnostics")}
          hint={t("settings.inlineDiagnosticsHint")}
        />
      </Section>

      <Section id="notifications" title={t("settings.notifications")}>
        <Checkbox
          checked={settings.completionSound}
          onChange={(v) => settings.set({ completionSound: v })}
          label={t("settings.completionSound")}
          className="text-sm text-muted"
        />
        <ToggleField
          settingKey="mascot"
          checked={settings.mascot}
          onChange={(v) => settings.set({ mascot: v })}
          label={t("settings.mascot")}
          hint={t("settings.mascotHint")}
        />
        {settings.mascot && (
          <>
            <Field label={t("settings.mascotCorner")} settingKey="mascotCorner">
              <Select
                value={settings.mascotCorner}
                onChange={(v) => settings.set({ mascotCorner: v as typeof DEFAULTS.mascotCorner })}
                options={[
                  { value: "bottom-right", label: t("settings.cornerBottomRight") },
                  { value: "bottom-left", label: t("settings.cornerBottomLeft") },
                  { value: "top-right", label: t("settings.cornerTopRight") },
                  { value: "top-left", label: t("settings.cornerTopLeft") },
                ]}
                ariaLabel={t("settings.mascotCorner")}
              />
            </Field>
            <MascotMonitorField />
            <Field label={t("settings.mascotSize")} settingKey="mascotSize">
              {/* A native range: dragging a size and watching it change is the
                  whole interaction, and the platform's own control does it with
                  keyboard support and a11y for free. */}
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={90}
                  max={240}
                  step={10}
                  value={settings.mascotSize}
                  aria-label={t("settings.mascotSize")}
                  onChange={(e) => settings.set({ mascotSize: Number(e.target.value) })}
                  className="flex-1 accent-accent"
                />
                <span className="w-12 text-right text-xs tabular-nums text-faint">
                  {settings.mascotSize}px
                </span>
              </div>
            </Field>
          </>
        )}
      </Section>

      <TerminalSettings />
      <DefaultApp />
      <LoggingSettings />
      <CliInstall />
    </>
  )
}

/** Which display the companion is parked on. The list comes from the OS, so a
 *  screen unplugged since the choice was made simply isn't offered — the stored
 *  name stays, and the backend falls back to the main window's screen until it
 *  comes back. */
function MascotMonitorField() {
  const monitor = useSettings((s) => s.mascotMonitor)
  const { t } = useTranslation()
  const [monitors, setMonitors] = useState<string[]>([])
  useEffect(() => {
    mascotMonitors()
      .then(setMonitors)
      .catch(() => setMonitors([]))
  }, [])
  // One screen is not a choice.
  if (monitors.length < 2) return null
  return (
    <Field label={t("settings.mascotMonitor")} settingKey="mascotMonitor">
      <Select
        value={monitor}
        onChange={(v) => useSettings.getState().set({ mascotMonitor: v })}
        options={[
          { value: "", label: t("settings.mascotMonitorAuto") },
          ...monitors.map((m) => ({ value: m, label: m })),
        ]}
        ariaLabel={t("settings.mascotMonitor")}
      />
    </Field>
  )
}

/** The integrated terminal's own appearance and shell. Its font family follows
 *  the editor's; everything else here is the terminal's alone. */
function TerminalSettings() {
  const settings = useSettings()
  const { t } = useTranslation()
  return (
    <Section id="terminal" title={t("settings.terminal")}>
      <NumberField
        settingKey="terminalFontSize"
        label={t("settings.terminalFontSize")}
        value={settings.terminalFontSize}
        min={8}
        max={24}
        step={1}
        onCommit={(n) => settings.set({ terminalFontSize: n })}
      />
      <NumberField
        settingKey="terminalScrollback"
        label={t("settings.terminalScrollback")}
        value={settings.terminalScrollback}
        min={200}
        max={100000}
        step={500}
        onCommit={(n) => settings.set({ terminalScrollback: n })}
      />
      <Field label={t("settings.terminalCursor")} settingKey="terminalCursorStyle">
        <Select
          value={settings.terminalCursorStyle}
          onChange={(v) =>
            settings.set({ terminalCursorStyle: v as SettingsState["terminalCursorStyle"] })
          }
          options={[
            { value: "block", label: t("settings.cursorBlock") },
            { value: "bar", label: t("settings.cursorBar") },
            { value: "underline", label: t("settings.cursorUnderline") },
          ]}
        />
      </Field>
      <Field label={t("settings.terminalShell")} settingKey="terminalShell">
        <Input
          value={settings.terminalShell}
          onChange={(e) => settings.set({ terminalShell: e.target.value })}
          placeholder="/bin/zsh"
          spellCheck={false}
          className="bg-canvas font-mono text-xs"
        />
        <span className="text-xs leading-relaxed text-faint">
          {t("settings.terminalShellHint")}
        </span>
      </Field>
      <LinesField
        settingKey="terminalProfiles"
        label={t("settings.terminalProfiles")}
        value={settings.terminalProfiles}
        onCommit={(lines) => settings.set({ terminalProfiles: lines })}
        rows={3}
        placeholder={"Node REPL = node\nContainer = docker exec -it app sh"}
        hint={t("settings.terminalProfilesHint")}
      />
      {settings.terminalProfiles.length > 0 && (
        <Field label={t("settings.defaultTerminalProfile")} settingKey="defaultTerminalProfile">
          <Input
            value={settings.defaultTerminalProfile}
            onChange={(e) => settings.set({ defaultTerminalProfile: e.target.value })}
            placeholder="Node REPL"
            spellCheck={false}
            className="bg-canvas font-mono text-xs"
          />
          <span className="text-xs leading-relaxed text-faint">
            {t("settings.defaultTerminalProfileHint")}
          </span>
        </Field>
      )}
      {/* Only with an override: the default shell's `-il` is chosen for it, and
        an arguments box that does nothing is worse than no box. */}
      {settings.terminalShell.trim() !== "" && (
        <LinesField
          settingKey="terminalShellArgs"
          label={t("settings.terminalShellArgs")}
          value={settings.terminalShellArgs}
          onCommit={(a) => settings.set({ terminalShellArgs: a })}
          rows={2}
          placeholder={"-l\n-i"}
          hint={t("settings.terminalShellArgsHint")}
        />
      )}
    </Section>
  )
}

/** Make Reado the OS default for text/source files. */
function DefaultApp() {
  const { t } = useTranslation()
  return (
    <Section title={t("defaultApp.title")}>
      <Button variant="secondary" onClick={() => void makeDefaultApp()} className="self-start">
        {t("defaultApp.set")}
      </Button>
      <p className="text-xs leading-relaxed text-faint">{t("defaultApp.hint")}</p>
    </Section>
  )
}

/** Diagnostic logging: enable toggle, detail level, and the file location. */
function LoggingSettings() {
  const { t } = useTranslation()
  const settings = useSettings()
  const [path, setPath] = useState<string | null>(null)

  useEffect(() => {
    logPath()
      .then(setPath)
      .catch(() => {})
  }, [])

  return (
    <Section id="logging" title={t("settings.logging")}>
      <Checkbox
        checked={settings.logEnabled}
        onChange={(v) => settings.set({ logEnabled: v })}
        label={t("settings.logEnabled")}
        className="text-sm text-muted"
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">{t("settings.logLevel")}</span>
        <Select
          value={settings.logLevel}
          ariaLabel={t("settings.logLevel")}
          onChange={(v) => settings.set({ logLevel: v as SettingsState["logLevel"] })}
          options={[
            { value: "error", label: "Error" },
            { value: "warn", label: "Warn" },
            { value: "info", label: "Info" },
            { value: "debug", label: "Debug" },
            { value: "trace", label: "Trace" },
          ]}
        />
      </div>
      {/* The log-file cluster reads as one unit: buttons, its path, and the note. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => path && void revealItemInDir(path).catch(() => {})}
            disabled={!path}
          >
            {t("settings.logReveal")}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              path &&
              void clipboardWriteText(path)
                .then(() => notify("info", t("help.logPathCopied")))
                .catch((e) => notifyError("settings", t("help.logPathCopyFailed"), e))
            }
            disabled={!path}
          >
            {t("settings.logCopyPath")}
          </Button>
        </div>
        {path && <p className="break-all text-xs leading-relaxed text-faint">{path}</p>}
        <p className="text-xs leading-relaxed text-faint">{t("settings.logHint")}</p>
      </div>
    </Section>
  )
}

/** Install the bundled `reado` CLI onto the user's PATH (~/.local/bin). */
function CliInstall() {
  const { t } = useTranslation()
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    cliInstalled()
      .then(setInstalled)
      .catch(() => setInstalled(false))
  }, [])

  const run = async () => {
    setBusy(true)
    setResult(null)
    try {
      const path = await installCli()
      setInstalled(true)
      setResult({ ok: true, text: t("settings.cliDone", { path }) })
    } catch (e) {
      setResult({ ok: false, text: String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="cli" title={t("settings.cli")}>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={run} disabled={busy}>
          {installed ? t("settings.cliReinstall") : t("settings.cliInstall")}
        </Button>
        {installed && !result && (
          <span className="text-xs text-faint">{t("settings.cliInstalled")}</span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-faint">{t("settings.cliHint")}</p>
      {result && (
        <p className={`text-xs leading-relaxed ${result.ok ? "text-faint" : "text-marker"}`}>
          {result.text}
        </p>
      )}
    </Section>
  )
}
