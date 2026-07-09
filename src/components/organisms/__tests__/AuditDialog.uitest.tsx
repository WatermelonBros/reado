// "Ask AI for an audit" dialog. Given a target (file/folder), it composes an
// audit prompt and injects it into the chosen/active terminal, then closes.
// The side effects are mocked: `submitToTerminal` (api), `composeAuditPrompt`
// (review) and the terminals store. i18n is stubbed globally (t(k) => k).
//
// Ark's dialog only mounts its portal content under real timers, so we never
// hold fake timers here — the modal renders synchronously on `open` and we read
// it with `await screen.findBy…`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { submitToTerminal } = vi.hoisted(() => ({ submitToTerminal: vi.fn() }));
vi.mock("../../../lib/api", () => ({ submitToTerminal }));

const { composeAuditPrompt } = vi.hoisted(() => ({
  composeAuditPrompt: vi.fn(() => "AUDIT_PROMPT"),
}));
vi.mock("../../../lib/review", () => ({ composeAuditPrompt }));

// Minimal terminals store: the component reads `sessions`/`activeId`/`add`
// through a selector hook. Keep it flat and mutable so each test can seed it.
const term = vi.hoisted(() => {
  const state = {
    sessions: [] as { id: string; title: string }[],
    activeId: null as string | null,
    add: vi.fn(() => {
      state.activeId = "t-new";
      return "t-new";
    }),
  };
  return { state };
});
vi.mock("../../../lib/terminals", () => ({
  useTerminals: Object.assign(
    (sel: (s: typeof term.state) => unknown) => sel(term.state),
    { getState: () => term.state },
  ),
}));

import { AuditDialog } from "../AuditDialog";

beforeEach(() => {
  vi.clearAllMocks();
  term.state.sessions = [{ id: "t1", title: "Terminal 1" }];
  term.state.activeId = "t1";
});

describe("AuditDialog", () => {
  it("renders nothing while there is no target", () => {
    render(<AuditDialog target={null} onClose={() => {}} />);
    expect(screen.queryByRole("heading", { name: "audit.title" })).not.toBeInTheDocument();
  });

  it("shows the title, instructions field and Cancel/Send when open", async () => {
    render(<AuditDialog target={{ path: "src/app.ts", isDir: false }} onClose={() => {}} />);
    expect(await screen.findByRole("heading", { name: "audit.title" })).toBeInTheDocument();
    // The target path is surfaced and the instructions textarea is present.
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "audit.placeholder");
    expect(screen.getByRole("button", { name: "common.cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "audit.send" })).toBeInTheDocument();
  });

  it("typing then Send composes the prompt, submits to the active terminal, and closes", async () => {
    const onClose = vi.fn();
    render(<AuditDialog target={{ path: "src/app.ts", isDir: false }} onClose={onClose} />);

    await userEvent.type(await screen.findByRole("textbox"), "look for auth bugs");
    await userEvent.click(screen.getByRole("button", { name: "audit.send" }));

    expect(composeAuditPrompt).toHaveBeenCalledWith("src/app.ts", "look for auth bugs");
    // Active terminal id, composed prompt, no defer (id === activeId → delay 0).
    expect(submitToTerminal).toHaveBeenCalledWith("t1", "AUDIT_PROMPT", 0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("spawns a terminal (deferred submit) when none is active", async () => {
    term.state.sessions = [];
    term.state.activeId = null;
    render(<AuditDialog target={{ path: "src", isDir: true }} onClose={() => {}} />);

    await userEvent.click(await screen.findByRole("button", { name: "audit.send" }));

    expect(term.state.add).toHaveBeenCalledOnce();
    // Freshly spawned PTY → 400ms defer so it's ready to receive.
    expect(submitToTerminal).toHaveBeenCalledWith("t-new", "AUDIT_PROMPT", 400);
  });

  it("Cancel closes without dispatching anything", async () => {
    const onClose = vi.fn();
    render(<AuditDialog target={{ path: "src/app.ts", isDir: false }} onClose={onClose} />);

    await userEvent.click(await screen.findByRole("button", { name: "common.cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(submitToTerminal).not.toHaveBeenCalled();
    expect(composeAuditPrompt).not.toHaveBeenCalled();
  });
});
