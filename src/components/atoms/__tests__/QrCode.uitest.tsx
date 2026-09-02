// The QrCode atom (Ark QrCode): renders a labelled SVG at the requested size
// encoding the given value. (i18n is globally mocked to echo the key.)

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { QrCode } from "@/components/atoms/QrCode"

describe("QrCode", () => {
  it("renders a labelled image at the requested size", () => {
    render(<QrCode value="https://example.test" size={180} />)
    const img = screen.getByRole("img", { name: "anywhere.qrLabel" })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute("width", "180")
    expect(img).toHaveAttribute("height", "180")
  })

  it("draws the QR pattern (a path filled with the ink token)", () => {
    const { container } = render(<QrCode value="hello" />)
    const path = container.querySelector("svg path")
    expect(path).toBeInTheDocument()
    expect(path).toHaveAttribute("fill", "var(--qr-ink)")
  })
})
