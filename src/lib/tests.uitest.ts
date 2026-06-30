// Test-runner detection + the useTests store. api file IO and the shell dispatch
// are mocked; detection branches (pm, cargo, go, python) are covered.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./api", () => ({
  readFile: vi.fn(),
  listFiles: vi.fn(async () => []),
}));
vi.mock("./agents", () => ({ runInShell: vi.fn() }));
vi.mock("./logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  safeError: (e: unknown) => String(e),
}));

import { detectRunners, useTests, type Runner } from "./tests";
import { useProject } from "./store";
import { readFile, listFiles } from "./api";
import { runInShell } from "./agents";

const txt = (text: string) => ({ kind: "text" as const, text });

// Drive readFile by path: `present` maps a path to its text content; anything
// not listed rejects (file absent).
function mockFs(present: Record<string, string>) {
  vi.mocked(readFile).mockImplementation(async (_root, path) =>
    path in present ? txt(present[path]) : Promise.reject(new Error("absent")),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listFiles).mockResolvedValue([]);
});

describe("detectRunners — JS", () => {
  it("detects npm test (default pm) with a file command", async () => {
    mockFs({ "package.json": JSON.stringify({ scripts: { test: "vitest" } }) });
    const r = await detectRunners("/proj");
    const js = r.find((x) => x.id === "js")!;
    expect(js.label).toBe("npm test");
    expect(js.all).toBe("npm test");
    expect(js.fileCmd!("src/a.ts")).toBe("npm test -- src/a.ts");
  });

  it("detects pnpm from its lockfile", async () => {
    mockFs({
      "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
      "pnpm-lock.yaml": "lockfile",
    });
    const js = (await detectRunners("/proj")).find((x) => x.id === "js")!;
    expect(js.label).toBe("pnpm test");
    expect(js.all).toBe("pnpm test");
    expect(js.fileCmd!("src/a.ts")).toBe("pnpm test src/a.ts");
  });

  it("detects yarn from its lockfile", async () => {
    mockFs({
      "package.json": JSON.stringify({ scripts: { test: "x" } }),
      "yarn.lock": "lock",
    });
    expect((await detectRunners("/proj")).find((x) => x.id === "js")!.label).toBe("yarn test");
  });

  it("detects bun from its lockfile", async () => {
    mockFs({
      "package.json": JSON.stringify({ scripts: { test: "x" } }),
      "bun.lockb": "lock",
    });
    expect((await detectRunners("/proj")).find((x) => x.id === "js")!.label).toBe("bun test");
  });

  it("skips JS when package.json has no test script", async () => {
    mockFs({ "package.json": JSON.stringify({ scripts: { build: "x" } }) });
    expect((await detectRunners("/proj")).find((x) => x.id === "js")).toBeUndefined();
  });

  it("skips JS when package.json is malformed", async () => {
    mockFs({ "package.json": "{ not json" });
    expect((await detectRunners("/proj")).find((x) => x.id === "js")).toBeUndefined();
  });

  it("skips JS when there is no package.json", async () => {
    mockFs({});
    expect((await detectRunners("/proj")).find((x) => x.id === "js")).toBeUndefined();
  });
});

describe("detectRunners — Cargo", () => {
  it("uses a plain `cargo test` when a root manifest exists", async () => {
    mockFs({});
    vi.mocked(listFiles).mockResolvedValue(["Cargo.toml", "crates/core/Cargo.toml"]);
    const rust = (await detectRunners("/proj")).find((x) => x.id === "rust")!;
    expect(rust.all).toBe("cargo test");
  });

  it("targets each manifest when only subdirectory crates exist", async () => {
    mockFs({});
    vi.mocked(listFiles).mockResolvedValue([
      "crates\\b\\Cargo.toml", // backslashes get normalized
      "crates/a/Cargo.toml",
    ]);
    const rust = (await detectRunners("/proj")).find((x) => x.id === "rust")!;
    expect(rust.all).toBe(
      "cargo test --manifest-path crates/a/Cargo.toml && cargo test --manifest-path crates/b/Cargo.toml",
    );
  });

  it("ignores Cargo.toml under target/ and finds no rust runner", async () => {
    mockFs({});
    vi.mocked(listFiles).mockResolvedValue(["crates/x/target/debug/Cargo.toml"]);
    expect((await detectRunners("/proj")).find((x) => x.id === "rust")).toBeUndefined();
  });

  it("handles listFiles failing gracefully", async () => {
    mockFs({});
    vi.mocked(listFiles).mockRejectedValue(new Error("io"));
    expect((await detectRunners("/proj")).find((x) => x.id === "rust")).toBeUndefined();
  });
});

describe("detectRunners — Go & Python", () => {
  it("detects go test with a directory-scoped file command", async () => {
    mockFs({ "go.mod": "module x" });
    const go = (await detectRunners("/proj")).find((x) => x.id === "go")!;
    expect(go.all).toBe("go test ./...");
    expect(go.fileCmd!("pkg/util/a_test.go")).toBe("go test ./pkg/util");
  });

  it("detects pytest from pyproject.toml", async () => {
    mockFs({ "pyproject.toml": "[tool]" });
    const py = (await detectRunners("/proj")).find((x) => x.id === "python")!;
    expect(py.all).toBe("pytest");
    expect(py.fileCmd!("tests/test_a.py")).toBe("pytest tests/test_a.py");
  });

  it("detects pytest from pytest.ini", async () => {
    mockFs({ "pytest.ini": "[pytest]" });
    expect((await detectRunners("/proj")).find((x) => x.id === "python")).toBeDefined();
  });

  it("detects pytest from setup.cfg", async () => {
    mockFs({ "setup.cfg": "[metadata]" });
    expect((await detectRunners("/proj")).find((x) => x.id === "python")).toBeDefined();
  });

  it("returns no runners for an unrecognized project", async () => {
    mockFs({});
    expect(await detectRunners("/proj")).toEqual([]);
  });
});

describe("useTests store", () => {
  const runner: Runner = {
    id: "js",
    label: "pnpm test",
    all: "pnpm test",
    fileCmd: (f) => `pnpm test ${f}`,
  };

  beforeEach(() => {
    useTests.setState({ runners: [] });
    useProject.setState({ root: "/proj", active: null });
  });

  it("detect stores the detected runners", async () => {
    mockFs({ "go.mod": "module x" });
    await useTests.getState().detect("/proj");
    expect(useTests.getState().runners.map((r) => r.id)).toEqual(["go"]);
  });

  it("runAll dispatches the suite command to a shell", () => {
    useTests.getState().runAll(runner);
    expect(runInShell).toHaveBeenCalledWith("pnpm test");
  });

  it("runFile strips the project root and forward-slashes the rel path", () => {
    useProject.setState({ root: "/proj", active: "/proj/src/a.ts" });
    useTests.getState().runFile(runner);
    expect(runInShell).toHaveBeenCalledWith("pnpm test src/a.ts");
  });

  it("runFile passes through an active path outside the root", () => {
    useProject.setState({ root: "/proj", active: "/other/a.ts" });
    useTests.getState().runFile(runner);
    expect(runInShell).toHaveBeenCalledWith("pnpm test /other/a.ts");
  });

  it("runFile is a no-op when there is no active file", () => {
    useProject.setState({ root: "/proj", active: null });
    useTests.getState().runFile(runner);
    expect(runInShell).not.toHaveBeenCalled();
  });

  it("runFile is a no-op when the runner has no fileCmd", () => {
    useProject.setState({ root: "/proj", active: "/proj/src/a.ts" });
    useTests.getState().runFile({ id: "rust", label: "cargo test", all: "cargo test" });
    expect(runInShell).not.toHaveBeenCalled();
  });
});
