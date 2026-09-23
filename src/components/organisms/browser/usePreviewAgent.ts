import { type RefObject, useRef } from "react"
import { mirrorPreviewState, runPendingAgentCommand } from "@/lib/previewAgent"

/** The step that mirrors the pane's console + network to `.reado/` for the agent.
 *  Called from the pane's drain tick, after the drain. */
export function usePreviewAgentMirror(root: string): () => void {
  // Last console+network snapshot mirrored to `.reado/`, so we write only on change.
  const memo = useRef({ lastPersisted: "" })
  return () => mirrorPreviewState(root, memo.current)
}

/** The step that runs the agent's pending command, behind the credential gate.
 *  Called from the pane's drain tick, last. */
export function usePreviewAgentCommands(
  root: string,
  bodyRef: RefObject<HTMLDivElement | null>,
): () => Promise<void> {
  // The last command run, and the page we've already put an access request up
  // for — so a refused agent that keeps trying doesn't re-prompt the user who
  // already said "not now".
  const memo = useRef({ lastCmdId: "", askedFor: "" })
  return () =>
    runPendingAgentCommand(root, memo.current, () => bodyRef.current?.getBoundingClientRect())
}
