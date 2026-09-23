import { enableMcp } from "@/lib/mcp"
import { useOnboarding } from "@/lib/onboarding"
import {
  createProfile,
  deleteProfile,
  exportProfile,
  importProfile,
  renameProfile,
} from "@/lib/profiles"
import { saveSettingsToProject } from "@/lib/projectConfig"
import {
  exportSettings,
  exportSettingsToFile,
  importSettings,
  importSettingsFromFile,
} from "@/lib/settingsSync"
import { usePalette, useProject } from "@/lib/store"
import { checkForUpdates } from "@/lib/updater"
import type { CommandTable } from "./types"

/** Reado itself: settings, updates, onboarding, profiles and settings sync. */
export const appCommands: CommandTable = {
  settings: { run: () => usePalette.getState().toggleSettings(true) },
  "settings:json": { run: () => usePalette.getState().toggleSettingsJson(true) },
  checkUpdates: { run: () => void checkForUpdates(true) },
  "onboarding:open": { run: () => useOnboarding.getState().show() },
  "anywhere:open": { run: () => usePalette.getState().toggleAnywhere(true) },
  "mcp:enable": { run: () => void enableMcp(useProject.getState().root) },

  "profile:create": { run: () => void createProfile() },
  "profile:switch": { run: () => usePalette.getState().open("profiles") },
  "profile:rename": { run: () => void renameProfile() },
  "profile:delete": { run: () => void deleteProfile() },
  "profile:export": { run: () => void exportProfile() },
  "profile:import": { run: () => void importProfile() },

  "sync:export": { run: () => void exportSettings() },
  "sync:import": { run: () => void importSettings() },
  "sync:exportFile": { run: () => void exportSettingsToFile() },
  "sync:importFile": { run: () => void importSettingsFromFile() },
  "sync:saveToProject": { run: () => void saveSettingsToProject(useProject.getState().root) },
}
