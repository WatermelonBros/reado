// UI test: the in-app PDF viewer. pdf.js is mocked (it wants a worker and a real
// canvas), so what's asserted is the decode → render → zoom loop and the error
// state — plus the promise that React re-renders never wipe the pages.
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => {
  const render = vi.fn(() => ({ promise: Promise.resolve() }))
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({
    width: 600 * scale,
    height: 800 * scale,
  }))
  return {
    render,
    getViewport,
    destroy: vi.fn(async () => {}),
    numPages: 2,
    getDocument: vi.fn(),
    lastData: null as Uint8Array | null,
  }
})

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: ({ data }: { data: Uint8Array }) => {
    h.lastData = data
    return {
      promise: Promise.resolve({
        numPages: h.numPages,
        destroy: h.destroy,
        getPage: async () => ({ getViewport: h.getViewport, render: h.render }),
      }),
    }
  },
}))
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }))

import { PdfView } from "@/components/organisms/PdfView"

/** "hello" as a base64 data URL, the shape the backend hands over. */
const DATA_URL = `data:application/pdf;base64,${btoa("hello")}`

beforeEach(() => {
  vi.clearAllMocks()
  // happy-dom has no 2D context, and a page with no context is skipped.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never)
  h.numPages = 2
  h.render.mockReturnValue({ promise: Promise.resolve() })
  h.getViewport.mockImplementation(({ scale }: { scale: number }) => ({
    width: 600 * scale,
    height: 800 * scale,
  }))
})

describe("rendering", () => {
  it("decodes the data URL to bytes for pdf.js", async () => {
    render(<PdfView dataUrl={DATA_URL} name="doc.pdf" />)
    await waitFor(() => expect(h.lastData).not.toBeNull())
    expect(new TextDecoder().decode(h.lastData as Uint8Array)).toBe("hello")
  })

  it("renders one canvas per page", async () => {
    const { container } = render(<PdfView dataUrl={DATA_URL} name="doc.pdf" />)
    await waitFor(() => expect(container.querySelectorAll("canvas")).toHaveLength(2))
    expect(h.render).toHaveBeenCalledTimes(2)
  })

  it("surfaces a broken file instead of an empty pane", async () => {
    h.getViewport.mockImplementation(() => {
      throw new Error("Invalid PDF structure")
    })
    render(<PdfView dataUrl={DATA_URL} name="doc.pdf" />)
    expect(await screen.findByText(/Invalid PDF structure/)).toBeInTheDocument()
  })
})

describe("zooming", () => {
  it("starts at fit-width (100%)", () => {
    render(<PdfView dataUrl={DATA_URL} name="doc.pdf" />)
    expect(screen.getByText("100%")).toBeInTheDocument()
  })

  it("zooms in and out in steps, and resets", async () => {
    render(<PdfView dataUrl={DATA_URL} name="doc.pdf" />)
    await userEvent.click(screen.getByTitle("pdf.zoomIn"))
    expect(await screen.findByText("125%")).toBeInTheDocument()
    await userEvent.click(screen.getByTitle("pdf.zoomOut"))
    expect(await screen.findByText("100%")).toBeInTheDocument()
    await userEvent.click(screen.getByTitle("pdf.zoomIn"))
    await userEvent.click(screen.getByTitle("pdf.zoomReset"))
    expect(await screen.findByText("100%")).toBeInTheDocument()
  })

  it("clamps at both ends", async () => {
    render(<PdfView dataUrl={DATA_URL} name="doc.pdf" />)
    for (let i = 0; i < 12; i++) await userEvent.click(screen.getByTitle("pdf.zoomIn"))
    expect(screen.getByText("500%")).toBeInTheDocument()
    for (let i = 0; i < 20; i++) await userEvent.click(screen.getByTitle("pdf.zoomOut"))
    expect(screen.getByText("50%")).toBeInTheDocument()
  })

  it("re-renders the pages at the new scale", async () => {
    const { container } = render(<PdfView dataUrl={DATA_URL} name="doc.pdf" />)
    await waitFor(() => expect(container.querySelectorAll("canvas")).toHaveLength(2))
    const at100 = vi.mocked(h.getViewport).mock.lastCall?.[0].scale
    h.render.mockClear()

    await userEvent.click(screen.getByTitle("pdf.zoomIn"))
    await waitFor(() => expect(h.render).toHaveBeenCalled())
    // 125% of whatever the fit-to-width scale was — not a re-render at the same
    // size, which is what "zoom did nothing" would look like.
    const at125 = vi.mocked(h.getViewport).mock.lastCall?.[0].scale
    expect(at125).toBeCloseTo((at100 as number) * 1.25)
    // Still two canvases, not four — the pages are replaced, not appended.
    await waitFor(() => expect(container.querySelectorAll("canvas")).toHaveLength(2))
  })
})

describe("teardown", () => {
  it("destroys the document when the viewer goes away", async () => {
    const { unmount } = render(<PdfView dataUrl={DATA_URL} name="doc.pdf" />)
    await waitFor(() => expect(h.render).toHaveBeenCalled())
    unmount()
    await waitFor(() => expect(h.destroy).toHaveBeenCalled())
  })
})
