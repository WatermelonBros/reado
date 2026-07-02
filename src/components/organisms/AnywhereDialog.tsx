/**
 * Reado Anywhere — the desktop pairing surface.
 *
 * Enable the opt-in LAN server, then scan the QR with a phone on the same
 * network (or VPN) to review from it. No account, no cloud. The QR encodes the
 * HTTPS address plus the pairing token and certificate fingerprint (the phone
 * uses the fingerprint to verify it's reaching the right desktop).
 */
import { useEffect, useState } from "react";
import {
  anywhereEnable,
  anywhereDisable,
  anywhereStatus,
  type AnywhereInfo,
} from "../../lib/api";
import { usePalette } from "../../lib/store";
import { currentOS } from "../../lib/extensions";

import { Modal } from "../atoms/Modal";
import { QrCode } from "../atoms/QrCode";
import { useTranslation } from "react-i18next";

/** The QR payload: the address with the token + fingerprint in the fragment, so
 * the mobile client can pair without the values ever hitting a query string. */
const payload = (i: AnywhereInfo) =>
  `${i.url}/#token=${i.token}&fp=${encodeURIComponent(i.fingerprint)}`;

const PRIMED_KEY = "reado.anywhere.primed";

export function AnywhereDialog() {
  const open = usePalette((s) => s.anywhereOpen);
  const toggle = usePalette((s) => s.toggleAnywhere);
  const { t } = useTranslation();

  const [info, setInfo] = useState<AnywhereInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // macOS pops a system "allow local network access" prompt the moment the
  // server binds. We can't restyle that dialog, but we can explain it first with
  // our own step so it isn't a surprise — then let it fire.
  const [priming, setPriming] = useState(false);

  // Reflect the real server state whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setPriming(false);
    anywhereStatus().then(setInfo).catch(() => setInfo(null));
  }, [open]);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      setInfo(await anywhereEnable());
      setPriming(false);
      localStorage.setItem(PRIMED_KEY, "1"); // don't re-explain on later enables
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  // On macOS, explain the OS local-network prompt before triggering it — but only
  // the first time (afterwards the OS remembers the grant, so priming is noise).
  const requestEnable = () =>
    currentOS() === "mac" && !localStorage.getItem(PRIMED_KEY) ? setPriming(true) : enable();

  const disable = async () => {
    setBusy(true);
    try {
      await anywhereDisable();
      setInfo(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = () => {
    if (!info) return;
    void navigator.clipboard.writeText(info.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => toggle(o)}
      ariaLabel={t("anywhere.title")}
      className="flex w-[min(440px,92vw)] flex-col"
    >
      <header className="flex flex-none items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="m-0 flex items-center gap-2 text-sm font-medium">
          {t("anywhere.title")}
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: info ? "var(--syn-string)" : "var(--border-strong)" }}
            aria-hidden
          />
        </h2>
      </header>

      <div className="flex flex-col items-center px-6 py-6 text-center">
        {info ? (
          <>
            <div className="rounded-xl bg-[var(--qr-surface)] p-4 shadow-[var(--shadow)]">
              <QrCode value={payload(info)} size={216} />
            </div>
            <p className="mt-5 max-w-[34ch] text-sm leading-relaxed text-muted">
              {t("anywhere.scanHint")}
            </p>

            <button
              type="button"
              onClick={copyUrl}
              title={t("anywhere.copy")}
              className="mt-4 max-w-full truncate rounded-md border border-line bg-canvas px-3 py-1.5 font-mono text-xs text-ink transition-colors hover:border-line-strong"
            >
              {copied ? t("anywhere.copied") : info.url}
            </button>
            <p className="mt-3 font-mono text-[10px] leading-relaxed break-all text-faint">
              {t("anywhere.fingerprint")}: {info.fingerprint}
            </p>
          </>
        ) : (
          <>
            <p className="max-w-[36ch] text-lg leading-relaxed text-ink/85">
              {t("anywhere.tagline")}
            </p>
            <p className="mt-2 max-w-[36ch] text-xs leading-relaxed text-faint">
              {t("anywhere.privacyNote")}
            </p>
          </>
        )}
        {priming && !info && (
          <div className="mt-4 max-w-[36ch] rounded-md border border-line-strong bg-surface p-3">
            <p className="text-base font-medium text-ink">{t("anywhere.primeTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t("anywhere.primeBody")}</p>
          </div>
        )}
        {error && <p className="mt-4 text-xs text-marker">{error}</p>}
      </div>

      <footer className="flex flex-none items-center justify-end gap-2 border-t border-line px-5 py-3">
        <button
          type="button"
          onClick={() => (priming ? setPriming(false) : toggle(false))}
          className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-ink"
        >
          {priming ? t("common.cancel") : t("common.close")}
        </button>
        {info ? (
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:border-line-strong disabled:opacity-50"
          >
            {t("anywhere.stop")}
          </button>
        ) : priming ? (
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {busy ? t("anywhere.enabling") : t("anywhere.primeContinue")}
          </button>
        ) : (
          <button
            type="button"
            onClick={requestEnable}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {busy ? t("anywhere.enabling") : t("anywhere.enable")}
          </button>
        )}
      </footer>
    </Modal>
  );
}
