import { describe, it, expect } from "vitest";
import { extractSymbols } from "./outline";

describe("extractSymbols", () => {
  it("finds functions, classes, types and variables in order", () => {
    const src = [
      "import x from 'y';",
      "export function add(a, b) {",
      "  return a + b;",
      "}",
      "const total = 1;",
      "class Box {",
      "  open() {",
      "  }",
      "}",
      "interface Shape {}",
    ].join("\n");

    const syms = extractSymbols(src).map((s) => `${s.kind}:${s.name}@${s.line}`);
    expect(syms).toEqual([
      "function:add@2",
      "variable:total@5",
      "class:Box@6",
      "method:open@7",
      "type:Shape@10",
    ]);
  });

  it("skips control-flow keywords that look like calls", () => {
    const syms = extractSymbols("  if (x) {\n  for (y) {");
    expect(syms).toEqual([]);
  });
});
