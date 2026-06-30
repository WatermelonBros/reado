# UI driver — automazione della webview Tauri (dev only)

Pilota l'app **reale** (WKWebView) per testarla. Su macOS non ci si può
attaccare a una WKWebView dall'esterno (per questo `tauri-driver` non supporta
mac), quindi il driver gira *dentro* la webview e parla con un relay incastrato
nel dev server Vite — stessa origin, così la CSP `connect-src 'self'` lo permette.

```
agente (drive.mjs)  ──POST /__uidriver/cmd──▶  Vite plugin (relay)  ──GET /poll──▶  bridge in-webview
agente              ◀──result───────────────  Vite plugin (relay)  ◀──POST /result── bridge in-webview
```

## Pezzi
- `vite-plugin.mjs` — relay long-poll dentro il dev server (montato su `/__uidriver`). Caricato da `vite.config.ts`.
- `../../src/lib/automation.ts` — bridge dev-only iniettato in `main.tsx` sotto `import.meta.env.DEV`. Esegue i comandi nel DOM reale.
- `drive.mjs` — CLI: `node scripts/uidriver/drive.mjs <action> '<jsonArgs>'`.

## Prerequisito
App in dev: `pnpm tauri:dev` (vite su :1420, override con `UIDRIVER_PORT`).

## Azioni
| azione | args | ritorna |
|--------|------|---------|
| `snapshot` | — | albero a11y degli elementi visibili con ref (`e1`, `e2`, …) |
| `click` | `{ref}` o `{selector}` | — |
| `type` | `{ref|selector, text, clear?, submit?}` | scrive in input/textarea/contenteditable (setter nativo + eventi React) |
| `press` | `{key, mods?, ref?/selector?}` | tasto su elemento o activeElement (`Enter`, `Escape`, `ArrowDown`…) |
| `text` | `{ref|selector}` | textContent |
| `exists` | `{selector}` | bool |
| `count` | `{selector}` | numero |
| `getByText` | `{text, tag?}` | ref del primo elemento visibile che contiene il testo |
| `nav` | `{hash}` | imposta `location.hash` (es. `project=<encoded>`) |
| `waitFor` | `{selector, timeoutMs?}` | attende l'elemento |
| `errors` | `{clear?}` | ring buffer di errori non gestiti / rejection / console.error+warn |
| `eval` | `{js}` | esegue un body JS (con `return`) nella webview; risultato JSON |

## Esempi
```bash
node scripts/uidriver/drive.mjs snapshot
node scripts/uidriver/drive.mjs click '{"ref":"e8"}'
node scripts/uidriver/drive.mjs type '{"selector":"textarea","text":"fix bug","submit":true}'
node scripts/uidriver/drive.mjs eval '{"js":"location.hash=\"project=\"+encodeURIComponent(\"/path\"); return location.hash"}'
node scripts/uidriver/drive.mjs errors '{"clear":true}'
```

`errors` dopo ogni interazione è il rilevatore di crash principale.
Testare i comandi distruttivi (git discard/commit, write/move file) **solo** su un
progetto usa-e-getta, mai sul repo vero.
