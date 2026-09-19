/**
 * Extensions a project recommends.
 *
 * Same shape as VS Code's `.vscode/extensions.json` (`{ "recommendations": [...] }`)
 * so a repository can keep one list — and that file is read directly, because a
 * repository that has one should not have to keep a second. The point is the
 * first five minutes with an unfamiliar codebase: "this project is Terraform and
 * Svelte, here is what makes it readable" is knowledge the repository has and
 * the newcomer doesn't.
 *
 * Advisory only — nothing is installed without being asked for.
 */

import { t } from "@/i18n"
import { type FormatterStatus, formatterStatus, lspInstalledAll, readFile } from "@/lib/api"
import { createLogger, safeError } from "./logger"
import { useMarketplace } from "./marketplace"
import { notify } from "./notice"
import { useWorkspace } from "./store"

const log = createLogger("recommended")

/** Where a project may list its recommendations, in the order they are read —
 *  the first that exists wins, so a project that wants Reado to see something
 *  different from VS Code says so in `.reado/`. Reading `.vscode/` at all is the
 *  same call `tasks.ts` makes for `.vscode/tasks.json`: projects already have
 *  one, and asking them to duplicate it buys nothing. */
export const RECOMMENDED_FILES = [".reado/extensions.json", ".vscode/extensions.json"] as const

/**
 * Open VSX ids Reado already covers with a curated tool, mapped to that tool.
 *
 * A recommendations file is written for VS Code, where `rust-lang.rust-analyzer`
 * means "install rust-analyzer". Reado installs rust-analyzer too — from the
 * toolchain, under a curated id of its own — so a machine that already has it is
 * missing nothing, and saying otherwise on every project open is a prompt you
 * learn to dismiss without reading.
 *
 * Only ids whose curated entry installs *the same tool* belong here. Where VS
 * Code's extension is a different implementation (OmniSharp for C#, solc for
 * Solidity), the recommendation still stands and is deliberately absent.
 */
export const CURATED_EQUIVALENTS: Record<string, string> = {
  "angular.ng-template": "angular",
  "biomejs.biome": "biome",
  "bmewburn.vscode-intelephense-client": "php",
  "charliermarsh.ruff": "ruff",
  "esbenp.prettier-vscode": "prettier",
  "foxundermoon.shell-format": "shfmt",
  "fwcd.kotlin": "kotlin",
  "golang.go": "go",
  "hashicorp.terraform": "terraform",
  "llvm-vs-code-extensions.vscode-clangd": "cpp",
  "mads-hartmann.bash-ide-vscode": "bash",
  "ms-pyright.pyright": "python",
  "ms-python.black-formatter": "black",
  "redhat.java": "java",
  "redhat.vscode-yaml": "yaml",
  "rubocop.vscode-rubocop": "rubocop",
  "rust-lang.rust-analyzer": "rust",
  "scalameta.metals": "scala",
  "shopify.ruby-lsp": "ruby",
  "sswg.swift-lang": "swift",
  "sumneko.lua": "lua",
  "svelte.svelte-vscode": "svelte",
  "tamasfe.even-better-toml": "toml",
  "vue.volar": "vue",
  "ziglang.vscode-zig": "zig",
}

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

/** Which curated tools are on this machine, by their curated ids. Two calls,
 *  and only made when a recommendation actually maps to one. */
async function installedCurated(root: string): Promise<Set<string>> {
  const [servers, formatters] = await Promise.all([
    lspInstalledAll(root).catch(() => [] as Array<[string, boolean]>),
    formatterStatus(root).catch(() => [] as FormatterStatus[]),
  ])
  const out = new Set<string>()
  for (const [id, yes] of servers) if (yes) out.add(id)
  for (const f of formatters) if (f.installed) out.add(f.id)
  return out
}

/** The first of the recommendation files this project has, unread if none. */
async function readRecommendations(root: string): Promise<string | null> {
  for (const rel of RECOMMENDED_FILES) {
    const file = await readFile(root, `${root}/${rel}`, true).catch(() => null)
    if (file?.kind === "text") return file.text
  }
  return null
}

/** The recommendations this project makes that aren't installed yet. */
export async function missingRecommendations(root: string): Promise<string[]> {
  const json = await readRecommendations(root)
  if (!json) return []
  const installed = new Set(useMarketplace.getState().installed.map((e) => e.id.toLowerCase()))
  const wanted = parseRecommendations(json).filter((id) => !installed.has(id.toLowerCase()))
  // Probed only when one of them could be satisfied this way: on the common
  // project — no file, or nothing curated in it — this costs nothing.
  if (!wanted.some((id) => CURATED_EQUIVALENTS[id.toLowerCase()])) return wanted
  const curated = await installedCurated(root)
  return wanted.filter((id) => !curated.has(CURATED_EQUIVALENTS[id.toLowerCase()] ?? ""))
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
