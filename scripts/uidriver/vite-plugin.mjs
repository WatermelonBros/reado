// Vite dev-server plugin that acts as the UI-driver relay. Living inside the
// dev server means the in-webview bridge fetches it same-origin, which the
// app's CSP (`connect-src 'self'`) already allows — no separate process, no
// CSP loosening. Mounted under /__uidriver. Dev only.
//
//   agent (drive.mjs)  --POST /__uidriver/cmd-->   [vite]  --GET /__uidriver/poll-->  webview bridge
//   agent              <--result-------------------[vite]  <--POST /__uidriver/result-- webview bridge
const CMD_TIMEOUT = 30_000;
const POLL_TIMEOUT = 25_000;

export function uidriver() {
  let nextId = 1;
  const queue = []; // {id, cmd}
  const bridgeWaiters = []; // held GET /poll res
  const agentWaiters = new Map(); // id -> {res, timer}

  const json = (res, code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  const body = (req) =>
    new Promise((r) => {
      let d = "";
      req.on("data", (c) => (d += c));
      req.on("end", () => r(d));
    });
  const pump = () => {
    while (queue.length && bridgeWaiters.length) json(bridgeWaiters.shift(), 200, queue.shift());
  };

  return {
    name: "uidriver-relay",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__uidriver", async (req, res) => {
        const path = req.url.split("?")[0];

        if (req.method === "POST" && path === "/cmd") {
          const cmd = JSON.parse((await body(req)) || "{}");
          const id = nextId++;
          queue.push({ id, cmd });
          const timer = setTimeout(() => {
            agentWaiters.delete(id);
            json(res, 504, { ok: false, error: "bridge timeout (app running in dev?)" });
          }, CMD_TIMEOUT);
          agentWaiters.set(id, { res, timer });
          return pump();
        }

        if (req.method === "GET" && path === "/poll") {
          if (queue.length) return json(res, 200, queue.shift());
          bridgeWaiters.push(res);
          const t = setTimeout(() => {
            const i = bridgeWaiters.indexOf(res);
            if (i >= 0) bridgeWaiters.splice(i, 1);
            json(res, 200, { id: 0, cmd: { action: "noop" } });
          }, POLL_TIMEOUT);
          res.on("close", () => clearTimeout(t));
          return;
        }

        if (req.method === "POST" && path === "/result") {
          const { id, ok, value, error } = JSON.parse((await body(req)) || "{}");
          const w = agentWaiters.get(id);
          if (w) {
            clearTimeout(w.timer);
            agentWaiters.delete(id);
            json(w.res, 200, { ok, value, error });
          }
          return json(res, 200, { received: true });
        }

        if (path === "/health") return json(res, 200, { ok: true, queued: queue.length });
        json(res, 404, { error: "not found" });
      });
    },
  };
}
