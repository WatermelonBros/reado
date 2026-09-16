/**
 * Guided Pair Review — the front of the review system.
 *
 * The LLM (the terminal agent) proposes a route, reviews file by file and drafts
 * artifacts through the `reado session`/`reado review` CLI; the human disposes of
 * each one here. Reado never calls an LLM directly: this store dispatches prompts
 * to the agent and reads the structured session it writes under `.reado/sessions/`.
 * The session watcher (`sessions-changed`) keeps the store fresh as the agent works.
 */
import { create } from "zustand"
import { type MessageKey, t } from "@/i18n"
import { dispatchToAgent } from "./agents"
import {
  type FileState,
  gitChangedFiles,
  type NewSession,
  type Objective,
  type Proposal,
  type ReviewScope,
  type RouteEntry,
  type Session,
  sessionAcceptProposal,
  sessionAcceptRouteChange,
  sessionAddDecision,
  sessionClose,
  sessionCreate,
  sessionDelete,
  sessionDiscardRouteChange,
  sessionGet,
  sessionList,
  sessionSetFileState,
  sessionSetFileSummary,
  sessionSetPosition,
  sessionSetProposalState,
  sessionSetSummary,
} from "./api"
import { useComments } from "./comments"
import { useResolveLoop } from "./resolveLoop"
import {
  composeGuidedChallengePrompt,
  composeGuidedCoverPrompt,
  composeGuidedFilePrompt,
  composeGuidedPlanPrompt,
  composeGuidedRespondPrompt,
  composeGuidedWidenPrompt,
  type PrRefs,
} from "./review"
import { useProject } from "./store"

/** Normalise a session so the optional (skip-when-empty) arrays are real arrays. */
function norm(s: Session): Session {
  return {
    ...s,
    route: s.route ?? [],
    files: s.files ?? [],
    proposals: s.proposals ?? [],
  }
}

const SCOPE_LABEL: Record<ReviewScope["kind"], string> = {
  diff: "the current diff",
  branch: "this branch vs its base",
  folder: "a folder",
  files: "selected files",
  comments: "open comments",
  project: "the whole project",
  pr: "a pull/merge request",
  prompt: "the requested review",
}

/** The same description in the user's language, for what the panel shows.
 *  `scopeDesc` stays English because it is written into the agent's prompt; a
 *  session title is read by the human, and used to be English anyway. */
function scopeLabel(scope: ReviewScope): string {
  if (scope.kind === "prompt" && scope.request) return scope.request
  if (scope.kind === "pr" && scope.pr) return `PR ${scope.pr}`
  if (scope.kind === "branch" && scope.base)
    return t("guided.scopeOf.branchBase", { base: scope.base })
  if ((scope.kind === "folder" || scope.kind === "files") && scope.paths?.length)
    return scope.paths.join(", ")
  return t(`guided.scopeOf.${scope.kind}` as MessageKey)
}

/** A short human description of a scope, for the agent's planning prompt. */
function scopeDesc(scope: ReviewScope): string {
  if (scope.kind === "prompt" && scope.request) return scope.request
  if (scope.kind === "pr" && scope.pr) return `PR ${scope.pr}`
  if (scope.kind === "branch" && scope.base) return `this branch vs ${scope.base}`
  if ((scope.kind === "folder" || scope.kind === "files") && scope.paths?.length)
    return scope.paths.join(", ")
  return SCOPE_LABEL[scope.kind]
}

/** The hidden git refs a PR was fetched into — a deterministic function of its
 *  number (see `forge_fetch_pr`), so any surface can recover them from the scope
 *  without threading extra state. `undefined` for non-PR scopes. */
export function prRefsFor(scope: ReviewScope): PrRefs | undefined {
  if (scope.kind !== "pr" || !scope.pr) return undefined
  const n = scope.pr.replace(/\D/g, "")
  if (!n) return undefined
  return { head: `refs/reado/pr-${n}`, base: scope.base ?? `refs/reado/pr-${n}-base` }
}

/** Open a project-relative file in the editor (the code is the hero). */
function openInEditor(root: string, file: string) {
  useProject.getState().open(`${root}/${file}`, 1)
}

/** The route entry the session's cursor currently points at. */
export function currentEntry(s: Session | null): RouteEntry | null {
  if (!s?.route?.length) return null
  return s.route[Math.min(s.position, s.route.length - 1)] ?? null
}

/** Reviewed-or-finished files over total routed files. */
export function progress(s: Session | null): { reviewed: number; total: number } {
  if (!s) return { reviewed: 0, total: 0 }
  const route = s.route ?? []
  const done = new Set(
    (s.files ?? [])
      .filter((f) => f.state === "reviewed" || f.state === "skipped" || f.state === "out_of_scope")
      .map((f) => f.file),
  )
  return { reviewed: route.filter((e) => done.has(e.file)).length, total: route.length }
}

/** Expected files the route left out — the coverage gap the human sees.
 *
 *  Mirrors `uncovered_files` in `crates/reado-core/src/session.rs`, which is what
 *  answers the agent when it sets a route: the two readings have to agree, or the
 *  panel and the agent would be arguing about different gaps. A file counts as
 *  covered when the route names it or when its state says it was left out on
 *  purpose; an empty expected set (a PR, a free-text request) has no gap. */
export function uncoveredFiles(s: Session | null): string[] {
  const routed = new Set((s?.route ?? []).map((e) => e.file))
  const excused = new Set(
    (s?.files ?? [])
      .filter((f) => f.state === "out_of_scope" || f.state === "skipped")
      .map((f) => f.file),
  )
  return (s?.expectedFiles ?? []).filter((f) => !routed.has(f) && !excused.has(f))
}

/** Open (still-proposed) artifacts in a session — the ones awaiting a decision. */
export function openProposals(s: Session | null): Proposal[] {
  // "edited" is still open — the human tweaked the text and hasn't disposed of it
  // yet. (Filtering it out made an edited comment vanish, looking like a lost save.)
  return (s?.proposals ?? []).filter((p) => p.state === "proposed" || p.state === "edited")
}

/** What the panel is waiting on, named by the control that started it
 *  (`"review:src/a.ts"`, `"widen"`), so one action in flight cannot make the
 *  whole panel look busy. */
export type ActionKey = string

interface GuidedReviewState {
  /** The project these sessions belong to — guards against stale, out-of-order
   *  loads landing in the wrong project after a rapid switch. */
  root: string
  sessions: Session[]
  currentId: string | null
  /** The action being handed to the agent right now (the prompt is still being
   *  typed into the pane), or null. */
  busy: ActionKey | null
  /** Handed over, and waiting. Reado does not run the model: the work happens in
   *  the terminal, and the session file changing is the only honest end
   *  condition we have — so that is what clears this. */
  pending: ActionKey | null
  /** The last failure, kept so it can be shown instead of swallowed. */
  error: string | null
  dismissError: () => void
  load: (root: string) => Promise<void>
  refresh: (root: string, id: string) => Promise<void>
  select: (id: string | null) => void
  start: (root: string, scope: ReviewScope, objective?: Objective) => Promise<Session | null>
  /** Make a file the current one and open it in the editor — no AI. */
  focusFile: (root: string, id: string, file: string) => Promise<void>
  reviewFile: (root: string, id: string, file: string) => Promise<void>
  challenge: (root: string, id: string, file: string) => Promise<void>
  /** The Big Pass: widen from the file-by-file walk to the whole subsystem. */
  widen: (root: string, id: string) => Promise<void>
  /** Reply to the comments already on a file (always available — not a new review). */
  respond: (root: string, id: string, file: string) => Promise<void>
  /** Ask the agent to route (or excuse) the files the plan left out. */
  cover: (root: string, id: string, files: string[]) => Promise<void>
  /** Dispose of the agent's proposed route change — the human decides. */
  acceptRouteChange: (root: string, id: string) => Promise<void>
  discardRouteChange: (root: string, id: string) => Promise<void>
  /** Set a file's state then advance to the next unfinished file and open it. */
  finishFile: (root: string, id: string, file: string, state: FileState) => Promise<void>
  accept: (root: string, id: string, proposalId: string, asNote?: boolean) => Promise<void>
  edit: (root: string, id: string, proposalId: string, body: string) => Promise<void>
  discard: (root: string, id: string, proposalId: string) => Promise<void>
  falsePositive: (root: string, id: string, proposalId: string, note: string) => Promise<void>
  setFileState: (root: string, id: string, file: string, state: FileState) => Promise<void>
  setFileSummary: (root: string, id: string, file: string, text: string) => Promise<void>
  decide: (root: string, id: string, text: string, file: string) => Promise<void>
  setSummary: (root: string, id: string, text: string) => Promise<void>
  sendTasks: (root: string, id: string) => Promise<void>
  close: (root: string, id: string) => Promise<void>
  /** Delete a session and return to a clean state (reset/start over). */
  discardSession: (root: string, id: string) => Promise<void>
}

function replace(list: Session[], s: Session): Session[] {
  const i = list.findIndex((x) => x.id === s.id)
  if (i === -1) return [s, ...list]
  const next = list.slice()
  next[i] = s
  return next
}

export const useGuidedReview = create<GuidedReviewState>((set, get) => {
  /**
   * Hand a prompt to the terminal agent.
   *
   * Three states, because the user cannot see the terminal from here: sending
   * (the pane is being typed into), waiting (sent — the agent is working), and
   * failed. The failure case is the one that used to be invisible:
   * `dispatchToAgent` answers `false` when there is no agent to send to, and
   * every call site ignored it, so the click did nothing and said nothing.
   */
  const handOff = async (key: ActionKey, prompt: string) => {
    set({ busy: key, error: null })
    const sent = await dispatchToAgent(prompt).catch(() => false)
    set({ busy: null, pending: sent ? key : null })
    if (!sent) set({ error: t("guided.err.noAgent") })
  }

  /** Report a failed backend call instead of swallowing it. `what` names the
   *  action in the user's language; the backend's own message follows it. */
  const fail = (what: string) => (e: unknown) => {
    set({ error: `${what} — ${e instanceof Error ? e.message : String(e)}` })
    return null
  }

  return {
    root: "",
    sessions: [],
    currentId: null,
    busy: null,
    pending: null,
    error: null,

    dismissError: () => set({ error: null }),

    load: async (root) => {
      // Record which project this load is for before the await; the existing merge
      // below recomputes currentId, so a switch is handled without pre-clearing.
      if (get().root !== root) set({ root })
      const sessions = (await sessionList(root).catch(() => [])).map(norm)
      // Guard against a stale load if the project changed while this was in flight,
      // so a slow load from the previous project can't overwrite the new one's list.
      if (get().root !== root) return
      set((st) => {
        const currentId =
          st.currentId && sessions.some((s) => s.id === st.currentId)
            ? st.currentId
            : (sessions.find((s) => s.status !== "done")?.id ?? sessions[0]?.id ?? null)
        // This load is how the watcher tells us the agent wrote something. If the
        // current session moved on, whatever we were waiting for has landed.
        const before = st.sessions.find((s) => s.id === currentId)?.updatedAt
        const after = sessions.find((s) => s.id === currentId)?.updatedAt
        return {
          sessions,
          currentId,
          pending: before !== undefined && after !== before ? null : st.pending,
        }
      })
    },

    refresh: async (root, id) => {
      const s = await sessionGet(root, id).catch(fail(t("guided.err.load")))
      if (s && get().root === root) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
    },

    select: (id) => set({ currentId: id }),

    start: async (root, scope, objective) => {
      // The file set Reado can read itself, kept instead of thrown away: it is what
      // the planner is told and what route coverage is later measured against. Only
      // the git-enumerable scopes have one — a PR lives in refs the working tree
      // doesn't hold, and a free-text request has no set at all.
      const expectedFiles =
        scope.kind === "diff" || scope.kind === "branch"
          ? await gitChangedFiles(root, scope.base).catch(() => [])
          : []
      // The CLI default title is friendlier than an empty one, so the desktop
      // sends its own — in the user's language, which it was not: a session
      // created from an Italian UI was titled "Review the current diff".
      const input: NewSession = {
        title: t("guided.sessionTitle", { scope: scopeLabel(scope) }),
        scope,
        objective,
        expectedFiles,
      }
      const created = await sessionCreate(root, input).catch(fail(t("guided.err.start")))
      if (!created) return null
      const s = norm(created)
      set((st) => ({ sessions: replace(st.sessions, s), currentId: s.id, pending: null }))
      void handOff(
        "plan",
        composeGuidedPlanPrompt(s.id, scopeDesc(scope), {
          objective: objective?.replace(/_/g, " "),
          files: expectedFiles,
          pr: prRefsFor(scope),
        }),
      )
      return s
    },

    focusFile: async (root, id, file) => {
      // Just show it: open in the editor and make it current — no agent.
      openInEditor(root, file)
      const idx = (get().sessions.find((x) => x.id === id)?.route ?? []).findIndex(
        (e) => e.file === file,
      )
      if (idx >= 0) {
        const updated = await sessionSetPosition(root, id, idx).catch(fail(t("guided.err.focus")))
        if (updated) set((st) => ({ sessions: replace(st.sessions, norm(updated)) }))
      }
    },

    reviewFile: async (root, id, file) => {
      const s = get().sessions.find((x) => x.id === id) ?? null
      const entry = (s?.route ?? []).find((e) => e.file === file)
      const objective = s?.objective?.replace(/_/g, " ")
      // Show the file, mark it in-review, then ask the agent to review it.
      await get().focusFile(root, id, file)
      await get().setFileState(root, id, file, "in_review")
      void handOff(
        `review:${file}`,
        composeGuidedFilePrompt(
          id,
          file,
          entry?.suggestedReviewMode ?? "normal",
          objective,
          s ? prRefsFor(s.scope) : undefined,
        ),
      )
    },

    challenge: async (_root, id, file) => {
      void handOff(`challenge:${file}`, composeGuidedChallengePrompt(id, file))
    },

    widen: async (_root, id) => {
      const session = get().sessions.find((x) => x.id === id)
      // Anchor the wide pass on the files the route already knows about, so it
      // widens around the review rather than wandering the whole repository.
      const files = (session?.route ?? []).map((e) => e.file)
      void handOff("widen", composeGuidedWidenPrompt(id, files))
    },

    respond: async (_root, id, file) => {
      void handOff(`respond:${file}`, composeGuidedRespondPrompt(id, file))
    },

    cover: async (_root, id, files) => {
      void handOff("cover", composeGuidedCoverPrompt(id, files))
    },

    acceptRouteChange: async (root, id) => {
      const s = await sessionAcceptRouteChange(root, id).catch(fail(t("guided.err.routeChange")))
      if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
    },

    discardRouteChange: async (root, id) => {
      const s = await sessionDiscardRouteChange(root, id).catch(fail(t("guided.err.routeChange")))
      if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
    },

    finishFile: async (root, id, file, state) => {
      const res = await sessionSetFileState(root, id, file, state).catch(
        fail(t("guided.err.fileState")),
      )
      if (!res) return
      const s = norm(res)
      set((st) => ({ sessions: replace(st.sessions, s) }))
      // Advance to the next file that still needs attention and open it.
      const isDone = (f: string) => {
        const st = s.files?.find((x) => x.file === f)?.state
        return st === "reviewed" || st === "skipped" || st === "out_of_scope"
      }
      const route = s.route ?? []
      const nextIdx = route.findIndex((e) => !isDone(e.file))
      if (nextIdx >= 0) {
        openInEditor(root, route[nextIdx].file)
        const updated = await sessionSetPosition(root, id, nextIdx).catch(
          fail(t("guided.err.focus")),
        )
        if (updated) set((st) => ({ sessions: replace(st.sessions, norm(updated)) }))
      }
    },

    accept: async (root, id, proposalId, asNote) => {
      const s = await sessionAcceptProposal(root, id, proposalId, asNote ? "note" : "task").catch(
        fail(t("guided.err.accept")),
      )
      if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
      // A durable comment was just created — reload the comments overlay.
      await useComments.getState().load(root)
    },

    edit: async (root, id, proposalId, body) => {
      const s = await sessionSetProposalState(root, id, proposalId, "edited", body).catch(
        fail(t("guided.err.proposal")),
      )
      if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
    },

    discard: async (root, id, proposalId) => {
      const s = await sessionSetProposalState(root, id, proposalId, "discarded").catch(
        fail(t("guided.err.proposal")),
      )
      if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
    },

    falsePositive: async (root, id, proposalId, note) => {
      const s = await sessionSetProposalState(
        root,
        id,
        proposalId,
        "resolved_as_false_positive",
        note,
      ).catch(fail(t("guided.err.proposal")))
      if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
    },

    setFileState: async (root, id, file, state) => {
      const s = await sessionSetFileState(root, id, file, state).catch(
        fail(t("guided.err.fileState")),
      )
      if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
    },

    setFileSummary: async (root, id, file, text) => {
      const s = await sessionSetFileSummary(root, id, file, text).catch(
        fail(t("guided.err.summary")),
      )
      if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
    },

    decide: async (root, id, text, file) => {
      await sessionAddDecision(root, id, text, file).catch(fail(t("guided.err.decision")))
      await get().refresh(root, id)
    },

    setSummary: async (root, id, text) => {
      const s = await sessionSetSummary(root, id, text).catch(fail(t("guided.err.summary")))
      if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
    },

    sendTasks: async (root, id) => {
      const s = get().sessions.find((x) => x.id === id)
      // Only this session's confirmed tasks (the ones materialised into comments).
      const ids = (s?.proposals ?? [])
        .filter((p) => p.state === "converted_to_task" && p.commentId)
        .map((p) => p.commentId as string)
      if (ids.length === 0) return
      // Hand off to the async resolve loop, pre-scoped to exactly these tasks; it
      // dispatches the agent and tracks resolution from here.
      await useResolveLoop.getState().start(root, ids, id)
    },

    close: async (root, id) => {
      const s = await sessionClose(root, id).catch(fail(t("guided.err.close")))
      if (s) set((st) => ({ sessions: replace(st.sessions, norm(s)) }))
    },

    discardSession: async (root, id) => {
      await sessionDelete(root, id).catch(fail(t("guided.err.discardSession")))
      set((st) => {
        const sessions = st.sessions.filter((s) => s.id !== id)
        const currentId =
          st.currentId === id
            ? (sessions.find((s) => s.status !== "done")?.id ?? sessions[0]?.id ?? null)
            : st.currentId
        return { sessions, currentId, pending: null }
      })
    },
  }
})
