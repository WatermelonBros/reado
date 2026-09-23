import { useTranslation } from "react-i18next"
import { Select } from "@/components/atoms/Select"
import { DEFAULT_NESTING } from "@/lib/fileNesting"
import { type SettingsState, useProject, useSettings } from "@/lib/store"
import { Field, LinesField, NumberField, Section, ToggleField } from "./fields"

export function FilesTab() {
  const settings = useSettings()
  const isRepo = useProject((s) => s.git.isRepo)
  const { t } = useTranslation()

  return (
    <>
      <Section id="project" title={t("settings.project")}>
        <LinesField
          settingKey="excludeGlobs"
          label={t("settings.exclude")}
          value={settings.excludeGlobs}
          onCommit={(g) => settings.set({ excludeGlobs: g })}
          placeholder={"node_modules\ndist\n*.log"}
          hint={t("settings.excludeHint")}
        />
        <LinesField
          settingKey="searchExcludeGlobs"
          label={t("settings.searchExclude")}
          value={settings.searchExcludeGlobs}
          onCommit={(g) => settings.set({ searchExcludeGlobs: g })}
          rows={3}
          placeholder={"**/*.snap\n**/fixtures/**"}
          hint={t("settings.searchExcludeHint")}
        />
        <ToggleField
          settingKey="fileNesting"
          checked={settings.fileNesting}
          onChange={(v) => settings.set({ fileNesting: v })}
          label={t("settings.fileNesting")}
          hint={t("settings.fileNestingHint")}
        />
        {settings.fileNesting && (
          <LinesField
            settingKey="fileNestingRules"
            label={t("settings.fileNestingRules")}
            value={settings.fileNestingRules}
            onCommit={(rules) => settings.set({ fileNestingRules: rules })}
            rows={5}
            placeholder={DEFAULT_NESTING.join("\n")}
            hint={t("settings.fileNestingRulesHint")}
          />
        )}
        <Field label={t("settings.explorerSort")} settingKey="explorerSort">
          <Select
            value={settings.explorerSort}
            onChange={(v) => settings.set({ explorerSort: v as SettingsState["explorerSort"] })}
            options={[
              { value: "name", label: t("tree.sortName") },
              { value: "type", label: t("tree.sortType") },
              { value: "modified", label: t("tree.sortModified") },
            ]}
          />
          <p className="text-xs leading-relaxed text-faint">{t("settings.explorerSortHint")}</p>
        </Field>
        <ToggleField
          settingKey="restoreSession"
          checked={settings.restoreSession}
          onChange={(v) => settings.set({ restoreSession: v })}
          label={t("settings.restoreSession")}
          hint={t("settings.restoreSessionHint")}
        />
        <NumberField
          settingKey="largeFileGuardMb"
          label={t("settings.largeFileGuard")}
          value={settings.largeFileGuardMb}
          min={0}
          max={64}
          step={1}
          onCommit={(v) => settings.set({ largeFileGuardMb: v })}
          hint={t("settings.largeFileGuardHint")}
        />
      </Section>

      <Section id="onSave" title={t("settings.onSave")}>
        <ToggleField
          settingKey="formatOnSave"
          checked={settings.formatOnSave}
          onChange={(v) => settings.set({ formatOnSave: v })}
          label={t("settings.formatOnSave")}
          hint={t("settings.formatOnSaveHint")}
        />
        <ToggleField
          settingKey="formatOnPaste"
          checked={settings.formatOnPaste}
          onChange={(v) => settings.set({ formatOnPaste: v })}
          label={t("settings.formatOnPaste")}
          hint={t("settings.formatOnPasteHint")}
        />
        <ToggleField
          settingKey="formatOnType"
          checked={settings.formatOnType}
          onChange={(v) => settings.set({ formatOnType: v })}
          label={t("settings.formatOnType")}
          hint={t("settings.formatOnTypeHint")}
        />
        <ToggleField
          settingKey="trimTrailingWhitespace"
          checked={settings.trimTrailingWhitespace}
          onChange={(v) => settings.set({ trimTrailingWhitespace: v })}
          label={t("settings.trimTrailingWhitespace")}
          hint={t("settings.trimTrailingWhitespaceHint")}
        />
        <ToggleField
          settingKey="insertFinalNewline"
          checked={settings.insertFinalNewline}
          onChange={(v) => settings.set({ insertFinalNewline: v })}
          label={t("settings.insertFinalNewline")}
          hint={t("settings.insertFinalNewlineHint")}
        />
        <p className="text-xs leading-relaxed text-faint">{t("settings.editorconfigNote")}</p>
        {/* Files Reado creates. An existing file keeps whatever it already has —
          the status bar converts that one, per document. */}
        <Field label={t("settings.defaultEol")} settingKey="defaultEol">
          <Select
            value={settings.defaultEol}
            onChange={(v) => settings.set({ defaultEol: v as SettingsState["defaultEol"] })}
            options={[
              { value: "auto", label: t("settings.defaultEolAuto") },
              { value: "LF", label: "LF" },
              { value: "CRLF", label: "CRLF" },
            ]}
          />
        </Field>
      </Section>
      {/* Repo-gated: both read git, so outside a repository they would be two
        switches that do nothing. */}
      {isRepo && (
        <Section id="gitSignals" title={t("settings.gitSignals")}>
          <ToggleField
            settingKey="inlineBlame"
            checked={settings.inlineBlame}
            onChange={(v) => settings.set({ inlineBlame: v })}
            label={t("settings.inlineBlame")}
            hint={t("settings.inlineBlameHint")}
          />
          <ToggleField
            settingKey="diffGutter"
            checked={settings.diffGutter}
            onChange={(v) => settings.set({ diffGutter: v })}
            label={t("settings.diffGutter")}
            hint={t("settings.diffGutterHint")}
          />
        </Section>
      )}
    </>
  )
}
