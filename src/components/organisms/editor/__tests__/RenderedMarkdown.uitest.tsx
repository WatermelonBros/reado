// RenderedMarkdown: react-markdown (+ gfm, sanitized raw) rendering of the
// markdown preview.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RenderedMarkdown } from "../RenderedMarkdown";

describe("RenderedMarkdown", () => {
  it("renders headings, inline code and links", () => {
    render(
      <RenderedMarkdown text={"# Title\n\nSome `code` and a [link](https://example.test)."} />,
    );
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("code").tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "link" });
    expect(link).toHaveAttribute("href", "https://example.test");
  });

  it("renders GFM tables (remark-gfm)", () => {
    render(<RenderedMarkdown text={"| a | b |\n| - | - |\n| 1 | 2 |"} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
  });

  it("renders an empty document without crashing", () => {
    const { container } = render(<RenderedMarkdown text="" />);
    expect(container.querySelector(".prose-reado")).toBeInTheDocument();
  });
});
