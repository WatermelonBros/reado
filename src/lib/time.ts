/**
 * "3 minutes ago", "yesterday", in the user's locale — `Intl` already knows every
 * language we ship, so the phrasing is not ours to translate. Past a month the
 * date itself says more than "5 weeks ago".
 */
export function ago(ms: number, locale?: string, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const mins = (ms - now) / 60_000
  if (Math.abs(mins) < 60) return rtf.format(Math.round(mins), "minute")
  const hours = mins / 60
  if (Math.abs(hours) < 24) return rtf.format(Math.round(hours), "hour")
  const days = hours / 24
  if (Math.abs(days) < 30) return rtf.format(Math.round(days), "day")
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(ms))
}

/** The full moment, for a tooltip behind `ago`. */
export function when(ms: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(ms),
  )
}
