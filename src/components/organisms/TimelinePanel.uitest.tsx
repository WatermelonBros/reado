// UI test: the Timeline panel loads the active file's git history and selects a
// commit to diff against. The git edge is mocked; no real repo is touched.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FileCommit } from "../../lib/api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));
const gitFileHistory = vi.fn<(root: string, file: string) => Promise<FileCommit[]>>();
vi.mock("../../lib/api", async (orig) => ({
  ...(await orig<typeof import("../../lib/api")>()),
  gitFileHistory: (root: string, file: string) => gitFileHistory(root, file),
}));

import { TimelinePanel } from "./TimelinePanel";
import { useProject, useEditorActions } from "../../lib/store";

const ROOT = "/repo";
const now = Math.floor(Date.now() / 1000);

beforeEach(() => {
  gitFileHistory.mockReset();
  useEditorActions.setState({ diffing: false, diffBase: "HEAD" });
  useProject.setState({ root: ROOT, active: null });
});

describe("TimelinePanel", () => {
  it("shows the no-file state when nothing is active", () => {
    gitFileHistory.mockResolvedValue([]);
    render(<TimelinePanel />);
    expect(screen.getByText("timeline.noFile")).toBeInTheDocument();
    expect(gitFileHistory).not.toHaveBeenCalled();
  });

  it("shows the empty state when the file has no history", async () => {
    gitFileHistory.mockResolvedValue([]);
    useProject.setState({ root: ROOT, active: `${ROOT}/src/a.ts` });
    render(<TimelinePanel />);
    await screen.findByText("timeline.empty");
    expect(gitFileHistory).toHaveBeenCalledWith(ROOT, "src/a.ts");
  });

  it("lists commits and selects one to diff against", async () => {
    gitFileHistory.mockResolvedValue([
      { hash: "abc123", author: "Ada", time: now, subject: "first change" },
      { hash: "def456", author: "Grace", time: now - 86400 * 40, subject: "older change" },
    ]);
    useProject.setState({ root: ROOT, active: `${ROOT}/src/a.ts` });
    render(<TimelinePanel />);

    await screen.findByText("first change");
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("today")).toBeInTheDocument();
    expect(screen.getByText("older change")).toBeInTheDocument();

    await userEvent.click(screen.getByText("first change"));
    await waitFor(() => {
      const s = useEditorActions.getState();
      expect(s.diffing).toBe(true);
      expect(s.diffBase).toBe("abc123");
    });
  });

  it("shows an error state (not the empty state) when history loading fails", async () => {
    gitFileHistory.mockRejectedValue(new Error("no git"));
    useProject.setState({ root: ROOT, active: `${ROOT}/src/a.ts` });
    render(<TimelinePanel />);
    await screen.findByText("timeline.error");
  });
});
