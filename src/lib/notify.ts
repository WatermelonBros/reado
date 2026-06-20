/**
 * Lightweight notifications for agent activity.
 *
 * Uses the webview's native Notification API (no extra Tauri plugin) for the OS
 * notification, plus an optional soft WebAudio chime. Called when the open-task
 * count drops — i.e. the agent (or the user) resolved something.
 */
import { useSettings } from "./store";

let permissionAsked = false;

async function ensurePermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (permissionAsked) return false;
  permissionAsked = true;
  return (await Notification.requestPermission()) === "granted";
}

/** A short, soft two-note chime (skipped unless enabled in settings). */
function chime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.2);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    /* audio not available */
  }
}

/** Notify that tasks were resolved; `remaining` is the open-task count left. */
export async function notifyResolved(remaining: number): Promise<void> {
  const body =
    remaining === 0
      ? "Review complete — all tasks resolved."
      : `A task was resolved — ${remaining} remaining.`;

  if (await ensurePermission()) {
    new Notification("Reado", { body });
  }
  if (useSettings.getState().completionSound) chime();
}
