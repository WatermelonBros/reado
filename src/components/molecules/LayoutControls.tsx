/**
 * The window's shape, from the title bar.
 *
 * Reado's layout was adjustable but not reachable: the sidebar on a shortcut,
 * the docks on others, the activity and status bars behind a Settings tab, and
 * nothing on screen saying any of it was possible. A reader who wants less on
 * screen had to already know how — which is the opposite of what the
 * [W3C COGA](https://www.w3.org/TR/coga-usable/) guidance asks for under *Help
 * Users Focus* and *Support Adaptation and Personalization*.
 *
 * Three toggles for the regions people hide most, and a popover for the rest.
 * Every control drives a setting that already existed, so a change made here and
 * one made in Settings are the same change, not two copies of it.
 */
import { Popover } from "@ark-ui/react/popover"
import { Portal } from "@ark-ui/react/portal"
import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/atoms/Checkbox"
import { LayoutIcon, PanelIcon } from "@/components/atoms/icons"
import { SegmentedControl } from "@/components/atoms/SegmentedControl"
import { useLayout } from "@/lib/layout"
import { useSettings, useWorkspace } from "@/lib/store"

/** A title-bar toggle: pressed when the region is showing. `rotate` turns the
 *  one panel glyph to point at the edge it controls. */
function RegionToggle({
  on,
  label,
  onClick,
  rotate = 0,
}: {
  on: boolean
  label: string
  onClick: () => void
  rotate?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`pointer-events-auto grid h-6 w-7 flex-none place-items-center rounded-md transition-colors hover:bg-surface ${
        on ? "text-ink" : "text-faint"
      }`}
    >
      {/* The wrapper carries the rotation: the icon wrapper takes className and
        weight, not style. */}
      <span style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}>
        <PanelIcon className="h-3.5 w-3.5" weight={on ? "fill" : "regular"} />
      </span>
    </button>
  )
}

export function LayoutControls() {
  const { t } = useTranslation()
  const tool = useWorkspace((s) => s.tool)
  const hidden = useLayout((s) => s.hidden)
  const settings = useSettings()

  return (
    <div className="pointer-events-auto flex flex-none items-center gap-0.5">
      <RegionToggle
        on={tool !== null}
        label={t("layout.primarySidebar")}
        onClick={() => useWorkspace.getState().toggleSidebar()}
      />
      <RegionToggle
        on={!hidden.bottom}
        label={t("layout.panel")}
        rotate={90}
        onClick={() => useLayout.getState().toggleArea("bottom")}
      />
      <RegionToggle
        on={!hidden.right}
        label={t("layout.secondarySidebar")}
        rotate={180}
        onClick={() => useLayout.getState().toggleArea("right")}
      />

      <Popover.Root positioning={{ placement: "bottom-end" }}>
        <Popover.Trigger
          title={t("layout.more")}
          aria-label={t("layout.more")}
          className="grid h-6 w-7 flex-none place-items-center rounded-md text-faint transition-colors hover:bg-surface hover:text-ink"
        >
          <LayoutIcon className="h-3.5 w-3.5" />
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content className="z-[120] flex w-64 flex-col gap-3 rounded-lg border border-line bg-elevated p-3 shadow-[var(--shadow)]">
              <span className="text-[10px] font-medium tracking-wide text-faint uppercase">
                {t("layout.more")}
              </span>

              <Checkbox
                checked={settings.showActivityBar}
                onChange={(v) => settings.set({ showActivityBar: v })}
                label={t("settings.showActivityBar")}
                className="text-xs text-muted"
              />
              <Checkbox
                checked={settings.showStatusBar}
                onChange={(v) => settings.set({ showStatusBar: v })}
                label={t("settings.showStatusBar")}
                className="text-xs text-muted"
              />
              <Checkbox
                checked={settings.showBreadcrumbs}
                onChange={(v) => settings.set({ showBreadcrumbs: v })}
                label={t("settings.showBreadcrumbs")}
                className="text-xs text-muted"
              />

              {/* A div, not a label: a label points at one control, and this is
                a radio group — Ark labels it via `ariaLabel` below. */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">{t("layout.sidebarSide")}</span>
                <SegmentedControl
                  value={settings.sidebarSide}
                  onChange={(side) => settings.set({ sidebarSide: side })}
                  ariaLabel={t("layout.sidebarSide")}
                  segments={[
                    { id: "left" as const, label: t("layout.left") },
                    { id: "right" as const, label: t("layout.right") },
                  ]}
                />
              </div>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
    </div>
  )
}
