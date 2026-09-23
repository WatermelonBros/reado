/** The scripts that call into the page's capture bridge (`window.__readoBridge`). */

/** What each bridge method takes, in order. */
export interface BridgeMethods {
  showComment: [box: unknown]
  closeComment: []
  marks: [list: unknown[], show: boolean]
  setPick: [on: boolean]
  clear: []
  hi: [idxs: number[]]
  unhi: []
  vault: [items: unknown[], label: string]
  vaultNote: [text: string]
  vaultClose: []
}

/** The script that calls `method` on the page's bridge — a no-op on a page
 *  that has not loaded it yet. Arguments are passed as JSON. */
export const bridgeScript = <M extends keyof BridgeMethods>(
  method: M,
  ...args: BridgeMethods[M]
): string =>
  `window.__readoBridge&&window.__readoBridge.${method}(${args.map((a) => JSON.stringify(a)).join(",")})`

/** Empty the page's drain buffer: everything it has queued since the last call. */
export const DRAIN_JS = "window.__readoBridge ? window.__readoBridge.drain() : null"
