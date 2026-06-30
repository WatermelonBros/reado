#!/usr/bin/env node
// Agent-facing CLI for the UI driver. Sends one command to the relay and prints
// the result. Usage:
//   node drive.mjs snapshot
//   node drive.mjs click '{"ref":"e12"}'
//   node drive.mjs type '{"selector":"input","text":"foo","submit":true}'
//   node drive.mjs press '{"key":"Escape"}'
//   node drive.mjs eval '{"js":"return location.hash"}'
//   node drive.mjs errors '{"clear":true}'
// Talks to the relay embedded in the Vite dev server (default port 1420).
const PORT = process.env.UIDRIVER_PORT || 1420;
const action = process.argv[2];
if (!action) {
  console.error("usage: node drive.mjs <action> '<jsonArgs>'");
  process.exit(2);
}
// `eval @file.js` reads the JS body from a file, dodging shell/JSON escaping.
let extra = {};
const arg = process.argv[3];
if (arg?.startsWith("@")) {
  const { readFileSync } = await import("node:fs");
  extra = { js: readFileSync(arg.slice(1), "utf8") };
} else if (arg) {
  extra = JSON.parse(arg);
}
const res = await fetch(`http://localhost:${PORT}/__uidriver/cmd`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action, ...extra }),
}).catch((e) => {
  console.error(`relay unreachable on :${PORT} — is the dev server running? (${e.message})`);
  process.exit(1);
});
const body = await res.json();
if (!body.ok) {
  console.error(`ERR: ${body.error}`);
  process.exit(1);
}
console.log(typeof body.value === "string" ? body.value : JSON.stringify(body.value, null, 2));
