// The layout checks catch what they claim to — a check that can't fail proves
// nothing about the app it passes on.
import { afterEach, expect, it } from "vitest"
import { coveredBy, outsideViewport } from "./layoutChecks"

const box = (style: string) => {
  const el = document.createElement("div")
  el.style.cssText = `position:fixed;width:100px;height:60px;background:red;${style}`
  document.body.append(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ""
})

it("sees a panel stacked under another layer", () => {
  const panel = box("left:100px;top:100px;z-index:1")
  expect(coveredBy(panel)).toBeNull()
  box("left:120px;top:110px;z-index:2")
  expect(coveredBy(panel)).not.toBeNull()
})

it("looks through pointer-events: none on the panel itself", () => {
  const tooltip = box("left:100px;top:100px;z-index:1;pointer-events:none")
  expect(coveredBy(tooltip)).toBeNull()
})

it("sees a panel hanging off the window", () => {
  expect(outsideViewport(box("left:10px;top:10px"))).toBeNull()
  expect(outsideViewport(box("left:-40px;top:10px"))).toMatch(/left/)
  expect(outsideViewport(box(`left:${window.innerWidth - 50}px;top:10px`))).toMatch(/right/)
})
