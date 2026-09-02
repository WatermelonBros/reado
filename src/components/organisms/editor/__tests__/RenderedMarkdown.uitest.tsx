// RenderedMarkdown: react-markdown (+ gfm, sanitized raw) rendering of the
// markdown preview.

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RenderedMarkdown } from "@/components/organisms/editor/RenderedMarkdown"

describe("RenderedMarkdown", () => {
  it("renders headings, inline code and links", () => {
    render(<RenderedMarkdown text={"# Title\n\nSome `code` and a [link](https://example.test)."} />)
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument()
    expect(screen.getByText("code").tagName).toBe("CODE")
    const link = screen.getByRole("link", { name: "link" })
    expect(link).toHaveAttribute("href", "https://example.test")
  })

  it("renders GFM tables (remark-gfm)", () => {
    render(<RenderedMarkdown text={"| a | b |\n| - | - |\n| 1 | 2 |"} />)
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument()
  })

  it("renders LaTeX math (remark-math + rehype-katex)", () => {
    const { container } = render(<RenderedMarkdown text={"Euler: $e^{i\\pi}+1=0$"} />)
    // KaTeX wraps rendered math in a `.katex` element.
    expect(container.querySelector(".katex")).toBeInTheDocument()
  })

  it("renders an empty document without crashing", () => {
    const { container } = render(<RenderedMarkdown text="" />)
    expect(container.querySelector(".prose-reado")).toBeInTheDocument()
  })
})
