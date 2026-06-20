/**
 * Lightweight, LSP-free symbol outline for the "Go to Symbol in File" palette.
 * Scans the document for declaration lines across common languages — heuristic,
 * but enough to jump around a file while reading.
 */
export interface OutlineSymbol {
  name: string;
  kind: "function" | "class" | "type" | "variable" | "method";
  /** 1-based line number. */
  line: number;
}

/** One matcher: a regex whose first capture group is the symbol name. */
const PATTERNS: { kind: OutlineSymbol["kind"]; re: RegExp }[] = [
  { kind: "function", re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/ },
  { kind: "function", re: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)/ }, // Rust
  { kind: "function", re: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/ }, // Go
  { kind: "function", re: /^\s*def\s+([A-Za-z_][\w]*)/ }, // Python/Ruby
  { kind: "class", re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { kind: "type", re: /^\s*(?:export\s+)?(?:interface|type|enum|struct|trait)\s+([A-Za-z_$][\w$]*)/ },
  { kind: "variable", re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/ },
  // Class methods: `name(args) {` indented, excluding control keywords.
  { kind: "method", re: /^\s+(?:public\s+|private\s+|protected\s+|static\s+|async\s+|readonly\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/ },
];

const KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return", "function", "constructor",
  "else", "do", "with", "super",
]);

/** Extract symbols from file text, in document order. */
export function extractSymbols(text: string): OutlineSymbol[] {
  const out: OutlineSymbol[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { kind, re } of PATTERNS) {
      const m = re.exec(line);
      if (m && m[1] && !KEYWORDS.has(m[1])) {
        out.push({ name: m[1], kind, line: i + 1 });
        break; // one symbol per line
      }
    }
  }
  return out;
}
