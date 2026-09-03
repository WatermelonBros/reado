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
 * Three toggles for the regions people hide most, and — as in VS Code's
 * "Customize Layout" — a menu listing every region with its state and the
 * shortcut that toggles it, so the menu teaches the keyboard instead of
 * replacing it. Every control drives a setting that already existed, so a change
 * made here and one made in Settings are the same change, not two copies of it.
 */
import { Menu } from "@ark-ui/react/menu"
import { Portal } from "@ark-ui/react/portal"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { IconButton } from "@/components/atoms/IconButton"
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  LayoutIcon,
  PanelAlignIcon,
  QuickInputIcon,
  RegionIcon,
} from "@/components/atoms/icons"
import { Kbd } from "@/components/atoms/Kbd"
import { toggleDockArea, useAreaShowing } from "@/lib/panels"
import { alt, FULLSCREEN_COMBO, mod, ZEN_COMBO } from "@/lib/shortcuts"
import { type PanelAlignment, toggleZenMode, useSettings, useWorkspace } from "@/lib/store"
import { useFullscreen } from "@/lib/window"

type Side = "left" | "right" | "top" | "bottom"

/** A title-bar toggle: pressed when the region is showing, and drawn as the
 *  window with that region's edge filled — so the glyph says which region it is
 *  before the tooltip does. */
function RegionToggle({
  on,
  side,
  label,
  onClick,
}: {
  on: boolean
  side: Side
  label: string
  onClick: () => void
}) {
  return (
    <IconButton
      size="sm"
      active={on}
      label={label}
      onClick={onClick}
      className="pointer-events-auto w-7"
      icon={<RegionIcon side={side} on={on} className="h-3.5 w-3.5" />}
    />
  )
}

const ROW =
  "flex cursor-default items-center gap-2 rounded px-2 py-1 text-xs text-ink data-[highlighted]:bg-surface"
const GROUP = "px-2 py-1 text-[10px] font-medium tracking-wide text-faint uppercase"

/** The state column. It sits *after* the label, as VS Code's does, so every row
 *  starts at the same x and the names read as a column rather than as a ragged
 *  list indented by whichever rows happen to be on. */
function Indicator({ children }: { children?: ReactNode }) {
  return (
    <span className="grid h-4 w-4 flex-none place-items-center">
      {children ?? (
        <Menu.ItemIndicator>
          <CheckIcon className="h-3 w-3 text-accent" />
        </Menu.ItemIndicator>
      )}
    </span>
  )
}

/** One region's visibility. `combo` is shown only where a binding really
 *  exists — a menu that invents shortcuts teaches the wrong keys. */
function VisibilityItem({
  value,
  checked,
  onChange,
  label,
  side,
  thin,
  combo,
}: {
  value: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  /** The edge this region occupies, drawn as a glyph. */
  side?: Side
  /** A strip rather than a panel — a status bar, not a sidebar. */
  thin?: boolean
  combo?: string
}) {
  return (
    <Menu.CheckboxItem
      value={value}
      checked={checked}
      onCheckedChange={onChange}
      // The menu is a control panel: flipping one region shouldn't dismiss it.
      closeOnSelect={false}
      className={ROW}
    >
      <span className="grid h-4 w-4 flex-none place-items-center text-muted">
        {side && <RegionIcon side={side} thin={thin} on={checked} className="h-3.5 w-3.5" />}
      </span>
      <Menu.ItemText className="flex-1">{label}</Menu.ItemText>
      {combo && <Kbd>{combo}</Kbd>}
      {/* An eye rather than a tick: this column says *showing / hidden*, which
        is a state the row can be in either way, not a thing you have picked. */}
      <Indicator>
        {checked ? (
          <EyeIcon className="h-3.5 w-3.5 text-accent" />
        ) : (
          <EyeOffIcon className="h-3.5 w-3.5 text-faint" />
        )}
      </Indicator>
    </Menu.CheckboxItem>
  )
}

/** A mode: on or off, with a tick. Unlike a region it isn't somewhere on
 *  screen, so it has no glyph and no eye. */
function ModeItem({
  value,
  checked,
  onChange,
  label,
  combo,
}: {
  value: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  combo?: string
}) {
  return (
    <Menu.CheckboxItem
      value={value}
      checked={checked}
      onCheckedChange={onChange}
      closeOnSelect={false}
      className={ROW}
    >
      <span className="h-4 w-4 flex-none" />
      <Menu.ItemText className="flex-1">{label}</Menu.ItemText>
      {combo && <Kbd>{combo}</Kbd>}
      <Indicator />
    </Menu.CheckboxItem>
  )
}

/** A labelled set of mutually exclusive layout options — sidebar side, panel
 *  alignment, quick input position. One shape, so the three read alike. */
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; icon: ReactNode }[]
}) {
  return (
    <Menu.RadioItemGroup value={value} onValueChange={(e) => onChange(e.value)}>
      <Menu.ItemGroupLabel className={GROUP}>{label}</Menu.ItemGroupLabel>
      {options.map((o) => (
        <Menu.RadioItem key={o.value} value={o.value} closeOnSelect={false} className={ROW}>
          <span className="grid h-4 w-4 flex-none place-items-center text-muted">{o.icon}</span>
          <Menu.ItemText className="flex-1">{o.label}</Menu.ItemText>
          <Indicator />
        </Menu.RadioItem>
      ))}
    </Menu.RadioItemGroup>
  )
}

export function LayoutControls() {
  const { t } = useTranslation()
  const tool = useWorkspace((s) => s.tool)
  // "Showing", not "not hidden": an un-hidden region with every panel closed is
  // an empty strip, and a toggle that lit up for it was reporting a region the
  // reader could not see.
  const panelOn = useAreaShowing("bottom")
  const auxOn = useAreaShowing("right")
  const settings = useSettings()
  const [fullscreen, setFullscreen] = useFullscreen()

  return (
    <div className="pointer-events-auto flex flex-none items-center gap-0.5">
      <RegionToggle
        on={tool !== null}
        // The primary sidebar can be moved to the right edge; the glyph follows
        // it, or it would point at a region that isn't there.
        side={settings.sidebarSide}
        label={t("layout.primarySidebar")}
        onClick={() => useWorkspace.getState().toggleSidebar()}
      />
      <RegionToggle
        on={panelOn}
        side="bottom"
        label={t("layout.panel")}
        onClick={() => toggleDockArea("bottom")}
      />
      <RegionToggle
        on={auxOn}
        side="right"
        label={t("layout.secondarySidebar")}
        onClick={() => toggleDockArea("right")}
      />

      <Menu.Root positioning={{ placement: "bottom-end" }}>
        <Menu.Trigger
          title={t("layout.more")}
          aria-label={t("layout.more")}
          className="grid h-6 w-7 flex-none place-items-center rounded-md text-faint transition-colors hover:bg-overlay hover:text-ink data-[state=open]:bg-overlay data-[state=open]:text-ink"
        >
          <LayoutIcon className="h-3.5 w-3.5" />
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner className="z-[120]">
            <Menu.Content className="min-w-60 rounded-lg border border-line bg-overlay p-1 shadow-[var(--shadow)] focus:outline-none">
              <Menu.ItemGroup>
                <Menu.ItemGroupLabel className={GROUP}>
                  {t("layout.visibility")}
                </Menu.ItemGroupLabel>
                <VisibilityItem
                  value="primarySidebar"
                  checked={tool !== null}
                  onChange={() => useWorkspace.getState().toggleSidebar()}
                  label={t("layout.primarySidebar")}
                  side={settings.sidebarSide}
                  combo={`${mod}B`}
                />
                <VisibilityItem
                  value="secondarySidebar"
                  checked={auxOn}
                  onChange={() => toggleDockArea("right")}
                  label={t("layout.secondarySidebar")}
                  side="right"
                  combo={`${alt}${mod}B`}
                />
                <VisibilityItem
                  value="panel"
                  checked={panelOn}
                  onChange={() => toggleDockArea("bottom")}
                  label={t("layout.panel")}
                  side="bottom"
                  combo={`${mod}J`}
                />
                <VisibilityItem
                  value="activityBar"
                  checked={settings.showActivityBar}
                  onChange={(v) => settings.set({ showActivityBar: v })}
                  label={t("layout.activityBar")}
                  // The activity bar rides the same edge as the sidebar it belongs to.
                  side={settings.sidebarSide}
                  thin
                />
                <VisibilityItem
                  value="statusBar"
                  checked={settings.showStatusBar}
                  onChange={(v) => settings.set({ showStatusBar: v })}
                  label={t("layout.statusBar")}
                  side="bottom"
                  thin
                />
                <VisibilityItem
                  value="breadcrumbs"
                  checked={settings.showBreadcrumbs}
                  onChange={(v) => settings.set({ showBreadcrumbs: v })}
                  label={t("layout.breadcrumbs")}
                  side="top"
                  thin
                />
              </Menu.ItemGroup>

              <Choice
                label={t("layout.sidebarSide")}
                value={settings.sidebarSide}
                onChange={(v) => settings.set({ sidebarSide: v as "left" | "right" })}
                options={(["left", "right"] as const).map((side) => ({
                  value: side,
                  label: t(`layout.${side}`),
                  icon: <RegionIcon side={side} className="h-3.5 w-3.5" />,
                }))}
              />

              <Choice
                label={t("layout.panelAlignment")}
                value={settings.panelAlignment}
                onChange={(v) => settings.set({ panelAlignment: v as PanelAlignment })}
                options={(["left", "center", "right", "justify"] as const).map((align) => ({
                  value: align,
                  label: t(`layout.align.${align}`),
                  icon: <PanelAlignIcon align={align} className="h-3.5 w-3.5" />,
                }))}
              />

              <Choice
                label={t("layout.quickInput")}
                value={settings.quickInputPosition}
                onChange={(v) => settings.set({ quickInputPosition: v as "top" | "center" })}
                options={(["top", "center"] as const).map((position) => ({
                  value: position,
                  label: t(`layout.quick.${position}`),
                  icon: <QuickInputIcon position={position} className="h-3.5 w-3.5" />,
                }))}
              />

              <Menu.Separator className="my-1 border-t border-line" />

              {/* Modes, not regions: each one moves several of the switches
                above at once, so they carry a tick rather than an eye. */}
              <Menu.ItemGroup>
                <Menu.ItemGroupLabel className={GROUP}>{t("layout.modes")}</Menu.ItemGroupLabel>
                <ModeItem
                  value="fullScreen"
                  checked={fullscreen}
                  onChange={setFullscreen}
                  label={t("layout.fullScreen")}
                  combo={FULLSCREEN_COMBO}
                />
                <ModeItem
                  value="zenMode"
                  checked={settings.zenMode}
                  onChange={(v) => toggleZenMode(v)}
                  label={t("layout.zenMode")}
                  combo={ZEN_COMBO}
                />
                <ModeItem
                  value="centeredLayout"
                  checked={settings.centeredLayout}
                  onChange={(v) => settings.set({ centeredLayout: v })}
                  label={t("layout.centeredLayout")}
                />
              </Menu.ItemGroup>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </div>
  )
}
