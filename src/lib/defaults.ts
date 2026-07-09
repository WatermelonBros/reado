/**
 * "Make Reado the default app for text files."
 *
 * The extension list mirrors the file associations declared in
 * `src-tauri/tauri.conf.json`. `makeDefaultApp` calls the backend (which does the
 * platform-appropriate thing) and surfaces the outcome as a notice.
 */
import { setDefaultHandler } from "./api";
import { notify, notifyError } from "./notice";
import { t } from "../i18n";

/** Text/source extensions Reado offers to become the default handler for. */
export const TEXT_EXTENSIONS = [
  "txt", "text", "md", "markdown", "mdx", "log", "rst", "adoc",
  "json", "jsonc", "yaml", "yml", "toml", "ini", "cfg", "conf", "env",
  "csv", "tsv", "xml", "svg",
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rs", "go", "rb", "java", "kt", "kts", "scala",
  "c", "h", "cpp", "cc", "hpp", "cs", "php", "swift", "m",
  "sh", "bash", "zsh", "fish", "ps1", "bat",
  "sql", "graphql", "proto",
  "html", "htm", "css", "scss", "sass", "less",
  "vue", "svelte", "astro", "lua", "dart", "r", "pl", "ex", "exs",
];

/** Ask the OS to make Reado the default for text files, then notify the user. */
export async function makeDefaultApp(): Promise<void> {
  try {
    const res = await setDefaultHandler(TEXT_EXTENSIONS);
    if (res.kind === "set") notify("info", t("defaultApp.done", { count: res.count }));
    else if (res.kind === "settings") notify("info", t("defaultApp.settings"));
    else notify("info", t("defaultApp.manual"));
  } catch (e) {
    notifyError("defaults", t("defaultApp.failed"), e);
  }
}
