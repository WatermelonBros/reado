import { type RefObject, useEffect } from "react"
import { previewDetectUrls } from "@/lib/api"
import { usePreview } from "@/lib/preview"

/** How often to look for a dev server, while looking is still finding something. */
const PROBE_MS = 2000
/** …and the ceiling it backs off to while it is not. Each probe opens a socket
 *  per candidate port, so the idle case has to be cheap. */
const PROBE_MAX_MS = 30_000

/** Point the pane at a running dev server, and keep watching for one to start. */
export function useDevServerProbe(
  root: string,
  {
    openAt,
    pageAlive,
    wasLive,
    manualUrl,
    urlFocused,
  }: {
    openAt: (url: string) => void
    /** The page answered the last drain: it is loaded and running. */
    pageAlive: RefObject<boolean>
    /** The current URL responded at the last check. */
    wasLive: RefObject<boolean>
    /** The user took control of the URL bar. */
    manualUrl: RefObject<boolean>
    /** The URL input is being edited. */
    urlFocused: RefObject<boolean>
  },
): void {
  // Sniff the common dev-server ports and switch to the running one if the current
  // URL is dead. Re-checked every 2s so a dev server started *after* opening the
  // pane gets picked up automatically. A live current URL (incl. a manual one) is
  // probed too, so it's never overridden.
  useEffect(() => {
    let alive = true
    const origin = (u: string) => {
      try {
        return new URL(u).origin
      } catch {
        return ""
      }
    }
    // True when there is nothing left to look for — the page is talking, or a
    // server answered. False means the probe found nothing and is worth slowing
    // down: it opens a socket per candidate port, and a pane left pointed at a
    // server that is not running would otherwise knock on every one of them
    // every two seconds, for as long as the pane is open.
    const check = async (): Promise<boolean> => {
      if (!alive) return true
      // The page is up and talking: leave it alone. This check exists for a pane
      // pointed at a server that isn't running yet — not to drag a working page
      // back to the address Reado last wrote down. It used to do exactly that:
      // follow a link, and two seconds later the pane snapped back to where it
      // started (or to some other detected server), which is why the address
      // never changed and Back had nothing to go back to.
      if (pageAlive.current) {
        wasLive.current = true
        return true
      }
      const curUrl = usePreview.getState().url
      let live: string[] = []
      try {
        live = await previewDetectUrls(root, curUrl)
      } catch {
        return false
      }
      const curLive = live.some((u) => origin(u) === origin(curUrl))
      if (curLive) {
        // The current URL responds: if it just came alive (server started after we
        // opened), reload it so a page loaded while dead now shows.
        if (!wasLive.current) openAt(curUrl)
        wasLive.current = true
      } else {
        wasLive.current = false
        // Auto-pick a detected server only while the user hasn't taken the wheel
        // and isn't mid-edit in the URL bar (a remount would drop their typing).
        if (!manualUrl.current && !urlFocused.current && live.length) {
          usePreview.getState().setUrl(live[0])
          openAt(live[0])
        }
      }
      return curLive || live.length > 0
    }
    // Two seconds while something is there to find, doubling to half a minute
    // while nothing is: a dev server that starts later is still picked up, and a
    // pane sitting on a dead address stops hammering the machine.
    let delay = PROBE_MS
    let timer = 0
    const tick = async () => {
      delay = (await check()) ? PROBE_MS : Math.min(delay * 2, PROBE_MAX_MS)
      if (alive) timer = window.setTimeout(tick, delay)
    }
    timer = window.setTimeout(tick, 0)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [root, openAt])
}
