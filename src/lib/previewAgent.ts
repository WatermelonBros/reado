/**
 * The agent's side of the preview pane: what it can read (the console and
 * network, mirrored to `.reado/`) and what it can do (one queued command at a
 * time) — both only while the user has turned agent access on.
 */
import {
  previewCaptureFrame,
  previewEval,
  previewNavigate,
  previewPersistState,
  previewPutResult,
  previewTakeCmd,
} from "./api"
import { isOriginAllowed, isPageGranted, originOf, usePreview } from "./preview"
import { GATED_REASON, PAGE_STATE_JS, type PageState, redact } from "./vault"

/**
 * Mirror the console + network to `.reado/` for the MCP whenever access is on.
 * The files' presence means "preview is live", so the initial empty state is
 * written too — but only when the snapshot actually changed, not on every idle
 * tick. `memo` carries the last snapshot written.
 */
export function mirrorPreviewState(root: string, memo: { lastPersisted: string }): void {
  const s = usePreview.getState()
  if (!root || !s.agentAccess) return
  // Redacted on the way out: this file is what the agent reads. The store
  // above keeps the real values, so the user's own inspector still shows
  // their own page the way a browser's developer tools would.
  const logsJson = redact(JSON.stringify(s.logs), s.secrets)
  const netJson = redact(JSON.stringify(s.net), s.secrets)
  const snap = `${logsJson}${netJson}`
  if (snap !== memo.lastPersisted) {
    memo.lastPersisted = snap
    void previewPersistState(root, logsJson, netJson)
  }
}

/**
 * Execute the agent's pending control command (opt-in only). eval covers
 * dom/animation/click/type (the CLI ships the JS); navigate is allowlisted.
 *
 * `memo` carries the last command id run (a command is run once) and the origin
 * an access request was last put up for. `frameRect` is the pane's on-screen
 * rectangle, for a frame capture.
 */
export async function runPendingAgentCommand(
  root: string,
  memo: { lastCmdId: string; askedFor: string },
  frameRect: () => DOMRect | undefined,
): Promise<void> {
  const s = usePreview.getState()
  if (!root || !s.agentAccess) return
  try {
    const raw = await previewTakeCmd(root)
    const cmd = raw ? (JSON.parse(raw) as { id?: string; op?: string; arg?: string }) : null
    if (cmd?.id && cmd.id !== memo.lastCmdId) {
      memo.lastCmdId = cmd.id
      let ok = true
      let result = ""
      // The gate: ask the page, right now, whether it holds a credential.
      // Checked per command rather than on the poll tick, so a password
      // typed a moment ago cannot be beaten by a command already queued.
      // A refusal is an answer — we never block waiting for the user.
      const state = await previewEval(PAGE_STATE_JS)
        .then((raw) => JSON.parse(raw || "null") as PageState | null)
        .catch(() => null)
      if (state?.hasSecret && !isPageGranted(state.href)) {
        // Asked once per origin, not once per URL: a sign-in walks several
        // pages of one site, and asking again at each step is the prompt
        // fatigue this gate exists to avoid.
        if (memo.askedFor !== originOf(state.href)) {
          memo.askedFor = originOf(state.href)
          usePreview.getState().setAccessRequest(state.href)
        }
        await previewPutResult(
          root,
          JSON.stringify({ id: cmd.id, ok: false, result: GATED_REASON }),
        )
        return
      }
      try {
        if (cmd.op === "eval") {
          result = await previewEval(cmd.arg ?? "")
        } else if (cmd.op === "navigate") {
          // Resolve a relative path (e.g. "/roadmap") against the current URL.
          let url = cmd.arg ?? ""
          try {
            url = new URL(url, usePreview.getState().url).href
          } catch {
            /* keep as-is; the allowlist check will reject a bad URL */
          }
          if (!isOriginAllowed(url, s.allowlist)) {
            ok = false
            result = "origin not allowed"
          } else {
            await previewNavigate(url)
            s.setUrl(url)
            result = url
          }
        } else if (cmd.op === "frame") {
          const r = frameRect()
          if (r) result = await previewCaptureFrame(r.left, r.top, r.width, r.height)
          else {
            ok = false
            result = "no preview region"
          }
        } else {
          ok = false
          result = `unknown op: ${cmd.op}`
        }
      } catch (e) {
        ok = false
        result = String(e)
      }
      await previewPutResult(
        root,
        redact(JSON.stringify({ id: cmd.id, ok, result }), usePreview.getState().secrets),
      )
    }
  } catch {
    /* no pending command */
  }
}
