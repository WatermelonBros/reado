import { describe, expect, it, vi } from "vitest"

// `convertFileSrc` is Tauri's; stub it so the rewritten URL is inspectable.
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
}))

const { markdownRehype, markdownRehypeFor, markdownUrlTransform } = await import("../markdown")

/** Run only the local-image plugin (the last one) over a hast tree. */
function rewrite(baseDir: string, src: string) {
  const plugins = markdownRehypeFor(baseDir) as unknown[]
  const factory = plugins[plugins.length - 1] as () => (tree: unknown) => void
  const img = { type: "element", tagName: "img", properties: { src }, children: [] }
  factory()({ type: "root", children: [img] })
  return img.properties.src
}

const BASE = "/Users/me/proj/docs"
const decode = (url: string) => decodeURIComponent(url.replace("asset://localhost/", ""))

describe("markdown local images", () => {
  it("resolves a relative src against the document's directory", () => {
    expect(decode(rewrite(BASE, "media/demo.gif"))).toBe("/Users/me/proj/docs/media/demo.gif")
  })

  it("walks up out of the document's directory", () => {
    expect(decode(rewrite(BASE, "../assets/logo.png"))).toBe("/Users/me/proj/assets/logo.png")
    expect(decode(rewrite(BASE, "./a.png"))).toBe("/Users/me/proj/docs/a.png")
  })

  it("drops a query or fragment before hitting the filesystem", () => {
    expect(decode(rewrite(BASE, "a.png?v=2"))).toBe("/Users/me/proj/docs/a.png")
  })

  // Badges and inline data are already loadable — rewriting them would break them.
  it("leaves absolute and non-file sources alone", () => {
    for (const src of [
      "https://img.shields.io/badge/x-y.svg",
      "http://example.com/a.png",
      "//cdn.example.com/a.png",
      "data:image/png;base64,AAAA",
    ]) {
      expect(rewrite(BASE, src)).toBe(src)
    }
  })

  it("without a base directory, leaves every src untouched", () => {
    const plugins = markdownRehypeFor(undefined) as unknown[]
    // The plain pipeline is raw + sanitize + katex — no image rewriting.
    expect(plugins).toHaveLength(3)
  })
})

// Regression: react-markdown re-sanitises URLs after the rehype pipeline, and
// its default blanks `asset:` — which rendered every local image as alt text.
describe("markdown url transform", () => {
  const t = (url: string) => markdownUrlTransform(url, "src", {} as never)

  it("keeps the asset: URLs the image rewrite produces", () => {
    expect(t("asset://localhost/Users/me/proj/a.png")).toBe("asset://localhost/Users/me/proj/a.png")
  })

  it("still allows ordinary web URLs and relative paths", () => {
    expect(t("https://img.shields.io/badge/x.svg")).toBe("https://img.shields.io/badge/x.svg")
    expect(t("http://asset.localhost/a.png")).toBe("http://asset.localhost/a.png")
    expect(t("./local.png")).toBe("./local.png")
  })

  it("still blanks a dangerous protocol", () => {
    expect(t("javascript:alert(1)")).toBe("")
  })
})

describe("the sanitize schema", () => {
  /** Run the real sanitize plugin — with the real schema, taken straight off
   *  `markdownRehype` — over a hand-built hast tree. */
  const sanitize = (node: Record<string, unknown>) => {
    const entry = (markdownRehype as unknown[]).find((p) => Array.isArray(p)) as [
      (schema: unknown) => (tree: unknown) => unknown,
      unknown,
    ]
    const out = entry[0](entry[1])({ type: "root", children: [node] }) as {
      children: Array<{ tagName?: string; properties?: Record<string, unknown> }>
    }
    return out.children[0] ?? {}
  }

  const el = (tagName: string, properties: Record<string, unknown>, children: unknown[] = []) => ({
    type: "element",
    tagName,
    properties,
    children,
  })

  // The schema's one real widening is `className`: `align`, `width` and
  // `height` are already in hast-util-sanitize's default `*` list, so asserting
  // those would pin the library rather than this file.
  it("keeps className, which the math placeholders ride on", () => {
    expect(sanitize(el("span", { className: ["math"] })).properties).toMatchObject({
      className: ["math"],
    })
  })

  it("still strips what the default schema strips", () => {
    expect(
      sanitize(el("img", { src: "x.png", onError: "alert(1)" })).properties,
    ).not.toHaveProperty("onError")
    expect(sanitize(el("script", {})).tagName).not.toBe("script")
  })

  it("runs KaTeX after sanitize, so its own output isn't re-sanitized", () => {
    const plugins = markdownRehype as unknown[]
    const sanitizeAt = plugins.findIndex((p) => Array.isArray(p))
    const katexAt = plugins.findIndex((p) => (p as { name?: string }).name === "rehypeKatex")
    // The file's comment insists on this order; swapping the two strips
    // KaTeX's markup instead of rendering it.
    expect(sanitizeAt).toBeGreaterThanOrEqual(0)
    expect(katexAt).toBeGreaterThan(sanitizeAt)
  })
})
