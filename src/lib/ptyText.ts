/**
 * Reading what a terminal prints: the pure text half of the integrated terminal.
 *
 * Decoding the backend's base64 frames, cutting a stream into lines, stripping
 * the ANSI a program writes, finding the links in a line, and quoting a path for
 * the shell. No stores, no PTYs — `terminals.ts` owns those and re-exports these.
 */

/**
 * A clickable span found in one line of terminal output: either a web address
 * (opened in the browser) or a file path (opened in the editor).
 */
export interface TermLink {
  /** 0-based offset of the span in the line, and its length. */
  start: number
  length: number
  text: string
  /** Set for a web address; `path` is set instead for a file. */
  url?: string
  path?: string
  line?: number
}

// An address printed without a scheme, which `WebLinksAddon` (it only knows
// `scheme://…`) leaves behind: a dev server (`localhost:3000`, `127.0.0.1:8080`)
// or a bare domain. A host:port needs the port, so the word "localhost" in prose
// isn't a link; a domain needs a known TLD, so `Terminal.tsx` stays a file.
// ponytail: hand-picked TLDs, chosen not to collide with file extensions
// (no `.sh`, `.app`, `.ai`) — swap in a public-suffix list if it starts missing.
const HOST_RE =
  /\b(?:(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})|(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|dev|edu|gov|info|xyz|it)(?::\d{2,5})?)(?:\/[\w\-./~%&=?#+@:]*)?/gi

// An email address, and a URL that already carries its scheme — both matched
// only so the passes below skip them (`WebLinksAddon` owns scheme-ful URLs).
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g
const URL_RE = /\b[a-zA-Z][\w+.-]*:\/\/\S+/g

// A file path printed in output, with an optional :line:col or (line,col)
// suffix. Requires a real extension so we don't underline arbitrary words.
const PATH_RE = /(\/?[\w.\-~/@]*[\w-]+\.[A-Za-z][\w]*)(?::(\d+)(?::\d+)?|\((\d+),\d+\))?/g

/**
 * Find the clickable spans in one line of terminal output.
 *
 * Order matters, and each pass claims its span so the next leaves it alone:
 * `a@b.com` and `google.com` both parse as filenames with an extension, and an
 * email is neither a file nor a site — it is claimed but never linked, and so
 * is a `scheme://…` URL, which `WebLinksAddon` already owns.
 */
export function terminalLinks(text: string): TermLink[] {
  const links: TermLink[] = []
  const claimed: [number, number][] = []
  const taken = (i: number) => claimed.some(([from, to]) => i >= from && i < to)
  // `matchAll` over `exec`: these regexes live at module scope, so a loop that
  // walks `lastIndex` carries state from whatever line it last ran on.
  const claim = (m: RegExpExecArray) => claimed.push([m.index, m.index + m[0].length])

  for (const m of text.matchAll(URL_RE)) claim(m)
  for (const m of text.matchAll(EMAIL_RE)) claim(m)

  for (const m of text.matchAll(HOST_RE)) {
    if (taken(m.index)) continue
    claim(m)
    // A dev server is plain http; anything named by domain is https.
    const scheme = /^(?:localhost|\d)/.test(m[0]) ? "http" : "https"
    links.push({ start: m.index, length: m[0].length, text: m[0], url: `${scheme}://${m[0]}` })
  }

  for (const m of text.matchAll(PATH_RE)) {
    if (taken(m.index)) continue
    const line = m[2] ? +m[2] : m[3] ? +m[3] : undefined
    links.push({ start: m.index, length: m[0].length, text: m[0], path: m[1], line })
  }
  return links
}

/**
 * Quote a path for the shell (or an agent's prompt) so spaces survive.
 * POSIX quoting: on Windows `cmd` wants double quotes, but a space in a dropped
 * path is rare enough there that the extra platform branch isn't worth it.
 */
export const shellQuote = (p: string) =>
  /^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`

/** The raw bytes of one `pty-output-*` payload, or null when it is not a frame
 *  at all (a test's fake event, a future framing). */
export function frameBytes(payload: unknown): Uint8Array | null {
  const raw = typeof payload === "string" ? payload : String(payload)
  try {
    return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * Decode one `pty-output-*` payload into text.
 *
 * The backend base64-frames PTY output so escape sequences and non-UTF-8 bytes
 * survive the JSON event boundary. Anything reading that stream for meaning has
 * to undo that first; reading the frame as if it were the text matches nothing,
 * and matches nothing *silently*, which is how a matcher can look wired up and
 * never fire.
 *
 * One frame at a time. A reader following a whole stream wants
 * [`listenPtyLines`], whose decoder carries state across frames.
 */
export function decodePtyOutput(payload: unknown): string {
  const bytes = frameBytes(payload)
  return bytes ? new TextDecoder().decode(bytes) : String(payload)
}

/**
 * Strip the ANSI a program writes when it thinks it has a terminal — and it
 * does, because Reado gives it a real one.
 *
 * Three families, and the first one is why this exists: a shell sets the window
 * title with an **OSC** sequence (`ESC ] 2 ; … BEL`) and writes it *in front of*
 * the first line the command prints. Every reader here anchors its pattern at
 * the start of the line — the problem matchers, the test verdicts — so that
 * invisible prefix is the difference between a build's first error being
 * clickable and being missed. **CSI** covers colour and the private modes
 * (`ESC [ ? 2004 l`) a prompt toggles, whose `?` is part of the sequence.
 */
export const plainText = (line: string): string =>
  line
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes are control characters by definition.
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes are control characters by definition.
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: a backspace is a control character by definition.
    .replace(/.\u0008/g, "")
    .replace(/\r/g, "")

/**
 * Cut a PTY chunk into the lines a reader should see, and keep what isn't a line
 * yet.
 *
 * The backend reads the PTY in 8 KB blocks, so a chunk boundary lands mid-line
 * routinely in any long run. A consumer that splits each chunk on its own sees
 * the two halves of a verdict line and matches neither — silently, leaving a
 * test that passed showing as still running. The partial tail is carried across
 * chunks here, in the one place that knows the framing, so no reader has to.
 */
export function framePtyLines(tail: string, text: string): { lines: string[]; tail: string } {
  const parts = (tail + text).split("\n")
  // The last piece has no newline after it yet: it is the start of the next
  // line, not a line.
  const rest = parts.pop() ?? ""
  // A bare carriage return is a *redraw*, not a separator to delete: cargo draws
  // its progress bar, returns to column 0 and writes the first error over it, all
  // inside one newline-terminated line. Splitting there is the difference between
  // a reader seeing `error[E0308]: …` at the start of a line and seeing it glued
  // behind `Building [===]`, where every anchored pattern misses it.
  return { lines: parts.flatMap((l) => l.split("\r")).filter((l) => l !== ""), tail: rest }
}
