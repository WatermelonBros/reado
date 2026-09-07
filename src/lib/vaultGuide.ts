/**
 * The guide Reado writes for the password-manager CLIs, since they have no
 * README to fetch — they are the vendors' own binaries, not packages from a
 * registry.
 *
 * The prose lives in `src/docs/vault/*.md`, written and reviewed as Markdown
 * rather than as escaped strings, and imported raw so it ships in the bundle with
 * nothing to fetch at runtime. Each guide is its vault's own half (what it is,
 * how to set it up) followed by the half that is identical for both (using it,
 * what happens to the secret, what to check when it doesn't work) — one copy per
 * language, so the two can't drift.
 *
 * English and Italian, like the rest of the interface; English is the fallback
 * for any locale we haven't written yet, since a missing page is worse than a
 * foreign one.
 */
import bwEn from "@/docs/vault/bw.en.md?raw"
import bwIt from "@/docs/vault/bw.it.md?raw"
import commonEn from "@/docs/vault/common.en.md?raw"
import commonIt from "@/docs/vault/common.it.md?raw"
import opEn from "@/docs/vault/op.en.md?raw"
import opIt from "@/docs/vault/op.it.md?raw"

export type VaultId = "op" | "bw"

const INTRO: Record<VaultId, Record<"en" | "it", string>> = {
  op: { en: opEn, it: opIt },
  bw: { en: bwEn, it: bwIt },
}

const COMMON = { en: commonEn, it: commonIt }

/** The guide for one CLI, in the reader's language. */
export function vaultGuide(id: VaultId, language: string): string {
  const lang = language.toLowerCase().startsWith("it") ? "it" : "en"
  return `${INTRO[id][lang].trim()}\n\n${COMMON[lang].trim()}\n`
}
