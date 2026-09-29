// RenderedMarkdown: react-markdown (+ gfm, sanitized raw) rendering of the
// markdown preview.

import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
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

// Regression: opening a README straight from the launcher showed no images until
// the file was closed and reopened. The preview asked the backend to allow the
// project's assets in an effect — *after* its <img>s had already been requested
// and refused — and nothing retried them. The images must wait for the grant.
describe("RenderedMarkdown local images", () => {
  it("renders a README's own images only once the project's assets are allowed", async () => {
    let grant: () => void = () => {}
    vi.resetModules()
    vi.doMock("@tauri-apps/api/core", () => ({
      convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
    }))
    vi.doMock("@/lib/api", () => ({
      allowProjectAssets: () =>
        new Promise<void>((resolve) => {
          grant = resolve
        }),
    }))
    const { RenderedMarkdown: Fresh } = await import(
      "@/components/organisms/editor/RenderedMarkdown"
    )
    const { container } = render(
      <Fresh text={"![demo](docs/demo.gif)"} root="/proj" baseDir="/proj" />,
    )
    expect(container.querySelector("img")).toBeNull()
    await act(async () => grant())
    expect(container.querySelector("img")?.getAttribute("src")).toContain("asset://")
    vi.doUnmock("@/lib/api")
    vi.doUnmock("@tauri-apps/api/core")
  })
})
