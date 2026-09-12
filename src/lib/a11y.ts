/**
 * The two channels that carry meaning to someone who is not looking at the
 * screen: a live region that speaks, and a tone that does not need words.
 *
 * Toasts already announce themselves (`role="alert"` / `role="status"`), so this
 * is for everything that is *not* a toast — where the caret landed, what the
 * line under it says, how many matches a search found, whether a run passed.
 * None of that is a notification: it is the state of the thing being used, and a
 * sighted reader gets it from the screen continuously.
 *
 * A cue is the other half. An error under the caret is a red squiggle, which is
 * a colour, which is nothing at all to a reader who cannot see it — a short tone
 * says the same thing in the same instant, and costs no reading time to anyone
 * who can. Cues are off by default: unasked-for sound is worse than none.
 */
import { create } from "zustand"
import { useSettings } from "./store"

interface AnnouncerState {
  /** What to say. The nonce makes a repeated message a new announcement — a
   *  live region ignores an identical text written twice. */
  message: string
  nonce: number
  /** Interrupt (`assertive`) rather than wait for a pause (`polite`). */
  assertive: boolean
}

export const useAnnouncer = create<AnnouncerState>(() => ({
  message: "",
  nonce: 0,
  assertive: false,
}))

/**
 * Say something to the screen reader.
 *
 * Silent unless the reader asked for it: announcing everything to everyone is
 * how a live region becomes noise that gets switched off. The one place this is
 * decided is here, so no call site has to remember.
 */
export function announce(text: string, opts: { assertive?: boolean } = {}): void {
  if (!useSettings.getState().screenReader) return
  if (!text) return
  useAnnouncer.setState((s) => ({
    message: text,
    nonce: s.nonce + 1,
    assertive: !!opts.assertive,
  }))
}

/** The tones, in Hz, and how long each lasts. Low and short for a problem, a
 *  fifth up for a warning, an octave for something that went right. */
const TONE: Record<CueKind, { hz: number; ms: number }> = {
  error: { hz: 220, ms: 140 },
  warning: { hz: 330, ms: 110 },
  success: { hz: 660, ms: 90 },
}

export type CueKind = "error" | "warning" | "success"

/** One AudioContext for the app: browsers cap how many a page may create, and a
 *  cue is not worth a leak. Created on the first cue, not at import — an unused
 *  context is a running audio thread for nothing. */
let ctx: AudioContext | null = null

/**
 * Play a short cue, if cues are on.
 *
 * Deliberately tiny: an oscillator, a gain ramp, and done. Anything sampled
 * would be an asset to ship, a file to load and a licence to check, for a sound
 * that lasts a tenth of a second.
 */
export function cue(kind: CueKind): void {
  if (!useSettings.getState().audioCues) return
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return
  try {
    ctx ??= new Ctor()
    // A context created before the first gesture starts suspended; a cue that
    // arrives then simply does not play, which is better than throwing.
    if (ctx.state === "suspended") void ctx.resume()
    const { hz, ms } = TONE[kind]
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = hz
    // Ramped, not switched: an abrupt start and stop is a click, and a click is
    // the part people find unpleasant.
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.06, now + 0.01)
    gain.gain.linearRampToValueAtTime(0, now + ms / 1000)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + ms / 1000 + 0.02)
  } catch {
    // No audio device, a blocked context, a webview without WebAudio: a cue is
    // an enhancement, and failing to play one is not an error anyone can act on.
  }
}

/** Reset between tests. */
export function __resetAudio(): void {
  void ctx?.close()
  ctx = null
}
