// The app-menu precondition gating: `menuCommandEnabled` mirrors the palette's
// `when:` rules, and `runMenuCommand` surfaces a notice (instead of a silent
// no-op) when a command is invoked without its context. Stores are the real
// zustand ones; we only drive their state.
import { describe, it, expect, beforeEach } from "vitest";

import { menuCommandEnabled, runMenuCommand } from "../menu";
import { t } from "../../i18n";
import { useProject } from "../store";
import { useDocInfo } from "../docInfo";
import { useTerminals } from "../terminals";
import { useDiagnostics } from "../diagnostics";
import { useNotice } from "../notice";

// A fake editor view exposing only the selection emptiness the gate reads.
const view = (empty: boolean) =>
  ({ state: { selection: { main: { empty } } } }) as unknown as ReturnType<
    typeof useDocInfo.getState
  >["view"];

beforeEach(() => {
  useNotice.setState({ notices: [] });
  useDocInfo.setState({ view: null });
  useTerminals.setState({ sessions: [] });
  useDiagnostics.setState({ byFile: {}, errors: {} });
  useProject.setState({
    active: null,
    navStack: [],
    navIndex: -1,
    closedTabs: [],
    splitPath: null,
  });
});

describe("menuCommandEnabled", () => {
  it("treats unlisted commands as always available", () => {
    expect(menuCommandEnabled("settings")).toBe(true);
    expect(menuCommandEnabled("help:website")).toBe(true);
    expect(menuCommandEnabled("openFolder")).toBe(true);
  });

  it("gates file commands on an open editor", () => {
    expect(menuCommandEnabled("save")).toBe(false);
    expect(menuCommandEnabled("format")).toBe(false);
    useProject.setState({ active: "/proj/a.ts" });
    expect(menuCommandEnabled("save")).toBe(true);
    expect(menuCommandEnabled("format")).toBe(true);
  });

  it("gates selection commands on a non-empty selection", () => {
    useProject.setState({ active: "/proj/a.ts" });
    useDocInfo.setState({ view: view(true) }); // caret only
    expect(menuCommandEnabled("sel:explain")).toBe(false);
    useDocInfo.setState({ view: view(false) }); // real selection
    expect(menuCommandEnabled("sel:explain")).toBe(true);
  });

  it("gates history, reopen, terminal and problems on their state", () => {
    expect(menuCommandEnabled("go:back")).toBe(false);
    expect(menuCommandEnabled("reopenClosed")).toBe(false);
    expect(menuCommandEnabled("terminal:clear")).toBe(false);
    expect(menuCommandEnabled("go:nextProblem")).toBe(false);

    useProject.setState({
      navStack: [{ path: "a" }, { path: "b" }],
      navIndex: 1,
      closedTabs: ["x.ts"],
    });
    useTerminals.setState({ sessions: [{ id: "t1", title: "T" }] });
    useDiagnostics.setState({ byFile: { "/proj/a.ts": [{ line: 1, character: 0, severity: 1, message: "x" }] } });

    expect(menuCommandEnabled("go:back")).toBe(true);
    expect(menuCommandEnabled("reopenClosed")).toBe(true);
    expect(menuCommandEnabled("terminal:clear")).toBe(true);
    expect(menuCommandEnabled("go:nextProblem")).toBe(true);
  });
});

describe("runMenuCommand", () => {
  it("notifies instead of silently no-op'ing when the precondition is unmet", () => {
    runMenuCommand("save"); // no file open
    const notices = useNotice.getState().notices;
    expect(notices.length).toBe(1);
    expect(notices[0].text).toBe(t("menu.needFile"));
  });

  it("does not notify for an always-available command", () => {
    runMenuCommand("settings"); // pure store toggle, no precondition
    expect(useNotice.getState().notices.length).toBe(0);
  });
});
