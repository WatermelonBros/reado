/**
 * Renders what a build registered for a named slot — nothing, in the community
 * build. Each contribution sits in its own boundary: a contribution that throws
 * disappears and is logged, and the title bar or settings around it keep working.
 */
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from "react"
import { log } from "@/lib/logger"
import { type SlotName, type SlotProps, slotContents } from "@/lib/slots"

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

function Contained<P extends object>({
  name,
  Content,
  props,
}: {
  name: string
  Content: ComponentType<P>
  props: P
}) {
  return (
    <SlotBoundary name={name}>
      <Content {...props} />
    </SlotBoundary>
  )
}

/** A slot that passes no context takes no `props`; one that does requires them. */
type SlotArgs<N extends SlotName> =
  SlotProps[N] extends Record<string, never>
    ? { name: N; props?: undefined }
    : { name: N; props: SlotProps[N] }

export function Slot<N extends SlotName>({ name, props }: SlotArgs<N>) {
  const context = (props ?? {}) as SlotProps[N]
  return (
    <>
      {slotContents(name).map(({ id, Content }) => (
        <Contained key={id} name={name} Content={Content} props={context} />
      ))}
    </>
  )
}
