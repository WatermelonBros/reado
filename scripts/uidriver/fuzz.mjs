#!/usr/bin/env node
// Fuzz orchestrator: runs fuzz-batch.mjs repeatedly via the relay until the
// target action count is reached, draining the console-error buffer between
// batches and attributing any errors to their batch. Each action is a "test"
// (assertion: the app neither tripped the ErrorBoundary nor logged an error).
//
//   node scripts/uidriver/fuzz.mjs [targetCount]
import { readFileSync } from "node:fs";

const PORT = process.env.UIDRIVER_PORT || 1420;
const TARGET = Number(process.argv[2]) || 5000;
const batchJs = readFileSync(new URL("./fuzz-batch.mjs", import.meta.url), "utf8");

const cmd = async (action, extra = {}) => {
  const res = await fetch(`http://localhost:${PORT}/__uidriver/cmd`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  return res.json();
};

const errorsSeen = [];
let batch = 0;
let summary = { total: 0, crashes: 0 };
console.log(`[fuzz] target=${TARGET} actions; driving the live app…`);

while (summary.total < TARGET) {
  batch++;
  await cmd("errors", { clear: true }); // reset buffer for attribution
  const r = await cmd("eval", { js: batchJs });
  if (!r.ok) {
    console.error(`[fuzz] batch ${batch} eval failed: ${r.error}`);
    // brief settle (the app may be reloading); retry a few times then bail
    await new Promise((s) => setTimeout(s, 1500));
    if (batch > TARGET / 50 + 20) break;
    continue;
  }
  summary = r.value;
  const errs = await cmd("errors", {});
  const batchErrs = (errs.value || []).filter((e) => e.kind !== "console.warn");
  for (const e of batchErrs) errorsSeen.push({ batch, ...e });
  console.log(
    `[fuzz] batch ${batch}: ${summary.total}/${TARGET} actions | crashes ${summary.crashes} | console errors this batch ${batchErrs.length}`,
  );
}

// Dedupe console errors by message
const byMsg = {};
for (const e of errorsSeen) {
  const key = (e.message || "").slice(0, 120);
  byMsg[key] = byMsg[key] || { count: 0, kind: e.kind, firstBatch: e.batch };
  byMsg[key].count++;
}

console.log("\n========== FUZZ SUMMARY ==========");
console.log(`actions executed : ${summary.total}`);
console.log(`ErrorBoundary trips: ${summary.crashes}`);
if (summary.lastCrashes?.length) console.log(`last crashes: ${JSON.stringify(summary.lastCrashes)}`);
console.log(`action mix: ${JSON.stringify(summary.tally)}`);
console.log(`\nunique console errors/rejections: ${Object.keys(byMsg).length}`);
for (const [msg, info] of Object.entries(byMsg).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  [${info.kind} ×${info.count}] ${msg}`);
}
