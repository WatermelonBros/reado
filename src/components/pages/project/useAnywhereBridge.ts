import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect } from "react"
import { dispatchToAgent } from "@/lib/agents"
import { anywhereClearProject, anywhereSetProject, type Objective, ptyWrite } from "@/lib/api"
import { baseName, useComments } from "@/lib/comments"
import { useGuidedReview } from "@/lib/guidedReview"
import { usePreReview } from "@/lib/preReview"
import { composeReviewPrompt } from "@/lib/review"
import { offSafe, useTerminals } from "@/lib/terminals"

/** Reado Anywhere's side of this window: the project it exposes, and the phone's requests it runs. */
export function useAnywhereBridge(root: string): void {
  // Reado Anywhere: expose this window's project to paired phones, and act on
  // their requests (run the agent / pre-review) when they target this project.
  useEffect(() => {
    if (!root) return
    const id = getCurrentWindow().label
    anywhereSetProject(id, root, baseName(root)).catch(() => {})
    const subs = [
      listen<string>("anywhere://run-agent", (e) => {
        if (e.payload !== root) return
        const tasks = useComments
          .getState()
          .comments.filter((c) => c.kind === "task" && c.state === "open")
        void dispatchToAgent(composeReviewPrompt(tasks.length))
      }),
      listen<string>("anywhere://prereview", (e) => {
        if (e.payload === root) usePreReview.getState().generate(root)
      }),
      // Keystrokes from a paired phone, typed into the agent terminal here. The
      // desktop owns the PTY, so it does the write — one writer, no interleaving.
      listen<string>("anywhere://agent-input", (e) => {
        const term = useTerminals.getState()
        const target =
          term.activeId && term.agentTerminals.includes(term.activeId)
            ? term.activeId
            : term.agentTerminals[0]
        if (target) void ptyWrite(target, e.payload).catch(() => {})
      }),
      // A paired phone triggered a guided-review agent action — run it here (the
      // agent lives on this desktop). Disposals the phone does hit disk directly.
      listen<{
        root: string
        id: string
        file: string
        action: string
        objective: string | null
      }>("anywhere://review-action", (e) => {
        const a = e.payload
        if (a.root !== root) return
        const g = useGuidedReview.getState()
        switch (a.action) {
          case "start":
            void g.start(root, { kind: "diff" }, (a.objective as Objective) ?? "bug_risk")
            break
          case "file":
            void g.reviewFile(root, a.id, a.file)
            break
          case "respond":
            void g.respond(root, a.id, a.file)
            break
          case "challenge":
            void g.challenge(root, a.id, a.file)
            break
          case "send":
            void g.sendTasks(root, a.id)
            break
        }
      }),
    ]
    return () => {
      anywhereClearProject(id).catch(() => {})
      // The unlisten can reject (Tauri's listener map may already be torn down
      // on a fast remount / StrictMode double-effect) — swallow it so it doesn't
      // surface as an unhandled rejection.
      for (const sub of subs) offSafe(sub)
    }
  }, [root])
}
