/**
 * Render one entry, whatever it came from.
 *
 * The differences between a marketplace extension, a language server and a
 * formatter survive exactly where they change what you can do: an extension
 * installs in place and can be removed, a curated tool installs through your own
 * package manager in the terminal, and a formatter also tells you whether this
 * project actually asks for it. Everything else reads the same.
 */
import { useTranslation } from "react-i18next"
import type { LinuxPm } from "@/lib/extensions"
import { classify } from "@/lib/marketplace"
import { Activate } from "./Activate"
import { EnableToggle } from "./EnableToggle"
import { ExtensionRow } from "./ExtensionRow"
import type { Entry } from "./entries"
import { kindsLabel } from "./kinds"
import { curatedInfo, runInstall } from "./useCurated"

export function EntryRow({
  entry,
  linuxPm,
  busy,
  onInstall,
  onUninstall,
  updateTo,
  onUpdate,
  onOpen,
}: {
  entry: Entry
  linuxPm: LinuxPm | null
  busy?: "installing" | "uninstalling" | null
  onInstall?: () => void
  onUninstall?: () => void
  updateTo?: string
  onUpdate?: () => void
  onOpen?: () => void
}) {
  const { t } = useTranslation()

  if (entry.kind === "installed" || entry.kind === "marketplace") {
    const m = entry.kind === "installed" ? entry.ext.manifest : entry.listing.manifest
    // Everything listed is fully supported, so this line is a plain statement of
    // what the extension adds — not a promise with an asterisk after it.
    const { kinds } = classify(m)
    const contributes = kinds.length ? t("ext.contributes", { kinds: kindsLabel(kinds, t) }) : ""

    if (entry.kind === "installed") {
      return (
        <ExtensionRow
          displayName={entry.ext.displayName}
          publisher={entry.ext.namespace}
          description={entry.ext.manifest.description ?? ""}
          contributes={contributes}
          installed
          busy={busy}
          // The page offered a switch the row didn't, so a marketplace
          // extension could only be turned off by opening it. Same controls in
          // both places now.
          actions={
            <>
              <Activate ext={entry.ext} />
              <EnableToggle id={entry.ext.id} />
            </>
          }
          onUninstall={onUninstall}
          updateTo={updateTo}
          onUpdate={onUpdate}
          onOpen={onOpen}
        />
      )
    }
    return (
      <ExtensionRow
        displayName={entry.listing.displayName}
        publisher={entry.listing.namespace}
        description={entry.listing.description}
        icon={entry.listing.icon}
        downloads={entry.listing.downloadCount}
        verified={entry.listing.verified}
        contributes={contributes}
        busy={busy}
        onInstall={onInstall}
        onOpen={onOpen}
      />
    )
  }

  // Curated: installed through the user's own package manager, in the terminal.
  const info = curatedInfo(
    entry.def.id,
    entry.kind === "server" ? { [entry.def.id]: entry.installed } : {},
    entry.kind === "formatter" && entry.status ? { [entry.def.id]: entry.status } : {},
    linuxPm,
  )
  if (!info) return null
  const { def, installed: isInstalled, cmd } = info

  return (
    <ExtensionRow
      displayName={def.name}
      publisher={t("ext.curated")}
      description={def.description}
      contributes={t("ext.contributes", {
        kinds: entry.kind === "server" ? t("ext.kindServer") : t("ext.kindFormatter"),
      })}
      installed={isInstalled}
      onOpen={onOpen}
      action={
        isInstalled || cmd ? undefined : (
          <span className="flex-none text-xs text-faint">{t("ext.manual")}</span>
        )
      }
      onInstall={cmd ? () => runInstall(cmd) : undefined}
      note={
        entry.kind === "formatter" ? (
          entry.status?.declared ? (
            // The answer to "why did my file get reformatted like that".
            <span className="text-ok">{t("ext.declared")}</span>
          ) : (
            <>
              {t("ext.notDeclared")} — {t("ext.declaredByHint", { what: entry.def.declaredBy })}
            </>
          )
        ) : !isInstalled && def.requires ? (
          t("ext.requires", { name: def.requires })
        ) : undefined
      }
      actions={isInstalled ? <EnableToggle id={def.id} /> : undefined}
    />
  )
}
