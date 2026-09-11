/**
 * Named, switchable configurations.
 *
 * A profile is a `settingsSync` bundle with a name: the description of "a whole
 * configuration" already existed for export/import, and keeping a second one
 * would have meant two places to remember when a setting is added. The only new
 * ideas here are *several* of them and *which one is in use*.
 *
 * Switching saves before it loads. Without that, every edit made while a profile
 * was active would be silently rolled back the moment you looked at another one
 * — which is the behaviour that makes people stop trusting profiles.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { applyBundle, type Bundle, buildBundle } from "./settingsSync"

/** The profile that always exists and cannot be removed, so there is always
 *  something to fall back to. */
export const DEFAULT_PROFILE_ID = "default"

export interface Profile {
  id: string
  name: string
  bundle: Bundle
}

interface ProfilesState {
  profiles: Profile[]
  activeId: string
  /** Save what is in use back into the active profile. */
  capture: () => void
  /** Save the current configuration, then load `id`. */
  switchTo: (id: string) => void
  /** Create a profile holding the configuration in use, and switch to it. */
  createFromCurrent: (name: string) => Profile
  rename: (id: string, name: string) => void
  /** Remove a profile. Refused for Default; removing the active one falls back
   *  to Default and applies it. */
  remove: (id: string) => void
  /** Add a profile from an imported bundle, under a name that is free. */
  importProfile: (name: string, bundle: Bundle, replace?: boolean) => Profile
  active: () => Profile
  byName: (name: string) => Profile | undefined
}

/** Ids are derived from the name and de-duplicated, so they stay readable in the
 *  persisted blob (`rust`, `rust-2`) instead of being opaque counters. */
function freeId(profiles: Profile[], name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "profile"
  if (!profiles.some((p) => p.id === base)) return base
  for (let n = 2; ; n++) if (!profiles.some((p) => p.id === `${base}-${n}`)) return `${base}-${n}`
}

export const useProfiles = create<ProfilesState>()(
  persist(
    (set, get) => ({
      profiles: [
        {
          id: DEFAULT_PROFILE_ID,
          name: "Default",
          bundle: { version: 1, settings: {}, extensionsDisabled: [] },
        },
      ],
      activeId: DEFAULT_PROFILE_ID,
      capture: () =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === s.activeId ? { ...p, bundle: buildBundle() } : p,
          ),
        })),
      switchTo: (id) => {
        const s = get()
        if (id === s.activeId) return
        const target = s.profiles.find((p) => p.id === id)
        if (!target) return
        s.capture()
        set({ activeId: id })
        applyBundle(target.bundle)
      },
      createFromCurrent: (name) => {
        const s = get()
        const profile: Profile = { id: freeId(s.profiles, name), name, bundle: buildBundle() }
        // Capture first: the new profile takes the configuration in use, and the
        // one being left keeps it too, rather than losing edits to the switch.
        s.capture()
        set((prev) => ({ profiles: [...prev.profiles, profile], activeId: profile.id }))
        return profile
      },
      rename: (id, name) =>
        set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? { ...p, name } : p)) })),
      remove: (id) => {
        if (id === DEFAULT_PROFILE_ID) return
        const s = get()
        const rest = s.profiles.filter((p) => p.id !== id)
        if (rest.length === s.profiles.length) return
        set({ profiles: rest })
        if (s.activeId !== id) return
        const fallback = rest.find((p) => p.id === DEFAULT_PROFILE_ID) ?? rest[0]
        set({ activeId: fallback.id })
        applyBundle(fallback.bundle)
      },
      importProfile: (name, bundle, replace) => {
        const s = get()
        const existing = s.byName(name)
        if (existing && replace) {
          const updated = { ...existing, bundle }
          set({ profiles: s.profiles.map((p) => (p.id === existing.id ? updated : p)) })
          return updated
        }
        const profile: Profile = { id: freeId(s.profiles, name), name, bundle }
        set({ profiles: [...s.profiles, profile] })
        return profile
      },
      active: () => {
        const s = get()
        return s.profiles.find((p) => p.id === s.activeId) ?? s.profiles[0]
      },
      byName: (name) => get().profiles.find((p) => p.name === name),
    }),
    { name: "reado.profiles" },
  ),
)

// ---- The actions behind the palette commands --------------------------------

import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog"
import { t } from "@/i18n"
import { readSettingsFile, writeSettingsFile } from "./api"
import { notify, notifyError } from "./notice"
import { prompt } from "./prompt"
import { parseBundle } from "./settingsSync"

/** Create a profile from the configuration in use, after asking for a name. */
export async function createProfile(): Promise<void> {
  const name = await prompt({ title: t("profile.create"), placeholder: t("profile.name") })
  if (!name) return
  const profile = useProfiles.getState().createFromCurrent(name)
  notify("success", t("profile.created", { name: profile.name }))
}

/** Rename the profile in use. */
export async function renameProfile(): Promise<void> {
  const { active, rename } = useProfiles.getState()
  const current = active()
  const name = await prompt({ title: t("profile.rename"), value: current.name })
  if (!name) return
  rename(current.id, name)
}

/** Delete the profile in use, which falls back to Default. */
export async function deleteProfile(): Promise<void> {
  const state = useProfiles.getState()
  const current = state.active()
  if (current.id === DEFAULT_PROFILE_ID) {
    notify("info", t("profile.defaultKept"))
    return
  }
  const yes = await ask(t("profile.delete"), { title: current.name, kind: "warning" })
  if (!yes) return
  state.remove(current.id)
  notify("info", t("profile.deleted", { name: current.name }))
}

/** Write the profile in use to a file, through the same bundle format the
 *  settings export already uses — a profile *is* a bundle with a name. */
export async function exportProfile(): Promise<void> {
  const current = useProfiles.getState().active()
  const path = await saveDialog({
    title: t("profile.export"),
    defaultPath: `${current.name}.reado-profile.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  })
  if (!path) return
  try {
    await writeSettingsFile(
      path,
      JSON.stringify({ name: current.name, ...current.bundle }, null, 2),
    )
    notify("success", t("sync.exported", { path }))
  } catch (e) {
    notifyError("profiles", t("sync.projectFailed"), e)
  }
}

/** Read a profile from a file, asking what to do when the name is taken. */
export async function importProfile(): Promise<void> {
  const picked = await openDialog({
    title: t("profile.import"),
    multiple: false,
    directory: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  })
  if (typeof picked !== "string") return
  const json = await readSettingsFile(picked).catch(() => null)
  const bundle = json && parseBundle(json)
  if (!bundle) {
    await ask(t("sync.invalid"), { title: t("profile.import"), kind: "error" })
    return
  }
  const name = (JSON.parse(json) as { name?: string }).name || picked.split("/").pop() || "Imported"
  const state = useProfiles.getState()
  let replace = false
  if (state.byName(name)) {
    // Never silently overwrite a configuration someone built up.
    replace = await ask(t("profile.exists", { name }), {
      title: t("profile.import"),
      okLabel: t("profile.replace"),
      cancelLabel: t("profile.keepBoth"),
    })
  }
  const profile = state.importProfile(name, bundle, replace)
  notify("success", t("profile.imported", { name: profile.name }))
}
