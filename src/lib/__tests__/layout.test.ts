// Dockable-panel layout reducers — pure model logic (areas / groups / tabs /
// move / split / remove). No React, no persistence. Runs on all 3 OSes.
import { describe, it, expect } from "vitest";
import {
  defaultLayout,
  findPanel,
  removePanel,
  movePanel,
  activatePanel,
  panelsInArea,
  type Layout,
} from "../layout";

const mv = (l: Layout, p: string, area: "left" | "right" | "bottom", opts: { split?: boolean; targetGroupId?: string } = {}) =>
  movePanel(l, p, area, { ...opts, newGroupId: `g-${p}-${area}` });

describe("defaultLayout", () => {
  it("places terminal in bottom and browser on the right, matching today", () => {
    const l = defaultLayout();
    expect(findPanel(l, "terminal")).toEqual({ area: "bottom", groupId: "g-terminal" });
    expect(findPanel(l, "browser")).toEqual({ area: "right", groupId: "g-browser" });
    expect(findPanel(l, "nope")).toBeNull();
  });
});

describe("movePanel", () => {
  it("splits a new group when moving into an empty area (browser beside nothing → own group)", () => {
    const l = mv(defaultLayout(), "browser", "bottom", { split: true });
    // Bottom now has two groups: terminal, then browser beside it.
    const bottom = l.areas.bottom.groups;
    expect(bottom).toHaveLength(2);
    expect(panelsInArea(l, "bottom")).toEqual(["terminal", "browser"]);
    // Browser left the right area, which is now empty.
    expect(l.areas.right.groups).toHaveLength(0);
    expect(findPanel(l, "browser")).toEqual({ area: "bottom", groupId: "g-browser-bottom" });
  });

  it("joins the area's first group as a tab when not splitting (browser stacks on terminal)", () => {
    const l = mv(defaultLayout(), "browser", "bottom");
    expect(l.areas.bottom.groups).toHaveLength(1);
    const g = l.areas.bottom.groups[0];
    expect(g.tabs).toEqual(["terminal", "browser"]);
    expect(g.active).toBe("browser"); // the moved panel becomes active
  });

  it("joins a specific target group when given its id", () => {
    // First split browser into its own bottom group, then move terminal into it.
    let l = mv(defaultLayout(), "browser", "bottom", { split: true });
    const browserGroup = findPanel(l, "browser")!.groupId;
    l = mv(l, "terminal", "bottom", { targetGroupId: browserGroup });
    const g = l.areas.bottom.groups.find((g) => g.id === browserGroup)!;
    expect(g.tabs).toEqual(["browser", "terminal"]);
    // Terminal's old group was emptied and pruned.
    expect(l.areas.bottom.groups).toHaveLength(1);
  });

  it("does not mutate the input layout", () => {
    const l = defaultLayout();
    const before = JSON.stringify(l);
    mv(l, "browser", "bottom");
    expect(JSON.stringify(l)).toBe(before);
  });

  it("moving a panel already in the target area just relocates it, no duplication", () => {
    let l = mv(defaultLayout(), "browser", "bottom", { split: true }); // browser in bottom
    l = mv(l, "browser", "bottom"); // move it again, stacking onto terminal
    // Still exactly one occurrence of browser across the whole tree.
    const count = (["left", "right", "bottom"] as const)
      .flatMap((a) => l.areas[a].groups)
      .flatMap((g) => g.tabs)
      .filter((t) => t === "browser").length;
    expect(count).toBe(1);
  });
});

describe("removePanel", () => {
  it("removes the panel and prunes the emptied group", () => {
    const l = removePanel(defaultLayout(), "terminal");
    expect(findPanel(l, "terminal")).toBeNull();
    expect(l.areas.bottom.groups).toHaveLength(0);
  });

  it("keeps the group and fixes the active tab when a stacked panel is removed", () => {
    let l = mv(defaultLayout(), "browser", "bottom"); // [terminal, browser], active browser
    l = removePanel(l, "browser");
    const g = l.areas.bottom.groups[0];
    expect(g.tabs).toEqual(["terminal"]);
    expect(g.active).toBe("terminal"); // active fell back to a surviving tab
  });

  it("is a no-op for a panel that isn't placed", () => {
    const l = defaultLayout();
    expect(removePanel(l, "ghost")).toEqual(l);
  });
});

describe("activatePanel", () => {
  it("switches the active tab within a stacked group", () => {
    let l = mv(defaultLayout(), "browser", "bottom"); // active browser
    l = activatePanel(l, "terminal");
    expect(l.areas.bottom.groups[0].active).toBe("terminal");
  });

  it("returns the same layout for an unplaced panel", () => {
    const l = defaultLayout();
    expect(activatePanel(l, "ghost")).toBe(l);
  });
});
