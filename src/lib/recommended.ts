/**
 * Extensions a project recommends, in `.reado/extensions.json`.
 *
 * Same shape as VS Code's `.vscode/extensions.json` (`{ "recommendations": [...] }`)
 * so a repository can keep one list. The point is the first five minutes with an
 * unfamiliar codebase: "this project is Terraform and Svelte, here is what makes
 * it readable" is knowledge the repository has and the newcomer doesn't.
 *
 * Advisory only — nothing is installed without being asked for.
 */
import { t } from "@/i18n"
import { readReadoFile } from "./api"
import { createLogger, safeError } from "./logger"
import { useMarketplace } from "./marketplace"
import { notify } from "./notice"
import { useWorkspace } from "./store"

const log = createLogger("recommended")

/** The file a project lists its recommendations in. */
export const RECOMMENDED_FILE = "extensions.json"

/** Projects already mentioned this session, so reopening a tab doesn't re-nag. */
const seen = new Set<string>()

/** Parse a recommendations file into extension ids (`namespace.name`). */
export function parseRecommendations(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as { recommendations?: unknown }
    const list = parsed?.recommendations
    if (!Array.isArray(list)) return []
    return list.filter(
      (id): id is string => typeof id === "string" && /^[^.\s]+\.[^.\s]+$/.test(id),
    )
  } catch (e) {
    log.warn("malformed extensions.json, ignoring", { error: safeError(e) })
    return []
  }
}

/** The recommendations this project makes that aren't installed yet. */
export async function missingRecommendations(root: string): Promise<string[]> {
  const json = await readReadoFile(root, RECOMMENDED_FILE).catch(() => null)
  if (!json) return []
  const installed = new Set(useMarketplace.getState().installed.map((e) => e.id.toLowerCase()))
  return parseRecommendations(json).filter((id) => !installed.has(id.toLowerCase()))
}

/**
 * Mention a project's un-installed recommendations, once per project per
 * session, as a notice pointing at the Extensions panel.
 *
 * A notice rather than a modal: it is a suggestion from a file, not something
 * the reader asked for, and it must not stand between them and the code.
 */
export async function offerRecommendations(root: string): Promise<void> {
  if (!root || seen.has(root)) return
  seen.add(root)
  const missing = await missingRecommendations(root)
  if (missing.length === 0) return
  log.info("project recommends extensions", { count: missing.length })
  notify("info", t("ext.recommended", { count: missing.length, names: missing.join(", ") }))
  useWorkspace.getState().setRecommended(missing)
}

/** Forget what has been offered — for tests, and for a project reopened after
 *  its recommendations changed. */
export const resetRecommendations = () => seen.clear()
