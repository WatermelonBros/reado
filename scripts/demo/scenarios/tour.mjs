// The website's workflow tour, filmed on the real app: a guided review of the
// acme-shop `feature/discount-codes` branch, from Start review to the fix landing.
// One app.mark() per website beat (reado-web/components/tour/WorkflowTour.tsx).
//
// Needs: the dev app open on the fixture from scripts/demo/fixtures/make-shop.sh,
// and nothing else in its terminal — the scripted agent (scripts/demo/agent/claude)
// is started here and answers Reado's real prompts through the real CLI.
import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const name = "reado-tour"

const AGENT = join(dirname(fileURLToPath(import.meta.url)), "../agent/claude")
const NOTE = "Extract the line total into a helper — easier to test the rounding."

export async function setup(app) {
  const root = await app.js("return window.__reado.useProject.getState().root")
  // A clean take: back to the branch tip, no sessions, no comments.
  execSync("git checkout -q -- . && git clean -fdq -e .mcp.json -e .claude && rm -rf .reado", { cwd: root })
  execSync(`pkill -f "scripts/demo/agent/claude" || true`) // an agent left over from an earlier take
  await app.js(`
    const r = window.__reado
    // 100% UI in native fullscreen: the whole IDE in frame, at its real density
    r.useSettings.setState({ zoom: 1, reviewObjective: "bug_risk", showHidden: false })
    if (!(await window.__demo.within(r.win.isFullscreen(), 2000))) {
      r.runMenuCommand("view:fullscreen")
      await window.__demo.sleep(2500) // the macOS fullscreen animation
    }
    r.useProject.setState({ showHidden: false }) // no .git/.reado/.mcp.json noise in the tree
    r.useGuidedReview.setState({ currentId: null })
    const W = window.__demo.within
    await W(r.useGuidedReview.getState().load(${JSON.stringify(root)}))
    await W(r.useComments.getState().load?.(${JSON.stringify(root)}))
    r.useWorkspace.setState({ tool: "files" })
    r.useProject.getState().closeAll?.()
    r.useProject.getState().open(${JSON.stringify(root)} + "/src/cart.ts") // absolute, or the LSP can't resolve imports
    for (let i = 0; i < 100 && !r.useDocInfo.getState().view; i++) await window.__demo.sleep(50)
    return true`)
  // The agent: a terminal pane running the scripted stand-in. The terminal stays in
  // view for the whole take — the agent at work is half of the story.
  await app.js(`
    const r = window.__reado
    const T = () => r.useTerminals.getState()
    T().toggle(true)
    for (const s of [...T().sessions]) T().remove(s.id) // one fresh pane: the agent's
    const id = T().add()
    T().setActive(id)
    await window.__demo.sleep(1500) // let the shell boot
    await window.__demo.within(r.api.submitToTerminal(id, "clear; node ${AGENT}", 0))
    return id`)
  await app.sleep(2000)
  // make sure the Terminal tab (not Output/Problems) is the one showing — by clicking it
  await app.js(`
    const tab = [...document.querySelectorAll("button")].find((b) => b.offsetParent && b.textContent.trim() === "Terminal")
    if (tab) await window.__demo.click(tab)
    window.__demo.hide()
    return !!tab`)
  await app.sleep(800)
}

const waitFor = (test, ms = 20000) => `
  for (let i = 0, n = ${ms / 100}; i < n; i++) {
    const hit = (() => { ${test} })()
    if (hit) return true
    await window.__demo.sleep(100)
  }
  throw new Error("timed out waiting for: " + ${JSON.stringify(test)})`

const button = (text) =>
  `[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}) && !b.disabled && b.offsetParent)`

export default async function (app) {
  // 0 — A calm place to read, and review, code.
  app.mark("intro")
  await app.sleep(2200)

  // 1 — Open a guided review.
  app.mark("open-review")
  await app.js(`await window.__demo.click('[aria-label="Guided Review"]'); return 1`)
  await app.sleep(1400)

  // 2 — Point it at your changes: compare the branch, bug risk, start.
  app.mark("start")
  await app.js(`await window.__demo.click('[aria-label="What to review"]'); return 1`)
  await app.sleep(500)
  await app.js(`
    const opt = [...document.querySelectorAll("[role=option]")].find((o) => o.textContent.includes("Compare a branch"))
    await window.__demo.click(opt); return 1`)
  await app.sleep(900)
  await app.js(`await window.__demo.click(${button("Start review")}); return 1`)

  // 3 — The agent plans a route (the terminal opens as Reado hands it the prompt).
  app.mark("plan")
  await app.js(waitFor(`return ${button("Review this file")}`, 25000))
  await app.sleep(1600)

  // 4 — Review file by file.
  app.mark("review-file")
  await app.js(`await window.__demo.click(${button("Review this file")}); return 1`)

  // 5 — It proposes, never final.
  await app.js(waitFor(`return ${button("Approve")}`, 25000))
  app.mark("proposal")
  await app.sleep(2600)

  // 6 — You decide: approve it into a task.
  app.mark("approve")
  await app.js(`await window.__demo.click(${button("Approve")}); return 1`)
  await app.sleep(1800)

  // 7 — Review by hand, too: a comment of your own on line 6.
  app.mark("comment")
  const at = (line, col) => `(() => {
    const v = window.__reado.useDocInfo.getState().view
    const l = v.state.doc.line(${line})
    const c = v.coordsAtPos(Math.min(l.to, l.from + ${col}))
    return { x: c.left, y: (c.top + c.bottom) / 2 }
  })()`
  await app.js(`
    const v = window.__reado.useDocInfo.getState().view
    const l = v.state.doc.line(6)
    const ind = l.text.length - l.text.trimStart().length
    await window.__demo.moveTo(${at(6, 2)}, 700)
    v.dispatch({ selection: { anchor: l.from + ind, head: l.to } })
    v.focus()
    await window.__demo.sleep(300)
    window.__demo.say("⌘⇧M  Comment", 1100)
    window.__reado.useEditorActions.getState().requestCompose()
    return 1`)
  await app.js(`
    let ta
    for (let i = 0; i < 50 && !(ta = document.querySelector(".cm-editor ~ * textarea, [role=dialog] textarea") ?? [...document.querySelectorAll("textarea")].find((t) => t.placeholder.startsWith("Leave a comment"))); i++) await window.__demo.sleep(100)
    await window.__demo.moveTo(ta, 450)
    await window.__demo.type(ta, ${JSON.stringify(NOTE)}, 30)
    return 1`)
  await app.sleep(300)
  await app.js(`
    let box = document.querySelector("textarea")
    while (box && ![...box.querySelectorAll("button")].some((b) => b.textContent.trim() === "Cancel")) box = box.parentElement
    await window.__demo.click([...box.querySelectorAll("button")].at(-1))
    return 1`)
  await app.sleep(1400)

  // 8 — Ask a second opinion; approve what it raises.
  app.mark("second-opinion")
  await app.js(`await window.__demo.click(${button("Second opinion")}); return 1`)
  await app.js(waitFor(`return ${button("Approve")}`, 25000))
  await app.sleep(2200)
  await app.js(`await window.__demo.click(${button("Approve")}); return 1`)
  await app.sleep(1200)

  // 9 — Hand it to the agent.
  app.mark("send")
  await app.js(`await window.__demo.click(${button("Send")}); return 1`)

  // 10 — Resolved: the fix lands in the editor.
  await app.js(
    waitFor(`return window.__reado.useDocInfo.getState().view?.state.doc.toString().includes("roundCents")`, 30000),
  )
  app.mark("resolved")
  await app.sleep(1000)
  await app.js(`
    const v = window.__reado.useDocInfo.getState().view
    await window.__demo.moveTo(${at(12, 10)}, 800)
    return 1`)
  await app.sleep(2600)

  // 11 — Phone beat: the website overlays its own phone mock on the last frame.
  app.mark("phone")
}
