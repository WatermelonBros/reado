/** Small string helpers more than one module needs. */

/** `s` as a literal inside a RegExp. */
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Small, fast non-crypto content hash (freshness only, not security). */
export function contentHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}
