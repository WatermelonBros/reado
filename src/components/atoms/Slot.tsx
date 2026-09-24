/**
 * Renders what a build registered for a named slot — nothing, in the community
 * build. Each contribution sits in its own boundary: a contribution that throws
 * disappears and is logged, and the title bar or settings around it keep working.
 */
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react"
import { log } from "@/lib/logger"
import { type SlotName, slotContents } from "@/lib/slots"

class SlotBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error("slot contribution failed", {
      slot: this.props.name,
      message: error.message,
      stack: info.componentStack ?? undefined,
    })
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function Contained({ name, Content }: { name: string; Content: ComponentType }) {
  return (
    <SlotBoundary name={name}>
      <Content />
    </SlotBoundary>
  )
}

export function Slot({ name }: { name: SlotName }) {
  return (
    <>
      {slotContents(name).map(({ id, Content }) => (
        <Contained key={id} name={name} Content={Content} />
      ))}
    </>
  )
}
