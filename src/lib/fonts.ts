/**
 * The code faces Reado offers, and the ones it ships.
 *
 * The picker used to be a list of six names resolved against whatever the OS
 * had installed. On a clean machine only Menlo was there, so five of the six
 * fell through to `ui-monospace` — which is where the default landed too, and
 * the control looked like a choice while changing nothing.
 *
 * So the faces we may ship are imported here, immediately above the list that
 * offers them: the two cannot drift apart without it being visible in one
 * screen. Latin subset, regular + bold — what code is written in and what the
 * syntax theme uses; anything else falls back to the system mono as before.
 */
import "@fontsource/geist-mono/latin-400.css"
import "@fontsource/geist-mono/latin-700.css"
import "@fontsource/jetbrains-mono/latin-400.css"
import "@fontsource/jetbrains-mono/latin-700.css"
import "@fontsource/fira-code/latin-400.css"
import "@fontsource/fira-code/latin-700.css"
import "@fontsource/ibm-plex-mono/latin-400.css"
import "@fontsource/ibm-plex-mono/latin-700.css"

/** Faces bundled above — choosing one renders it on any machine. */
export const BUNDLED_FONTS = ["Geist Mono", "JetBrains Mono", "Fira Code", "IBM Plex Mono"] as const

/** Faces we can't ship (Apple-licensed, or Windows-only) but that are worth
 *  offering where they exist. Selecting one without it installed falls back, as
 *  fonts do — which is why they are labelled as conditional in the picker. */
export const SYSTEM_FONTS = ["SF Mono", "Menlo", "Cascadia Code"] as const

/** The CSS stack for a chosen face: the face, then the platform's own mono. */
export const fontStack = (name: string) => `"${name}", ui-monospace, monospace`

/** Whether `codeFont` is one of the offered stacks, or something hand-typed. */
export const isPresetFont = (value: string) =>
  [...BUNDLED_FONTS, ...SYSTEM_FONTS].some((f) => fontStack(f) === value)

/** The bare family name from a stored stack, for showing in a text field. */
export const fontName = (value: string) => value.replace(/^"([^"]+)".*$/, "$1")
