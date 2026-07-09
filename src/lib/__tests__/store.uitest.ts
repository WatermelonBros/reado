// Core Zustand stores — pure state logic (tabs, history, workspace, palette,
// editor actions, recents). No backend, no mocks. Runs on all 3 OSes.
import { describe, it, expect, beforeEach } from "vitest";
import {
  useProject,
  useWorkspace,
  usePalette,
  useEditorActions,
  useCursor,
  useRecents,
  useSessions,
  clampRange,
  FONT_SIZE_RANGE,
  LINE_HEIGHT_RANGE,
} from "../store";

beforeEach(() => {
  useProject.setState({
    root: "",
    tabs: [],
    active: null,
    navStack: [],
    navIndex: -1,
    closedTabs: [],
    splitPath: null,
    showHidden: false,
    landing: null,
  });
  useWorkspace.setState({ tool: "files", lastTool: "files", graphOpen: false, docsOpen: false, pendingSearch: null });
  usePalette.setState({ mode: null, settingsOpen: false, shortcutsOpen: false, anywhereOpen: false });
  useRecents.setState({ projects: [] });
  useSessions.setState({ byRoot: {} } as never);
});

describe("useProject — tabs", () => {
  const P = () => useProject.getState();
  it("open adds a tab, sets it active, and records history", () => {
    P().open("a.ts");
    expect(P().tabs).toEqual(["a.ts"]);
    expect(P().active).toBe("a.ts");
    expect(P().navStack).toHaveLength(1);
    expect(P().navIndex).toBe(0);
  });
  it("opening a second file appends and advances history", () => {
    P().open("a.ts");
    P().open("b.ts");
    expect(P().tabs).toEqual(["a.ts", "b.ts"]);
    expect(P().active).toBe("b.ts");
    expect(P().navStack).toHaveLength(2);
  });
  it("re-opening the active file does not duplicate the tab or history", () => {
    P().open("a.ts", 1);
    P().open("a.ts", 5); // same path, new line → collapses
    expect(P().tabs).toEqual(["a.ts"]);
    expect(P().navStack).toHaveLength(1);
    expect(P().landing?.line).toBe(5);
  });
  it("open with a line sets landing", () => {
    P().open("a.ts", 42);
    expect(P().landing).toMatchObject({ path: "a.ts", line: 42 });
  });
  it("close removes the tab and activates the last remaining when the active closed", () => {
    P().open("a.ts");
    P().open("b.ts");
    P().close("b.ts");
    expect(P().tabs).toEqual(["a.ts"]);
    expect(P().active).toBe("a.ts");
    expect(P().closedTabs).toContain("b.ts");
  });
  it("closing a non-active tab keeps the active", () => {
    P().open("a.ts");
    P().open("b.ts");
    P().close("a.ts");
    expect(P().active).toBe("b.ts");
  });
  it("moveTab reorders: before a target, to the end, and ignores no-ops", () => {
    P().open("a.ts");
    P().open("b.ts");
    P().open("c.ts");
    // Move c before a.
    P().moveTab("c.ts", "a.ts");
    expect(P().tabs).toEqual(["c.ts", "a.ts", "b.ts"]);
    // Move c to the end (beforePath null).
    P().moveTab("c.ts", null);
    expect(P().tabs).toEqual(["a.ts", "b.ts", "c.ts"]);
    // No-op and unknown path leave the order unchanged.
    P().moveTab("a.ts", "a.ts");
    P().moveTab("zzz.ts", "a.ts");
    expect(P().tabs).toEqual(["a.ts", "b.ts", "c.ts"]);
  });
  it("reopenClosed restores the last closed tab", () => {
    P().open("a.ts");
    P().close("a.ts");
    P().reopenClosed();
    expect(P().tabs).toContain("a.ts");
    expect(P().active).toBe("a.ts");
  });
  it("reopenClosed is a no-op with nothing closed", () => {
    const before = P().tabs;
    P().reopenClosed();
    expect(P().tabs).toBe(before);
  });
  it("cycleTab wraps forward and backward; no-op under 2 tabs", () => {
    P().open("a.ts");
    P().cycleTab(1);
    expect(P().active).toBe("a.ts"); // <2 tabs
    P().open("b.ts");
    P().open("c.ts");
    useProject.setState({ active: "a.ts" });
    P().cycleTab(1);
    expect(P().active).toBe("b.ts");
    P().cycleTab(-1);
    expect(P().active).toBe("a.ts");
    P().cycleTab(-1);
    expect(P().active).toBe("c.ts"); // wraps
  });
  it("closeOthers keeps only the given tab", () => {
    P().open("a.ts");
    P().open("b.ts");
    P().closeOthers("a.ts");
    expect(P().tabs).toEqual(["a.ts"]);
    expect(P().active).toBe("a.ts");
  });
  it("closeToRight trims tabs after the given one", () => {
    ["a.ts", "b.ts", "c.ts"].forEach((p) => P().open(p));
    P().closeToRight("a.ts");
    expect(P().tabs).toEqual(["a.ts"]);
  });
  it("closeAll empties tabs", () => {
    P().open("a.ts");
    P().closeAll();
    expect(P().tabs).toEqual([]);
    expect(P().active).toBeNull();
  });
  it("renamePath repoints an open tab and the active path", () => {
    P().open("old.ts");
    P().renamePath("old.ts", "new.ts");
    expect(P().tabs).toEqual(["new.ts"]);
    expect(P().active).toBe("new.ts");
  });
  it("setActive / setShowHidden / bumpTree / collapseTree", () => {
    P().open("a.ts");
    P().setActive("a.ts");
    expect(P().active).toBe("a.ts");
    P().setShowHidden(true);
    expect(P().showHidden).toBe(true);
    const t = P().treeNonce;
    P().bumpTree();
    expect(P().treeNonce).toBe(t + 1);
    const c = P().collapseNonce;
    P().collapseTree();
    expect(P().collapseNonce).toBe(c + 1);
  });
});

describe("useProject — history & split", () => {
  const P = () => useProject.getState();
  it("goBack / goForward walk the nav stack within bounds", () => {
    P().open("a.ts");
    P().open("b.ts");
    P().goBack();
    expect(P().active).toBe("a.ts");
    P().goForward();
    expect(P().active).toBe("b.ts");
    P().goForward(); // at the end → no-op
    expect(P().active).toBe("b.ts");
  });
  it("goBack is a no-op at the start", () => {
    P().open("a.ts");
    P().goBack();
    expect(P().active).toBe("a.ts");
  });
  it("openSplit uses the active path by default; swap/close work", () => {
    P().open("a.ts");
    P().openSplit();
    expect(P().splitPath).toBe("a.ts");
    P().open("b.ts");
    P().swapSplit();
    expect(P().active).toBe("a.ts");
    expect(P().splitPath).toBe("b.ts");
    P().closeSplit();
    expect(P().splitPath).toBeNull();
  });
  it("init seeds tabs/active/history from a session", () => {
    P().init("/root", { isRepo: true, branch: "main", ahead: 0, behind: 0, hasRemote: false, hasUpstream: false }, { id: "s", tabs: ["x.ts"], active: "x.ts" } as never);
    expect(P().root).toBe("/root");
    expect(P().git.branch).toBe("main");
    expect(P().tabs).toEqual(["x.ts"]);
    expect(P().navIndex).toBe(0);
  });
});

describe("useWorkspace", () => {
  const W = () => useWorkspace.getState();
  it("selectTool toggles the same tool off", () => {
    W().selectTool("git");
    expect(W().tool).toBe("git");
    W().selectTool("git");
    expect(W().tool).toBeNull();
  });
  it("toggleSidebar hides then restores the last tool", () => {
    W().selectTool("search");
    W().toggleSidebar();
    expect(W().tool).toBeNull();
    W().toggleSidebar();
    expect(W().tool).toBe("search");
  });
  it("searchFor opens search with a pending query; clearPendingSearch clears it", () => {
    W().searchFor("needle");
    expect(W().tool).toBe("search");
    expect(W().pendingSearch).toBe("needle");
    W().clearPendingSearch();
    expect(W().pendingSearch).toBeNull();
  });
  it("toggleGraph / toggleDocs flip and accept an explicit value", () => {
    W().toggleGraph();
    expect(W().graphOpen).toBe(true);
    W().toggleGraph(false);
    expect(W().graphOpen).toBe(false);
    W().toggleDocs(true);
    expect(W().docsOpen).toBe(true);
  });
  it("setSidebarWidth clamps to [180, innerWidth-360]", () => {
    W().setSidebarWidth(10);
    expect(W().sidebarWidth).toBe(180);
    W().setSidebarWidth(99999);
    expect(W().sidebarWidth).toBe(window.innerWidth - 360);
  });
});

describe("clampRange — editor reading controls", () => {
  it("clamps below/above the range to its bounds", () => {
    expect(clampRange(4, FONT_SIZE_RANGE)).toBe(FONT_SIZE_RANGE.min);
    expect(clampRange(999, FONT_SIZE_RANGE)).toBe(FONT_SIZE_RANGE.max);
    expect(clampRange(0.5, LINE_HEIGHT_RANGE)).toBe(LINE_HEIGHT_RANGE.min);
    expect(clampRange(9, LINE_HEIGHT_RANGE)).toBe(LINE_HEIGHT_RANGE.max);
  });
  it("passes an in-range value through", () => {
    expect(clampRange(14, FONT_SIZE_RANGE)).toBe(14);
    expect(clampRange(1.6, LINE_HEIGHT_RANGE)).toBe(1.6);
  });
  it("falls back to the range default for a non-finite value", () => {
    expect(clampRange(NaN, FONT_SIZE_RANGE)).toBe(FONT_SIZE_RANGE.default);
    expect(clampRange(Infinity, LINE_HEIGHT_RANGE)).toBe(LINE_HEIGHT_RANGE.default);
  });
});

describe("usePalette", () => {
  const Q = () => usePalette.getState();
  it("open/close set the mode", () => {
    Q().open("files");
    expect(Q().mode).toBe("files");
    Q().close();
    expect(Q().mode).toBeNull();
  });
  it("toggleSettings/Shortcuts/Anywhere flip and clear the palette mode", () => {
    Q().open("commands");
    Q().toggleSettings();
    expect(Q().settingsOpen).toBe(true);
    expect(Q().mode).toBeNull();
    Q().toggleShortcuts(true);
    expect(Q().shortcutsOpen).toBe(true);
    Q().toggleAnywhere(true);
    expect(Q().anywhereOpen).toBe(true);
  });
});

describe("useEditorActions", () => {
  const E = () => useEditorActions.getState();
  it("request* bump their nonces", () => {
    const c = E().composeNonce;
    E().requestCompose();
    expect(E().composeNonce).toBe(c + 1);
    const x = E().explainNonce;
    E().requestExplain();
    expect(E().explainNonce).toBe(x + 1);
    const p = E().peekNonce;
    E().requestPeek();
    expect(E().peekNonce).toBe(p + 1);
  });
  it("boolean/state setters", () => {
    E().setEditing(true);
    expect(E().editing).toBe(true);
    E().setDirty(true);
    expect(E().dirty).toBe(true);
    E().setDiffing(true);
    expect(E().diffing).toBe(true);
    E().setDiffBase("HEAD~1");
    expect(E().diffBase).toBe("HEAD~1");
    E().setBlame(true);
    expect(E().blame).toBe(true);
  });
});

describe("useCursor / useRecents / useSessions", () => {
  it("useCursor.set updates line and column", () => {
    useCursor.getState().set(12, 3);
    expect(useCursor.getState()).toMatchObject({ line: 12, col: 3 });
  });
  it("useRecents.touch adds + moves to front; remove drops it", () => {
    useRecents.getState().touch("/a");
    useRecents.getState().touch("/b");
    useRecents.getState().touch("/a"); // bump to front
    expect(useRecents.getState().projects[0].path).toBe("/a");
    useRecents.getState().remove("/a");
    expect(useRecents.getState().projects.find((p) => p.path === "/a")).toBeUndefined();
  });
});

describe("useSessions — save preserves per-file state", () => {
  const S = () => useSessions.getState();
  it("save (tabs/active) does NOT wipe scroll/cursor/expanded/split", () => {
    // Seed a session that already carries scroll + cursor + drill-down + split.
    useSessions.setState({
      byRoot: {
        "/root": {
          tabs: ["a.ts"],
          active: "a.ts",
          scroll: { "a.ts": 120 },
          cursor: { "a.ts": { line: 4, col: 2 } },
          expanded: ["src"],
          split: "b.ts",
        },
      },
    } as never);
    // A plain tab save (no scroll/cursor/expanded/split on the payload).
    S().save("/root", { tabs: ["a.ts", "b.ts"], active: "b.ts" });
    const sess = S().byRoot["/root"];
    // Tabs/active updated…
    expect(sess.tabs).toEqual(["a.ts", "b.ts"]);
    expect(sess.active).toBe("b.ts");
    // …but the preserved-via-`?? prev` fields survive (regression guard).
    expect(sess.scroll).toEqual({ "a.ts": 120 });
    expect(sess.cursor).toEqual({ "a.ts": { line: 4, col: 2 } });
    expect(sess.expanded).toEqual(["src"]);
    expect(sess.split).toBe("b.ts");
  });

  it("saveScroll updates only scroll and keeps tabs/active/cursor", () => {
    useSessions.setState({
      byRoot: {
        "/root": {
          tabs: ["a.ts"],
          active: "a.ts",
          scroll: { "a.ts": 10 },
          cursor: { "a.ts": { line: 1, col: 1 } },
        },
      },
    } as never);
    S().saveScroll("/root", "b.ts", 250);
    const sess = S().byRoot["/root"];
    // New scroll entry merged in, existing one kept.
    expect(sess.scroll).toEqual({ "a.ts": 10, "b.ts": 250 });
    // Everything else untouched.
    expect(sess.tabs).toEqual(["a.ts"]);
    expect(sess.active).toBe("a.ts");
    expect(sess.cursor).toEqual({ "a.ts": { line: 1, col: 1 } });
  });

  it("saveCursor merges a cursor without touching scroll", () => {
    useSessions.setState({
      byRoot: { "/root": { tabs: ["a.ts"], active: "a.ts", scroll: { "a.ts": 10 } } },
    } as never);
    S().saveCursor("/root", "a.ts", 7, 3);
    const sess = S().byRoot["/root"];
    expect(sess.cursor).toEqual({ "a.ts": { line: 7, col: 3 } });
    expect(sess.scroll).toEqual({ "a.ts": 10 });
  });
});

describe("useWorkspace — setCommentFilter (partial patch)", () => {
  const W = () => useWorkspace.getState();
  it("patches one field and leaves the others intact", () => {
    useWorkspace.setState({
      commentFilter: { view: "open", type: "all", state: "all", thisFile: false },
    });
    W().setCommentFilter({ type: "bug" });
    expect(W().commentFilter).toEqual({
      view: "open",
      type: "bug",
      state: "all",
      thisFile: false,
    });
    // A second patch on a different field composes without resetting the first.
    W().setCommentFilter({ thisFile: true });
    expect(W().commentFilter).toEqual({
      view: "open",
      type: "bug",
      state: "all",
      thisFile: true,
    });
  });
});

describe("useProject — toggleDir (tree drill-down)", () => {
  const P = () => useProject.getState();
  beforeEach(() => useProject.setState({ expandedDirs: [] }));
  it("toggling adds then removes a dir from expandedDirs", () => {
    P().toggleDir("src");
    expect(P().expandedDirs).toEqual(["src"]);
    P().toggleDir("src");
    expect(P().expandedDirs).toEqual([]);
  });
  it("explicit open flag is idempotent (no-op when already in that state)", () => {
    P().toggleDir("src", true);
    const first = P().expandedDirs;
    P().toggleDir("src", true); // already open → no state change
    expect(P().expandedDirs).toBe(first);
    P().toggleDir("src", false);
    expect(P().expandedDirs).toEqual([]);
  });
});
