/**
 * Agent activity feed: external file changes during a session — predominantly
 * the terminal AI agent resolving your comments (your own saves are excluded via
 * wasSelfWrite). An honest, read-only surface: it reports what changed, mapped to
 * the comments on those files; it never drives the agent.
 */
import { create } from "zustand";

export interface ActivityEntry {
  /** Project-relative path that changed. */
  file: string;
  /** Wall-clock ms of the most recent change to this file. */
  time: number;
}

const MAX = 100;

interface ActivityState {
  entries: ActivityEntry[];
  /** Record an external change to `file` (most recent first, de-duplicated). */
  record: (file: string, time: number) => void;
  clear: () => void;
}

export const useActivity = create<ActivityState>((set) => ({
  entries: [],
  record: (file, time) =>
    set((s) => ({
      entries: [{ file, time }, ...s.entries.filter((e) => e.file !== file)].slice(0, MAX),
    })),
  clear: () => set({ entries: [] }),
}));
