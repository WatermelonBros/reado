/**
 * Test runner: detect the project's test setup and run tests in the integrated
 * terminal. Detection is by convention (manifests/lockfiles); running dispatches
 * the command to the terminal, which is the results surface (consistent with
 * Reado's terminal-centric, agent-friendly model). Read-first angle: see what's
 * covered/failing without leaving the reader.
 */
import { create } from "zustand";
import { readFile } from "./api";
import { runInTerminal } from "./agents";
import { useProject } from "./store";

export interface Runner {
  id: string;
  label: string;
  /** Command to run the whole suite. */
  all: string;
  /** Command to run tests for a project-relative file, if the framework supports it. */
  fileCmd?: (relPath: string) => string;
}

const has = async (root: string, path: string): Promise<boolean> => {
  const c = await readFile(root, path).catch(() => null);
  return !!c && c.kind === "text";
};
const text = async (root: string, path: string): Promise<string> => {
  const c = await readFile(root, path).catch(() => null);
  return c && c.kind === "text" ? c.text : "";
};

/** Detect the JS package manager from its lockfile (defaults to npm). */
async function jsPm(root: string): Promise<string> {
  if (await has(root, "pnpm-lock.yaml")) return "pnpm";
  if (await has(root, "yarn.lock")) return "yarn";
  if (await has(root, "bun.lockb")) return "bun";
  return "npm";
}

/** Detect available test runners by convention. */
export async function detectRunners(root: string): Promise<Runner[]> {
  const runners: Runner[] = [];

  const pkg = await text(root, "package.json");
  if (pkg) {
    try {
      const json = JSON.parse(pkg) as { scripts?: Record<string, string> };
      if (json.scripts?.test) {
        const pm = await jsPm(root);
        const run = pm === "npm" ? "npm test --" : `${pm} test`;
        runners.push({
          id: "js",
          label: `${pm} test`,
          all: pm === "npm" ? "npm test" : `${pm} test`,
          fileCmd: (f) => `${run} ${f}`,
        });
      }
    } catch {
      /* malformed package.json → skip */
    }
  }
  if (await has(root, "Cargo.toml")) {
    runners.push({ id: "rust", label: "cargo test", all: "cargo test" });
  }
  if (await has(root, "go.mod")) {
    runners.push({
      id: "go",
      label: "go test",
      all: "go test ./...",
      fileCmd: (f) => `go test ./${f.split("/").slice(0, -1).join("/")}`,
    });
  }
  if (
    (await has(root, "pyproject.toml")) ||
    (await has(root, "pytest.ini")) ||
    (await has(root, "setup.cfg"))
  ) {
    runners.push({ id: "python", label: "pytest", all: "pytest", fileCmd: (f) => `pytest ${f}` });
  }
  return runners;
}

interface TestsState {
  runners: Runner[];
  detect: (root: string) => Promise<void>;
  runAll: (r: Runner) => void;
  runFile: (r: Runner) => void;
}

export const useTests = create<TestsState>((set) => ({
  runners: [],
  detect: async (root) => set({ runners: await detectRunners(root) }),
  runAll: (r) => runInTerminal(r.all),
  runFile: (r) => {
    const active = useProject.getState().active;
    const root = useProject.getState().root;
    if (!active || !r.fileCmd) return;
    const rel = active.startsWith(root) ? active.slice(root.length).replace(/^[\\/]+/, "") : active;
    runInTerminal(r.fileCmd(rel.replace(/\\/g, "/")));
  },
}));
