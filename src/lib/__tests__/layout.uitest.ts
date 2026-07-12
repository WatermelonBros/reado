// Layout store actions (the zustand wrapper around the reducers): group-id
// minting, size clamps, drag state, reset. jsdom for the persist middleware.
import { describe, it, expect, beforeEach } from "vitest";
import { useLayout, defaultLayout, findPanel } from "../layout";

beforeEach(() => {
  useLayout.setState({ layout: defaultLayout(), seq: 1, dragging: null });
});

describe("useLayout store", () => {
  it("mints a fresh group id from the counter when splitting", () => {
    const before = useLayout.getState().seq;
    useLayout.getState().move("browser", "bottom", { split: true });
    const at = findPanel(useLayout.getState().layout, "browser")!;
    expect(at.area).toBe("bottom");
    // New group id is derived from the bumped counter, so it's unique + stable.
    expect(at.groupId).toBe(`g${before + 1}`);
    expect(useLayout.getState().seq).toBe(before + 1);
  });

  it("stacks without minting a new group when not splitting", () => {
    useLayout.getState().move("browser", "bottom"); // onto the terminal group
    const l = useLayout.getState().layout;
    expect(l.areas.bottom.groups).toHaveLength(1);
    expect(l.areas.bottom.groups[0].tabs).toEqual(["terminal", "browser"]);
  });

  it("clamps area size to a sane minimum", () => {
    useLayout.getState().setAreaSize("bottom", 10);
    expect(useLayout.getState().layout.areas.bottom.size).toBe(120);
    useLayout.getState().setAreaSize("bottom", 400);
    expect(useLayout.getState().layout.areas.bottom.size).toBe(400);
  });

  it("clamps a group weight above zero so a group can't vanish", () => {
    const gid = useLayout.getState().layout.areas.bottom.groups[0].id;
    useLayout.getState().setGroupSize("bottom", gid, -5);
    expect(useLayout.getState().layout.areas.bottom.groups[0].size).toBe(0.1);
  });

  it("tracks transient drag state", () => {
    useLayout.getState().setDragging("browser");
    expect(useLayout.getState().dragging).toBe("browser");
    useLayout.getState().setDragging(null);
    expect(useLayout.getState().dragging).toBeNull();
  });

  it("reset restores the default arrangement and bumps the counter", () => {
    useLayout.getState().move("browser", "bottom", { split: true });
    const seqAfterMove = useLayout.getState().seq;
    useLayout.getState().reset();
    expect(findPanel(useLayout.getState().layout, "browser")).toEqual({ area: "right", groupId: "g-browser" });
    expect(useLayout.getState().seq).toBe(seqAfterMove + 1);
  });

  it("does not persist transient drag state", () => {
    // partialize keeps only layout + seq; dragging must never reach storage.
    useLayout.getState().setDragging("terminal");
    const raw = localStorage.getItem("reado.layout");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("dragging");
  });
});
