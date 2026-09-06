/**
 * "Disabled contributes nothing" is a promise that only holds if every consumer
 * reads the same filtered list. This pins the filter itself; the consumers reach
 * for it by construction.
 */
import { beforeEach, describe, expect, it } from "vitest"
import type { InstalledExt } from "@/lib/api"
import { useExtensions } from "@/lib/extensions"
import { enabledExtensions } from "@/lib/marketplace"

const ext = (id: string): InstalledExt => ({
  id,
  namespace: id.split(".")[0],
  name: id.split(".")[1],
  version: "1.0.0",
  displayName: id,
  manifest: { contributes: { themes: [{}] } },
})

beforeEach(() => useExtensions.setState({ disabled: [] }))

describe("enabledExtensions", () => {
  it("passes everything through when nothing is switched off", () => {
    const all = [ext("a.one"), ext("b.two")]
    expect(enabledExtensions(all)).toEqual(all)
  })

  it("drops the ones the user switched off", () => {
    useExtensions.getState().toggle("a.one", false)
    expect(enabledExtensions([ext("a.one"), ext("b.two")]).map((e) => e.id)).toEqual(["b.two"])
  })

  it("brings one back when it's switched on again", () => {
    useExtensions.getState().toggle("a.one", false)
    useExtensions.getState().toggle("a.one", true)
    expect(enabledExtensions([ext("a.one")]).map((e) => e.id)).toEqual(["a.one"])
  })
})
