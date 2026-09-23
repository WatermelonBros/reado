import { useEffect, useRef } from "react"

/**
 * Run `fn` each time `nonce` changes — never on mount. The store bumps a nonce to
 * ask the editor for a one-shot action (compose, explain, peek, quick fix); the
 * value it had when this view mounted is a request some other view already took.
 */
export function useNonceEffect(nonce: number, fn: () => void): void {
  const last = useRef(nonce)
  useEffect(() => {
    if (nonce === last.current) return
    last.current = nonce
    fn()
  }, [nonce])
}
