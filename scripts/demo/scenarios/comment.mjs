// Clip: read a function, spot the bug, leave a comment on the line.
// Needs a project with src/cart.ts (see scripts/demo/README.md for the fixture).
export const name = "reado-comment"

const LINE = 11 // `return total - total * rule.percent`
const NOTE = "Clamp the discount: VIP is 1.2, so the total goes negative."

export async function setup(app) {
  // English UI for README/site footage (dev profile only: the dev build has its own data dir).
  const lang = await app.js(`return JSON.parse(localStorage.getItem("reado.locale") || "{}").state?.locale`)
  if (lang !== "en") {
    await app.js(`localStorage.setItem("reado.locale", JSON.stringify({ state: { locale: "en" }, version: 0 }))
      setTimeout(() => location.reload(), 50); return true`)
    await app.sleep(6000) // bridge reconnects after reload
  }
  await app.js(`
    const r = window.__reado
    // bigger UI so code stays legible once the video is scaled down (dev profile only)
    r.useSettings.setState({ zoom: 1.35 })
    r.useLayout.getState().toggleArea("bottom", true)
    // a clean take: this is a throwaway fixture, so earlier takes' comments can go
    for (const c of [...r.useComments.getState().comments]) await r.useComments.getState().remove(c.id)
    r.useComments.getState().setActive(null)
    r.useProject.getState().open("src/cart.ts")
    return true`)
  await app.js(`
    let v
    for (let i = 0; i < 100 && !(v = window.__reado.useDocInfo.getState().view); i++) await window.__demo.sleep(50)
    if (!v) throw new Error("editor did not mount")
    v.dispatch({ selection: { anchor: 0 }, scrollIntoView: true })
    return true`)
}

export default async function (app) {
  // Read: sweep the cursor down the function, as if following the code.
  const at = (line, col = 0) => `(() => {
    const v = window.__reado.useDocInfo.getState().view
    const l = v.state.doc.line(${line})
    const c = v.coordsAtPos(Math.min(l.to, l.from + ${col}))
    return { x: c.left, y: (c.top + c.bottom) / 2 }
  })()`
  await app.js(`await window.__demo.moveTo(${at(5, 16)}, 700); return 1`)
  await app.sleep(500)
  await app.js(`await window.__demo.moveTo(${at(6, 24)}, 600); return 1`)
  await app.sleep(400)
  await app.js(`await window.__demo.moveTo(${at(LINE, 9)}, 700); return 1`)
  await app.sleep(500)

  // Select the line.
  await app.js(`
    const v = window.__reado.useDocInfo.getState().view
    const l = v.state.doc.line(${LINE})
    const ind = l.text.length - l.text.trimStart().length
    await window.__demo.moveTo(${at(LINE, 2)}, 350)
    v.dispatch({ selection: { anchor: l.from + ind, head: l.to } })
    v.focus()
    return 1`)
  await app.sleep(500)

  // ⌘⇧M: comment on the selection.
  await app.js(`
    window.__demo.say("⌘⇧M  Comment", 1100)
    window.__reado.useEditorActions.getState().requestCompose()
    return 1`)
  await app.sleep(900)
  await app.js(`
    const ta = await (async () => { for (let i = 0; i < 40; i++) { const t = document.querySelector("textarea"); if (t) return t; await window.__demo.sleep(50) } })()
    await window.__demo.moveTo(ta, 500)
    await window.__demo.type(ta, ${JSON.stringify(NOTE)}, 26)
    return 1`)
  await app.sleep(500)
  await app.js(`
    // the composer's own submit: the last button of the box that holds the textarea and its Cancel
    let box = document.querySelector("textarea")
    while (box && ![...box.querySelectorAll("button")].some((b) => b.textContent.trim() === "Cancel")) box = box.parentElement
    const btn = [...box.querySelectorAll("button")].at(-1)
    await window.__demo.click(btn)
    return 1`)
  await app.sleep(1600)
}
