import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager"
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener"
import { t } from "@/i18n"
import { logPath } from "@/lib/logger"
import { notify, notifyError } from "@/lib/notice"
import { usePalette } from "@/lib/store"
import type { Command, CommandTable } from "./types"

const WEBSITE = "https://reado.watermelon-studio.it"
const DISCORD = "https://discord.gg/HHqT9ucXn4"
const ISSUES = "https://github.com/WatermelonBros/reado/issues"
const RELEASES = "https://github.com/WatermelonBros/reado/releases"

const visit = (url: string): Command => ({ run: () => void openUrl(url) })

/** The Help menu: shortcuts, links out, and the log file. */
export const helpCommands: CommandTable = {
  "help:shortcuts": { run: () => usePalette.getState().toggleShortcuts(true) },
  "help:website": visit(WEBSITE),
  "help:discord": visit(DISCORD),
  "help:report": visit(ISSUES),
  "help:releases": visit(RELEASES),
  "help:revealLog": {
    run: () =>
      void logPath()
        .then((p) => {
          if (p) return revealItemInDir(p)
        })
        .catch(() => {}),
  },
  "help:copyLogPath": {
    run: () =>
      // Through the Tauri plugin, like every other copy in the command table. The web
      // Clipboard API needs a secure context and a user gesture the webview does
      // not always grant, and the failure came back as a rejected promise that
      // was then thrown away — the menu item did nothing and said nothing.
      void logPath()
        .then((p) => (p ? clipboardWriteText(p) : undefined))
        .then(() => notify("info", t("help.logPathCopied")))
        .catch((e) => notifyError("menu", t("help.logPathCopyFailed"), e)),
  },
}
