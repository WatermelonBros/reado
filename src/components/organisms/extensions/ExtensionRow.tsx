/**
 * One extension, whatever kind it is.
 *
 * A row, not a card: the panel is a narrow column read top to bottom, and a
 * stack of same-size boxes turns a scannable list into wallpaper. The name and
 * the action sit on the first line — the two things a reader is here for — with
 * everything else stepping down in weight beneath them.
 *
 * The row is purely presentational. What an extension contributes, and what it
 * can't do here, arrive as sentences the panel has already worked out, so a
 * marketplace extension, a formatter and a language server all read the same.
 */
import { type ReactElement, type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms/Button"
import { IconButton } from "@/components/atoms/IconButton"
import { CheckIcon, SealCheckIcon, TrashIcon } from "@/components/atoms/icons"
import { InlineConfirm } from "@/components/molecules/InlineConfirm"
import { cn } from "@/lib/cn"

/** Compact install counts: the exact number is noise, the order of magnitude
 *  is the signal a reader is actually using to choose. */
export const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`
      : String(n)

export interface RowProps {
  displayName: string
  /** Publisher, or the source when there isn't one ("Reado" for the curated). */
  publisher: string
  description: string
  icon?: string | ReactElement | null
  downloads?: number
  verified?: boolean
  /** What it adds, in the product's words. */
  contributes?: string
  /** What it can't do here — shown quietly, because nothing is wrong. */
  note?: ReactNode
  installed?: boolean
  busy?: "installing" | "uninstalling" | null
  onInstall?: () => void
  onUninstall?: () => void
  /** The newer version on offer, when there is one. Turns the quiet "Installed"
   *  into the row's one call to action — an update is the thing worth noticing
   *  in a list of things that are already fine. */
  updateTo?: string
  onUpdate?: () => void
  /** Replaces the install/installed affordance entirely (e.g. "Manual"). */
  action?: ReactNode
  /** Extra controls under the description — activating a theme, enabling, … */
  actions?: ReactNode
  /** Open the extension's own page. Rows without one stay plain text. */
  onOpen?: () => void
}

export function ExtensionRow({
  displayName,
  publisher,
  description,
  icon,
  downloads,
  verified,
  contributes,
  note,
  installed,
  busy,
  onInstall,
  onUninstall,
  updateTo,
  onUpdate,
  action,
  actions,
  onOpen,
}: RowProps) {
  const { t } = useTranslation()

  return (
    <li
      // The whole row opens the page, not just the name: a list item that only
      // responds on one word of itself reads as broken, and you aim at the row.
      // The name stays a real button so the keyboard has the same door.
      onClick={(e) => {
        if (!onOpen) return
        // A click that landed on one of the row's own controls is that
        // control's, not the row's.
        if ((e.target as HTMLElement).closest("button,a,input,label,[role='combobox']")) return
        onOpen()
      }}
      className={cn(
        "group border-b border-line/60 px-3 py-2.5 transition-colors hover:bg-surface/50",
        onOpen && "cursor-pointer",
      )}
    >
      <div className="flex items-start gap-2.5">
        <ExtensionIcon icon={icon} name={displayName || publisher} size={7} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {/* The name is the way in: a row can hold two lines of blurb, and
                what decides whether you want an extension is its README. */}
            {onOpen ? (
              <button
                type="button"
                onClick={onOpen}
                className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-medium text-ink hover:text-accent hover:underline"
              >
                {displayName}
              </button>
            ) : (
              <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {displayName}
              </h3>
            )}
            {action ?? (
              <Action
                installed={installed}
                busy={busy}
                onInstall={onInstall}
                onUninstall={onUninstall}
                updateTo={updateTo}
                onUpdate={onUpdate}
              />
            )}
          </div>

          <p className="mt-0.5 flex items-center gap-1 text-xs text-faint">
            <span className="truncate">{publisher}</span>
            {verified && (
              <SealCheckIcon className="h-3 w-3 flex-none text-ok" aria-label={t("ext.verified")} />
            )}
            {downloads !== undefined && downloads > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  {t("ext.downloads", { n: compact(downloads) })}
                </span>
              </>
            )}
          </p>

          {/* What Reado will actually give you comes before the publisher's own
              blurb. Kotlin's says "code completion, debugging, linting and
              more"; here it is a grammar. Printing that promise first and the
              truth underneath is how a reader ends up misled by an accurate
              panel. */}
          {contributes && <p className="mt-1 text-xs leading-relaxed text-ink/80">{contributes}</p>}

          {description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{description}</p>
          )}

          {actions && <div className="mt-1.5 flex items-center gap-2">{actions}</div>}

          {/* The honest sentence, not a warning colour: nothing is wrong here,
              the extension simply does less than it does elsewhere. */}
          {note && <p className="mt-1 text-xs leading-relaxed text-faint">{note}</p>}
        </div>
      </div>
    </li>
  )
}

/**
 * An extension's artwork, or a monogram in its place.
 *
 * `object-contain`, not `cover`: publishers ship logos at every aspect ratio and
 * with their own padding, and cropping them to a square cut the edges off the
 * wide ones. The `onError` fallback matters as much — a registry icon that 404s
 * left a broken-image glyph in the list, which reads as a broken app rather than
 * a missing file.
 */
export function ExtensionIcon({
  icon,
  name,
  size,
}: {
  icon?: string | ReactElement | null
  name: string
  size: 7 | 12
}) {
  const [failed, setFailed] = useState(false)
  const box = size === 7 ? "h-7 w-7" : "h-12 w-12"

  // A curated tool brings its mark as a component (no URL to fetch, nothing to
  // 404), so it is drawn rather than loaded.
  if (icon && typeof icon !== "string")
    return (
      <span
        aria-hidden
        className={`grid ${box} flex-none place-items-center rounded-md bg-overlay p-1`}
      >
        {icon}
      </span>
    )

  if (!icon || failed) {
    return (
      <span
        aria-hidden
        className={`grid ${box} flex-none place-items-center rounded-md bg-overlay font-semibold text-muted ${
          size === 7 ? "text-[11px]" : "text-lg"
        }`}
      >
        {(name || "?").slice(0, 1).toUpperCase()}
      </span>
    )
  }
  return (
    // Registry-hosted, loaded by the img tag under the app's existing image
    // policy — inlining every result's artwork would buy nothing.
    <img
      src={icon}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${box} flex-none rounded-md bg-overlay object-contain p-0.5`}
    />
  )
}

/** The row's one changing element, so it carries the only motion in the list. */
function Action({
  installed,
  busy,
  onInstall,
  onUninstall,
  updateTo,
  onUpdate,
}: Pick<RowProps, "installed" | "busy" | "onInstall" | "onUninstall" | "updateTo" | "onUpdate">) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)

  if (busy) {
    return (
      <span className="flex-none animate-pulse text-xs text-faint">
        {t(busy === "installing" ? "ext.installing" : "ext.uninstalling")}
      </span>
    )
  }
  if (installed) {
    if (asking) {
      return (
        <InlineConfirm
          question={t("ext.uninstallAsk")}
          confirmLabel={t("ext.uninstall")}
          onConfirm={() => {
            setAsking(false)
            onUninstall?.()
          }}
          onCancel={() => setAsking(false)}
        />
      )
    }
    return (
      <span className="flex flex-none items-center gap-1">
        {/* An update replaces the quiet "Installed" but keeps the remove button
            beside it: an offer shouldn't cost you the way out. */}
        {updateTo && onUpdate ? (
          <Button variant="primary" size="sm" className="flex-none" onClick={onUpdate}>
            {t("ext.updateTo", { version: updateTo })}
          </Button>
        ) : (
          <span
            className={cn(
              "flex items-center gap-1 text-xs text-ok",
              // The confirmation steps aside for the action once you reach for
              // it — but only for the pointer. `display:none` would take the
              // control out of the tab order, which is how the only route to
              // uninstalling from this panel became "open the page".
              onUninstall && "group-hover:hidden group-focus-within:hidden",
            )}
          >
            <CheckIcon className="h-3.5 w-3.5" />
            {t("ext.installed")}
          </span>
        )}
        {onUninstall && (
          <span className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            <IconButton
              size="sm"
              danger
              label={t("ext.uninstall")}
              icon={<TrashIcon className="h-4 w-4" />}
              onClick={() => setAsking(true)}
            />
          </span>
        )}
      </span>
    )
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      className="flex-none hover:border-accent hover:text-accent"
      onClick={onInstall}
    >
      {t("ext.install")}
    </Button>
  )
}
