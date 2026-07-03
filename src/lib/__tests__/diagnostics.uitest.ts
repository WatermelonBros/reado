// LSP diagnostics store: per-file lists + error counts.
import { describe, it, expect, beforeEach } from "vitest";
import { useDiagnostics, type DiagItem } from "../diagnostics";

const diag = (severity: number): DiagItem => ({ line: 1, character: 0, severity, message: "m" });

beforeEach(() => useDiagnostics.getState().reset());

describe("setFileDiagnostics", () => {
  it("stores the list and counts errors (severity 1)", () => {
    useDiagnostics.getState().setFileDiagnostics("/a.ts", [diag(1), diag(2), diag(1)]);
    const s = useDiagnostics.getState();
    expect(s.byFile["/a.ts"]).toHaveLength(3);
    expect(s.errors["/a.ts"]).toBe(2);
  });

  it("stores the list but records no error entry when there are only warnings", () => {
    useDiagnostics.getState().setFileDiagnostics("/a.ts", [diag(2), diag(3)]);
    const s = useDiagnostics.getState();
    expect(s.byFile["/a.ts"]).toHaveLength(2);
    expect("/a.ts" in s.errors).toBe(false);
  });

  it("clears a previous error count when errors drop to zero", () => {
    useDiagnostics.getState().setFileDiagnostics("/a.ts", [diag(1)]);
    expect(useDiagnostics.getState().errors["/a.ts"]).toBe(1);
    useDiagnostics.getState().setFileDiagnostics("/a.ts", [diag(2)]);
    expect("/a.ts" in useDiagnostics.getState().errors).toBe(false);
  });

  it("removes the file entirely when the list is empty", () => {
    useDiagnostics.getState().setFileDiagnostics("/a.ts", [diag(1)]);
    useDiagnostics.getState().setFileDiagnostics("/a.ts", []);
    const s = useDiagnostics.getState();
    expect("/a.ts" in s.byFile).toBe(false);
    expect("/a.ts" in s.errors).toBe(false);
  });
});

describe("reset", () => {
  it("clears everything", () => {
    useDiagnostics.getState().setFileDiagnostics("/a.ts", [diag(1)]);
    useDiagnostics.getState().reset();
    const s = useDiagnostics.getState();
    expect(s.byFile).toEqual({});
    expect(s.errors).toEqual({});
  });
});
