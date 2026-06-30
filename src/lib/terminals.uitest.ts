// Terminal panel state store — sessions, groups (splits), active tracking.
// Pure state (PTY lifecycle lives in the component). Mock only the logger.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));

import { useTerminals } from "./terminals";

const T = () => useTerminals.getState();

beforeEach(() => {
  useTerminals.setState({
    sessions: [],
    activeId: null,
    groups: [],
    activeGroupId: null,
    agentTerminals: [],
    lastAgent: null,
    open: false,
  });
});

describe("useTerminals — panel geometry", () => {
  it("clamps height and width", () => {
    T().setHeight(1);
    expect(T().height).toBe(120);
    T().setHeight(999999);
    expect(T().height).toBe(window.innerHeight - 160);
    T().setWidth(1);
    expect(T().width).toBe(240);
  });
  it("togglePosition flips bottom <-> right", () => {
    expect(T().position).toBe("bottom");
    T().togglePosition();
    expect(T().position).toBe("right");
    T().togglePosition();
    expect(T().position).toBe("bottom");
  });
});

describe("useTerminals — sessions & groups", () => {
  it("add creates a session in its own group and focuses it", () => {
    const id = T().add();
    expect(T().sessions.map((s) => s.id)).toEqual([id]);
    expect(T().groups).toHaveLength(1);
    expect(T().groups[0].paneIds).toEqual([id]);
    expect(T().activeId).toBe(id);
    expect(T().open).toBe(true);
  });

  it("split adds a pane to the active group", () => {
    const a = T().add();
    const b = T().split();
    expect(T().sessions).toHaveLength(2);
    expect(T().groups).toHaveLength(1);
    expect(T().groups[0].paneIds).toEqual([a, b]);
    expect(T().activeId).toBe(b);
  });

  it("split with no active group falls back to add (new group)", () => {
    const b = T().split();
    expect(T().groups).toHaveLength(1);
    expect(T().activeId).toBe(b);
  });

  it("remove drops the session and prunes an emptied group", () => {
    const a = T().add();
    T().remove(a);
    expect(T().sessions).toHaveLength(0);
    expect(T().groups).toHaveLength(0);
    expect(T().activeId).toBeNull();
  });

  it("remove of one pane keeps the group with the rest", () => {
    const a = T().add();
    const b = T().split();
    T().remove(a);
    expect(T().sessions.map((s) => s.id)).toEqual([b]);
    expect(T().groups[0].paneIds).toEqual([b]);
  });

  it("restart swaps the id in place and clears its agent flag", () => {
    const a = T().add();
    T().markAgent(a, "claude");
    T().restart(a);
    const nid = T().sessions[0].id;
    expect(nid).not.toBe(a);
    expect(T().activeId).toBe(nid);
    expect(T().agentTerminals).not.toContain(a);
  });

  it("restart is a no-op for an unknown id", () => {
    const before = T().sessions;
    T().restart("nope");
    expect(T().sessions).toBe(before);
  });

  it("markAgent records the terminal + last agent, idempotently", () => {
    const a = T().add();
    T().markAgent(a, "codex");
    T().markAgent(a, "codex");
    expect(T().agentTerminals).toEqual([a]);
    expect(T().lastAgent).toBe("codex");
  });

  it("removeGroup removes the group and all its sessions", () => {
    T().add();
    const g = T().activeGroupId!;
    T().split();
    T().removeGroup(g);
    expect(T().groups.find((x) => x.id === g)).toBeUndefined();
    expect(T().sessions).toHaveLength(0);
  });
});

describe("useTerminals — active & layout", () => {
  it("setActive focuses a pane and its owning group", () => {
    const a = T().add();
    const b = T().split();
    T().setActive(a);
    expect(T().activeId).toBe(a);
    expect(T().activeGroupId).toBe(T().groups[0].id);
    expect(b).toBeTruthy();
  });

  it("setActiveGroup focuses the group's first pane", () => {
    const a = T().add();
    const g = T().activeGroupId!;
    T().add(); // second group
    T().setActiveGroup(g);
    expect(T().activeId).toBe(a);
  });

  it("setGroupDir toggles or sets the split axis", () => {
    T().add();
    const g = T().activeGroupId!;
    expect(T().groups[0].dir).toBe("row");
    T().setGroupDir(g);
    expect(T().groups[0].dir).toBe("column");
    T().setGroupDir(g, "row");
    expect(T().groups[0].dir).toBe("row");
  });

  it("setSizes and setTitle update the group / session", () => {
    const a = T().add();
    const g = T().activeGroupId!;
    T().setSizes(g, [2, 1]);
    expect(T().groups[0].sizes).toEqual([2, 1]);
    T().setTitle(a, "build");
    expect(T().sessions[0].title).toBe("build");
  });

  it("toggle opens (creating the first terminal) and closes", () => {
    T().toggle();
    expect(T().open).toBe(true);
    expect(T().sessions).toHaveLength(1);
    T().toggle();
    expect(T().open).toBe(false);
    T().toggle(true);
    expect(T().open).toBe(true);
  });
});
