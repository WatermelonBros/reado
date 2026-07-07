/**
 * Specs browser model. Reado is AI-first, so the plan lives next to the code:
 * this surfaces an OpenSpec project's change proposals and capability specs (and
 * a speckit `.specify/` tree) as a tidy, ordered list you can read alongside the
 * source. Read-only — it just points the editor at the right markdown.
 */
import { create } from "zustand";
import { listFiles } from "./api";

export interface SpecItem {
  /** Display label: a document name ("proposal.md") or a capability ("auth"). */
  label: string;
  /** Project-relative path, for opening in the editor. */
  path: string;
  /** True for a capability spec delta, false for a change document. */
  isSpec: boolean;
}

export interface SpecGroup {
  title: string;
  kind: "change" | "spec";
  items: SpecItem[];
}

/** Order the well-known OpenSpec + speckit documents first, then anything else. */
const FILE_ORDER = [
  "spec.md",
  "proposal.md",
  "plan.md",
  "design.md",
  "research.md",
  "data-model.md",
  "tasks.md",
  "quickstart.md",
];
const fileRank = (label: string) => {
  const base = label.split("/").pop() ?? label;
  const i = FILE_ORDER.indexOf(base);
  return i < 0 ? FILE_ORDER.length : i;
};

/** Group the project's spec markdown into changes and capability specs. */
export function groupSpecs(files: string[]): SpecGroup[] {
  const md = files
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => /\.(md|markdown)$/i.test(f));

  const groups = new Map<string, SpecGroup>();
  const add = (key: string, group: Omit<SpecGroup, "items">, item: SpecItem) => {
    const g = groups.get(key) ?? { ...group, items: [] };
    g.items.push(item);
    groups.set(key, g);
  };

  // speckit keeps features under a top-level `specs/` and config under
  // `.specify/`; only treat a bare `specs/` as speckit when one of those signals
  // is present, so a random `specs/` folder isn't mistaken for a plan.
  const speckit =
    md.some((f) => /(?:^|\/)\.specify\//.test(f)) ||
    md.some((f) => /(?:^|\/)specs\/[^/]+\/plan\.md$/.test(f));

  for (const path of md) {
    let m: RegExpMatchArray | null;
    // --- OpenSpec ---
    // A capability spec delta nested under a change → label by capability.
    if ((m = path.match(/(?:^|\/)\.?openspec\/changes\/([^/]+)\/specs\/([^/]+)\/(.+)$/))) {
      const label = m[3] === "spec.md" ? m[2] : `${m[2]}/${m[3]}`;
      add(`change:${m[1]}`, { title: m[1], kind: "change" }, { label, path, isSpec: true });
    }
    // A change document (proposal/design/tasks) directly under the change.
    else if ((m = path.match(/(?:^|\/)\.?openspec\/changes\/([^/]+)\/([^/]+)$/))) {
      add(`change:${m[1]}`, { title: m[1], kind: "change" }, { label: m[2], path, isSpec: false });
    }
    // A standalone OpenSpec capability spec.
    else if ((m = path.match(/(?:^|\/)\.?openspec\/specs\/([^/]+)\/(.+)$/))) {
      add(`spec:${m[1]}`, { title: m[1], kind: "spec" }, { label: m[2], path, isSpec: true });
    }
    // --- speckit ---
    // A feature's documents (spec/plan/tasks/research/…) under top-level specs/.
    else if (speckit && (m = path.match(/(?:^|\/)specs\/([^/]+)\/(.+)$/))) {
      add(`change:${m[1]}`, { title: m[1], kind: "change" }, { label: m[2], path, isSpec: false });
    }
    // speckit project memory (constitution, …).
    else if ((m = path.match(/(?:^|\/)\.specify\/([^/]+)\/(.+)$/))) {
      add(`spec:${m[1]}`, { title: m[1], kind: "spec" }, { label: m[2], path, isSpec: true });
    }
  }

  for (const g of groups.values()) {
    // Documents first (proposal → design → tasks), then capability specs A→Z.
    g.items.sort(
      (a, b) =>
        Number(a.isSpec) - Number(b.isSpec) ||
        fileRank(a.label) - fileRank(b.label) ||
        a.label.localeCompare(b.label),
    );
  }
  // Changes first, then specs; each alphabetical.
  return [...groups.values()].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "change" ? -1 : 1) || a.title.localeCompare(b.title),
  );
}

interface SpecsState {
  groups: SpecGroup[];
  /** Keys of *expanded* groups (`kind:title`). Groups are collapsed by default —
   *  a change shows only its name until opened. Session-scoped (survives tool
   *  switches, not a full reload). */
  expanded: Set<string>;
  toggleExpanded: (key: string) => void;
  /** Collapse every group (clear expansions). */
  collapseAll: () => void;
  /** Expand every group whose key is given. */
  expandAll: (keys: string[]) => void;
  load: (root: string) => Promise<void>;
}

export const useSpecs = create<SpecsState>((set) => ({
  groups: [],
  expanded: new Set(),
  toggleExpanded: (key) =>
    set((s) => {
      const next = new Set(s.expanded);
      next.has(key) ? next.delete(key) : next.add(key);
      return { expanded: next };
    }),
  collapseAll: () => set({ expanded: new Set() }),
  expandAll: (keys) => set({ expanded: new Set(keys) }),
  load: async (root) => {
    try {
      set({ groups: groupSpecs(await listFiles(root)) });
    } catch {
      set({ groups: [] });
    }
  },
}));
