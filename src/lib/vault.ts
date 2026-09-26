/**
 * Credentials for the browser pane: what Reado runs *in* the page, and what it
 * keeps *out* of the agent's reach.
 *
 * The vault itself is spoken to in Rust (`vault.rs`, the user's own `op`/`bw`).
 * This module is the other half: the scripts that put a credential into a page we
 * do not control, and the redaction applied wherever pane state crosses over to
 * the agent. Both are pure string builders so they can be tested without a webview.
 */

import { bridgeScript } from "./bridgeScript"

export interface VaultItem {
  id: string
  title: string
  username: string
  hasOtp: boolean
}

/** What one fill needs, read from the vault in a single CLI invocation. */
export interface VaultSecret {
  username: string
  password: string
  hasOtp: boolean
}

export interface VaultStatus {
  /** `"op"` (1Password) or `"bw"` (Bitwarden); null when neither CLI is installed. */
  backend: "op" | "bw" | null
  locked: boolean
  /** Bitwarden's CLI was never signed in: `bw login` in a terminal first. */
  signedOut: boolean
}

/** What a fill script reports back: filled, or which field it could not find. */
export interface FillResult {
  ok: boolean
  missing?: "username" | "password" | "otp"
  /** How many fields were filled (a signup form usually has two password boxes). */
  filled?: number
}

/**
 * The preamble every fill script shares.
 *
 * `S` is the part that matters: assigning to `input.value` is invisible to React
 * and Vue, which track the value through the prototype's setter and overwrite the
 * field on the next render. Going through the native setter and then dispatching
 * `input` + `change` is what a real keystroke looks like from the page's side.
 */
const PRELUDE = `
var S=function(el,v){
  var d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
  if(d&&d.set){d.set.call(el,v);}else{el.value=v;}
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
};
var V=function(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
var A=function(s){return [].slice.call(document.querySelectorAll(s)).filter(V);};
`

/** Wrap a body as an IIFE returning its result object. */
const script = (body: string) => `(function(){${PRELUDE}${body}})()`

/**
 * Fill a login form: the first visible password field, and the username field
 * that belongs to it — the strongest labelled candidate *above* it
 * (`autocomplete=username|email`, `type=email`), else the nearest text input.
 * Reports which field was missing rather than silently doing nothing.
 */
export function fillLoginScript(username: string, password: string): string {
  return script(`
var pw=A('input[type=password]');
if(!pw.length) return {ok:false,missing:'password'};
var all=[].slice.call(document.querySelectorAll('input'));
var before=all.slice(0,all.indexOf(pw[0])).filter(function(e){
  var t=(e.type||'text').toLowerCase();
  return V(e)&&['text','email','tel',''].indexOf(t)>=0;
});
var strong=before.filter(function(e){
  var ac=(e.getAttribute('autocomplete')||'').toLowerCase();
  return (e.type||'').toLowerCase()==='email'||ac==='username'||ac==='email';
});
var user=strong.length?strong[strong.length-1]:(before.length?before[before.length-1]:null);
if(!user) return {ok:false,missing:'username'};
S(user,${JSON.stringify(username)});
S(pw[0],${JSON.stringify(password)});
return {ok:true,filled:2};
`)
}

/**
 * Fill a one-time code. Handles the single field (`autocomplete=one-time-code`,
 * then the usual name/id patterns) and the six-single-character-boxes pattern,
 * which needs a character and its events per box or the page ignores them.
 */
export function fillOtpScript(code: string): string {
  return script(`
var c=${JSON.stringify(code)};
var f=A('input[autocomplete="one-time-code"]');
if(!f.length) f=A('input[name*="otp" i],input[id*="otp" i],input[name*="code" i],input[id*="code" i],input[name*="token" i],input[name*="2fa" i]');
if(!f.length) return {ok:false,missing:'otp'};
if(f.length>=c.length){
  for(var i=0;i<c.length;i++) S(f[i],c[i]);
  return {ok:true,filled:c.length};
}
S(f[0],c);
return {ok:true,filled:1};
`)
}

/** Fill every visible password box with the generated value — a signup form asks
 *  for it twice, and both must match. */
export function fillNewPasswordScript(password: string): string {
  return script(`
var pw=A('input[type=password]');
if(!pw.length) return {ok:false,missing:'password'};
for(var i=0;i<pw.length;i++) S(pw[i],${JSON.stringify(password)});
return {ok:true,filled:pw.length};
`)
}

/**
 * Does the page show a login form right now — a password field with a size?
 *
 * This is what a browser extension watches for so it can offer itself; Reado
 * watches it for the same reason. A password manager that waits behind an icon
 * to be discovered is one nobody uses.
 */
export const HAS_LOGIN_JS = `(function(){return [].slice.call(document.querySelectorAll('input[type=password]')).some(function(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0;});})()`

/** What the user picked in the in-page chip, drained from the bridge. */
export interface VaultPick {
  kind: "login" | "otp" | "close"
  id?: string
}

/**
 * Draw the credential chip in the page.
 *
 * The pane is a native child window, so Reado's own DOM cannot be drawn over it —
 * a strip above the page is all the chrome can offer. The chip goes where a
 * browser extension puts its prompt: in the page, on top of it. It is handed
 * titles and usernames only; the password is fetched after the pick, as it always
 * was, and never crosses into the page except into the field it fills.
 */
export const vaultChipScript = (items: VaultItem[], label: string, otpLabel: string): string =>
  bridgeScript(
    "vault",
    items.map((i) => ({
      id: i.id,
      title: i.title,
      username: i.username,
      hasOtp: i.hasOtp,
      otpLabel,
    })),
    label,
  )

/** Say what happened, inside the chip. */
export const vaultNoteScript = (text: string): string => bridgeScript("vaultNote", text)

/** Take the chip down. */
export const VAULT_CHIP_CLOSE_JS = bridgeScript("vaultClose")

/**
 * The gate probe, run immediately before each agent command: does this page hold a
 * credential right now, and what page is it? The href comes back with it so a
 * grant given for one page cannot survive the page navigating away — including an
 * in-page navigation the URL bar never sees.
 */
export const PAGE_STATE_JS = `(function(){return {
  href: location.href,
  hasSecret: [].slice.call(document.querySelectorAll('input[type=password]')).some(function(e){return !!e.value;})
};})()`

export interface PageState {
  href: string
  hasSecret: boolean
}

/** The account name already typed in the page, used when saving a new login. */
export const USERNAME_JS = `(function(){var e=document.querySelector('input[type=email],input[autocomplete=username],input[type=text]');return e?e.value:'';})()`

/** A string result from the page, or "" for anything that isn't one — a page can
 *  return whatever it likes, and a signup must not fail on a surprise. */
export function pageString(raw: string): string {
  try {
    const v: unknown = JSON.parse(raw || '""')
    return typeof v === "string" ? v.trim() : ""
  } catch {
    return ""
  }
}

/** What the agent is told when a command is refused, instead of it running. */
export const GATED_REASON = "this page holds a credential and the user has not granted access to it"

/** Values too short to be worth matching — redacting them would eat unrelated text. */
const MIN_SECRET = 4

/**
 * Replace every registered secret with a marker. Applied to what crosses to the
 * agent (the `.reado/` mirror, agent command results, "send to agent") — never to
 * the user's own inspector, which shows their own page as a browser's developer
 * tools do.
 */
export function redact(text: string, secrets: string[]): string {
  return secrets
    .filter((s) => s.length >= MIN_SECRET)
    .reduce((acc, s) => acc.split(s).join("«redacted»"), text)
}
