import { t } from "@/i18n"
import {
  type Agent,
  clearTerminal,
  dispatchToAgent,
  launchAgent,
  restartTerminal,
  runSelectionInTerminal,
} from "@/lib/agents"
import { openCount, useComments } from "@/lib/comments"
import { notify } from "@/lib/notice"
import { revealPanel } from "@/lib/panels"
import { composeReviewPrompt } from "@/lib/review"
import { useTerminals } from "@/lib/terminals"
import type { Command, CommandTable } from "./types"

const launch = (agent: Agent, bin: string): Command => ({
  run: () => void launchAgent(agent, bin),
})

/** The Terminal menu: panes, the bottom panels, and handing work to an agent. */
export const terminalCommands: CommandTable = {
  terminal: { run: () => useTerminals.getState().toggle() },
  "view:output": { run: () => revealPanel("output") },
  // Problems lives in the bottom dock, not on the activity bar, so this is how
  // it comes back if its tab was closed.
  "view:problems": { run: () => revealPanel("problems") },
  "terminal:runSelection": { run: () => void runSelectionInTerminal() },
  "terminal:new": { run: () => useTerminals.getState().add() },
  "terminal:split": { run: () => useTerminals.getState().split(), when: "terminal" },
  "terminal:clear": { run: () => clearTerminal(), when: "terminal" },
  "terminal:restart": { run: () => restartTerminal(), when: "terminal" },
  "terminal:togglePosition": { run: () => useTerminals.getState().togglePosition() },
  "terminal:launch:claude": launch("claude-code", "claude"),
  "terminal:launch:codex": launch("codex", "codex"),
  "terminal:launch:copilot": launch("copilot", "copilot"),
  "terminal:launch:gemini": launch("gemini", "gemini"),
  "terminal:launch:opencode": launch("opencode", "opencode"),
  "terminal:sendReview": {
    run: () => {
      const count = openCount(useComments.getState().comments)
      // Mirror the Comments/Terminal buttons, which disable at zero: sending a
      // review prompt with no open tasks would produce a meaningless request.
      if (count === 0) {
        notify("info", t("terminal.noTasks"))
        return
      }
      void dispatchToAgent(composeReviewPrompt(count))
    },
  },
}
