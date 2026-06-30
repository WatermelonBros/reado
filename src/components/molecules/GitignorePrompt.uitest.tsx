// The first-comment gitignore prompt: a modal offering to add `.reado/` to the
// project .gitignore, with a persisted "don't ask again" choice. Stores are
// real; the Tauri edge is stubbed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const { addReadoGitignore } = vi.hoisted(() => ({
  addReadoGitignore: vi.fn(async () => {}),
}));
vi.mock("../../lib/api", () => ({ addReadoGitignore }));

import { GitignorePrompt } from "./GitignorePrompt";
import { useComments } from "../../lib/comments";
import { useProject, useSettings } from "../../lib/store";

beforeEach(() => {
  addReadoGitignore.mockClear();
  useProject.setState({ root: "/repo" });
  useSettings.setState({ versionReado: false, gitignoreDontAsk: false });
  useComments.setState({ gitignorePromptOpen: true });
});

describe("GitignorePrompt", () => {
  it("renders nothing while closed", () => {
    useComments.setState({ gitignorePromptOpen: false });
    render(<GitignorePrompt />);
    expect(screen.queryByText("gitignore.title")).not.toBeInTheDocument();
  });

  it("shows the prompt body and both choices when open", () => {
    render(<GitignorePrompt />);
    expect(screen.getByText("gitignore.title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "gitignore.keep" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "gitignore.add" })).toBeInTheDocument();
  });

  it("Keep closes without touching the gitignore", async () => {
    render(<GitignorePrompt />);
    await userEvent.click(screen.getByRole("button", { name: "gitignore.keep" }));
    expect(addReadoGitignore).not.toHaveBeenCalled();
    expect(useComments.getState().gitignorePromptOpen).toBe(false);
  });

  it("Add writes the gitignore entry and closes", async () => {
    render(<GitignorePrompt />);
    await userEvent.click(screen.getByRole("button", { name: "gitignore.add" }));
    expect(addReadoGitignore).toHaveBeenCalledWith("/repo", false);
    expect(useComments.getState().gitignorePromptOpen).toBe(false);
  });

  it("ticking 'don't ask again' before Keep persists the opt-out", async () => {
    render(<GitignorePrompt />);
    await userEvent.click(screen.getByText("gitignore.dontAsk"));
    await userEvent.click(screen.getByRole("button", { name: "gitignore.keep" }));
    expect(useSettings.getState().gitignoreDontAsk).toBe(true);
  });
});
