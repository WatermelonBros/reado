// Anchored Q&A answer modal: the loading / error / ready (Markdown) states and
// the basename shown in the header. i18n is mocked to keys.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { QaModal } from "../QaModal";
import { useQa } from "../../../lib/qa";

beforeEach(() => {
  useQa.setState({ open: false, relPath: null, status: "loading", text: "" });
});

describe("QaModal", () => {
  it("renders nothing while closed", () => {
    render(<QaModal />);
    expect(screen.queryByText("qa.title")).not.toBeInTheDocument();
  });

  it("shows the file basename in the header while loading", () => {
    useQa.setState({ open: true, relPath: "src/deep/file.ts", status: "loading" });
    render(<QaModal />);
    expect(screen.getByText(/file\.ts/)).toBeInTheDocument();
    expect(screen.getByText("qa.generating")).toBeInTheDocument();
  });

  it("shows the error message on failure", () => {
    useQa.setState({ open: true, relPath: "a.ts", status: "error" });
    render(<QaModal />);
    expect(screen.getByText("synopsis.error")).toBeInTheDocument();
  });

  it("renders the answer Markdown when ready", () => {
    useQa.setState({ open: true, relPath: "a.ts", status: "ready", text: "# Answer\n\nbody text" });
    render(<QaModal />);
    expect(screen.getByRole("heading", { name: "Answer" })).toBeInTheDocument();
    expect(screen.getByText("body text")).toBeInTheDocument();
  });
});
