/**
 * Presentation metadata for comments: per-type colours, the ordered state and
 * type option lists, and author/agent identity. Kept separate so badges stay
 * consistent across the composer, thread popover and comment list.
 */
import type { ReactElement } from "react";
import type { CommentType, CommentState, Message } from "../../lib/api";
import type { MessageKey } from "../../i18n";
import { ClaudeIcon, CodexIcon } from "./icons";

export const COMMENT_TYPES: CommentType[] = [
  "bug",
  "refactor",
  "performance",
  "question",
  "note",
];

export const COMMENT_STATES: CommentState[] = [
  "open",
  "in-progress",
  "done",
  "discarded",
];

/** Distinct accent per type, drawn from the theme's semantic palette. */
export const TYPE_COLOR: Record<CommentType, string> = {
  bug: "var(--marker)",
  refactor: "var(--syn-keyword)",
  performance: "var(--syn-number)",
  question: "var(--syn-control)",
  note: "var(--text-muted)",
};

/**
 * The shared surface colour used by both the connector line and the thread box,
 * so they read as one shape. A neutral tone of the active theme (not tied to the
 * comment type), so it follows the theme (sepia → sepia, dark → dark) and stays
 * a readable background.
 */
export const ACCENT = (_t?: CommentType): string =>
  `color-mix(in oklab, var(--text-muted) 16%, var(--bg-elevated))`;

export const typeKey = (t: CommentType): MessageKey =>
  `comment.type.${t}` as MessageKey;
export const stateKey = (s: CommentState): MessageKey =>
  `comment.state.${s}` as MessageKey;

/** Human label for a known agent id, else the raw id. */
const AGENT_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  copilot: "Copilot",
};

/** Brand colour + glyph per agent, for attributing thread messages. */
export const AGENT_BRAND: Record<
  string,
  { color: string; Icon: (p: { className?: string }) => ReactElement }
> = {
  "claude-code": { color: "#D97757", Icon: ClaudeIcon },
  codex: { color: "#10A37F", Icon: CodexIcon },
};

/** The brand for a message's agent author, or null (user / unknown agent). */
export function agentBrand(message: Message) {
  if (message.author !== "agent" || !message.agent) return null;
  return AGENT_BRAND[message.agent] ?? null;
}

/** Display name for a thread message's author. */
export function authorLabel(message: Message, you: string): string {
  if (message.author !== "agent") return you;
  return message.agent ? (AGENT_NAMES[message.agent] ?? message.agent) : "AI";
}

/** A small colour dot used in badges. */
export function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 flex-none rounded-full"
      style={{ background: color }}
    />
  );
}
