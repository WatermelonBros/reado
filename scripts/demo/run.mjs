#!/usr/bin/env node
// Run a demo scenario against the running Reado dev app, optionally recording it.
//
//   node scripts/demo/run.mjs scripts/demo/scenarios/comment.mjs            # rehearse
//   node scripts/demo/run.mjs scripts/demo/scenarios/comment.mjs --record   # record + export
//
// A scenario is an ES module: `export const name = "…"`, optional `setup(app)`
// (runs before recording starts) and `default async function (app)`. `app.js(body)`
// runs a JS body in the webview (keep each under the relay's 30 s timeout);
// `window.__demo` (demo-kit.js) is there for the cursor, clicks, typing, captions.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.UIDRIVER_PORT || 1420
const [file, flag] = process.argv.slice(2)
if (!file) {
  console.error("usage: node scripts/demo/run.mjs <scenario.mjs> [--record]")
  process.exit(2)
}

const kit = readFileSync(join(HERE, "demo-kit.js"), "utf8")

async function js(step) {
  const body = `${kit}\n${step}`
  const res = await fetch(`http://localhost:${PORT}/__uidriver/cmd`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "eval", js: body }),
  })
  const out = await res.json()
  if (!out.ok) throw new Error(`${out.error}\n  in: ${step.trim().split("\n").slice(0, 3).join(" ⏎ ")}`)
  return out.value
}

// Beat marks: seconds into the recording at which each story step begins, written
// next to the video as <name>.beats.json — the website maps its scroll steps to them.
const marks = []
let t0 = 0
const app = {
  js,
  mark: (label) => marks.push({ label, t: t0 ? +((Date.now() - t0) / 1000).toFixed(2) : 0 }),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  /** Call a window.__demo helper: app.demo("click", "button[aria-label=Save]") */
  demo: (fn, ...args) => js(`return await window.__demo.${fn}(...${JSON.stringify(args)})`),
}

const scenario = await import(pathToFileURL(resolve(file)).href)
const name = scenario.name ?? "demo"
const record = (cmd) =>
  execFileSync("bash", [join(HERE, "record.sh"), cmd, name], { stdio: "inherit" })

// the capture films a screen region: the dev window has to be the one in front
await js("window.__reado.win.setFocus(); return true") // not awaited inside: it may never settle
if (scenario.setup) await scenario.setup(app)

if (flag === "--record") {
  record("start")
  // record.sh returns 1 s after spawning ffmpeg, whose first frame lands ~0.6 s in
  t0 = Date.now() - 400
}
try {
  await app.sleep(600) // a still first beat
  await scenario.default(app)
  await app.sleep(900) // and a still last one
} finally {
  await js("window.__demo.hide(); return true").catch(() => {})
  if (flag === "--record") {
    record("stop")
    record("export")
    const out = join(process.env.DEMO_OUT ?? join(HERE, "../../docs/media"), `${name}.beats.json`)
    writeFileSync(out, `${JSON.stringify(marks, null, 2)}\n`)
    console.log(`beats -> ${out}`)
  }
}
