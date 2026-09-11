// Named configurations: what a profile holds, and the rule that makes switching
// safe — save before you load. (`uitest` because the store persists.)
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/i18n", () => ({ t: (k: string) => k }))

import { DEFAULT_PROFILE_ID, useProfiles } from "@/lib/profiles"
import { useSettings } from "@/lib/store"

const reset = () => {
  useProfiles.setState({
    profiles: [
      {
        id: DEFAULT_PROFILE_ID,
        name: "Default",
        bundle: { version: 1, settings: {}, extensionsDisabled: [] },
      },
    ],
    activeId: DEFAULT_PROFILE_ID,
  })
  useSettings.setState({ fontSize: 14, wrap: true })
}

beforeEach(reset)

describe("creating", () => {
  it("takes the configuration in use and becomes the active one", () => {
    useSettings.setState({ fontSize: 20 })
    const p = useProfiles.getState().createFromCurrent("Demo")
    expect(useProfiles.getState().activeId).toBe(p.id)
    expect(p.bundle.settings.fontSize).toBe(20)
  })

  it("keeps ids readable, and free, when a name repeats", () => {
    const a = useProfiles.getState().createFromCurrent("Rust")
    const b = useProfiles.getState().createFromCurrent("Rust")
    expect(a.id).toBe("rust")
    expect(b.id).toBe("rust-2")
  })
})

describe("switching", () => {
  it("saves what you changed before it loads the next", () => {
    // The rule that makes profiles trustworthy: an edit made while one was
    // active is part of it, not something the next switch throws away.
    const demo = useProfiles.getState().createFromCurrent("Demo")
    useSettings.setState({ fontSize: 22 })
    useProfiles.getState().switchTo(DEFAULT_PROFILE_ID)
    expect(useSettings.getState().fontSize).toBe(14)
    useProfiles.getState().switchTo(demo.id)
    expect(useSettings.getState().fontSize).toBe(22)
  })

  it("applies what the profile it switches to holds", () => {
    useProfiles.setState({
      profiles: [
        ...useProfiles.getState().profiles,
        {
          id: "big",
          name: "Big",
          bundle: { version: 1, settings: { fontSize: 28 }, extensionsDisabled: [] },
        },
      ],
    })
    useProfiles.getState().switchTo("big")
    expect(useSettings.getState().fontSize).toBe(28)
  })

  it("creating one also keeps the edits made under the profile being left", () => {
    // They were made while Default was active, so they are Default's — the same
    // save-before-you-leave rule, applied at the moment a profile is born.
    useSettings.setState({ fontSize: 20 })
    const big = useProfiles.getState().createFromCurrent("Big")
    useSettings.setState({ fontSize: 11 })
    useProfiles.getState().switchTo(DEFAULT_PROFILE_ID)
    expect(useSettings.getState().fontSize).toBe(20)
    useProfiles.getState().switchTo(big.id)
    expect(useSettings.getState().fontSize).toBe(11)
  })

  it("does nothing when asked for the profile already in use", () => {
    const before = useProfiles.getState().profiles
    useProfiles.getState().switchTo(DEFAULT_PROFILE_ID)
    expect(useProfiles.getState().profiles).toBe(before)
  })
})

describe("deleting", () => {
  it("refuses to remove Default", () => {
    useProfiles.getState().remove(DEFAULT_PROFILE_ID)
    expect(useProfiles.getState().profiles).toHaveLength(1)
  })

  it("falls back to Default when the active one goes", () => {
    useSettings.setState({ fontSize: 30 })
    const demo = useProfiles.getState().createFromCurrent("Demo")
    useProfiles.getState().remove(demo.id)
    expect(useProfiles.getState().activeId).toBe(DEFAULT_PROFILE_ID)
    // And Default's configuration is the one now in force.
    expect(useSettings.getState().fontSize).toBe(30)
  })
})

describe("importing", () => {
  const bundle = { version: 1, settings: { fontSize: 9 }, extensionsDisabled: [] }

  it("keeps both when the name is taken and the user says so", () => {
    useProfiles.getState().createFromCurrent("Rust")
    useProfiles.getState().importProfile("Rust", bundle)
    expect(useProfiles.getState().profiles.filter((p) => p.name === "Rust")).toHaveLength(2)
  })

  it("replaces when the user says to", () => {
    const first = useProfiles.getState().createFromCurrent("Rust")
    useProfiles.getState().importProfile("Rust", bundle, true)
    const all = useProfiles.getState().profiles.filter((p) => p.name === "Rust")
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(first.id)
    expect(all[0].bundle.settings.fontSize).toBe(9)
  })
})
