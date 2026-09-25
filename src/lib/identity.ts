/**
 * Who is reading and writing: the person a new human message is signed with, and
 * the faces that go with names in a thread.
 *
 * The core knows only the project's git `user.name` (asked of the backend per
 * project). A build embedding Reado can say more — the official build sets the
 * signed-in account (name, id, avatar) with `setMe`, and its organization's avatars
 * with `setAvatars` — and from then on new messages carry that account.
 */
import { create } from "zustand"
import { commentWriter, type Person } from "@/lib/api"

export interface Me extends Person {
  avatarUrl?: string | null
}

interface IdentityState {
  /** Set by the embedding build; wins over the git name. */
  account: Me | null
  /** The project's git `user.name`, for the open project. */
  git: Person | null
  /** Avatar URL by account id. */
  avatars: Record<string, string>
  setMe: (me: Me | null) => void
  setAvatars: (avatars: Record<string, string>) => void
  /** Look up the git name for the project that just opened. */
  loadGit: (root: string) => Promise<void>
}

export const useIdentity = create<IdentityState>()((set) => ({
  account: null,
  git: null,
  avatars: {},
  setMe: (account) => set({ account }),
  setAvatars: (avatars) => set((s) => ({ avatars: { ...s.avatars, ...avatars } })),
  loadGit: async (root) => {
    set({ git: await commentWriter(root).catch(() => null) })
  },
}))

/** Who a message written now is signed by, when the UI knows better than git. */
export function writerOverride(): Person | undefined {
  const a = useIdentity.getState().account
  return a ? { name: a.name, user: a.user } : undefined
}

/** Whether `by` is the person using this Reado. A message with no `by` predates
 *  names and was written here, so it counts as mine — as it always read. */
export function isMe(by: Person | undefined, s = useIdentity.getState()): boolean {
  if (!by) return true
  if (by.user) return by.user === s.account?.user
  const me = s.account ?? s.git
  return !!me && by.name === me.name
}

/** The picture for `by`, when there is one. */
export function avatarFor(by: Person | undefined, s = useIdentity.getState()): string | null {
  if (!by) return s.account?.avatarUrl ?? null
  if (by.user) return s.avatars[by.user] ?? (isMe(by, s) ? (s.account?.avatarUrl ?? null) : null)
  return isMe(by, s) ? (s.account?.avatarUrl ?? null) : null
}
