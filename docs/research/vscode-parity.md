# Reado ↔ VS Code — gap di parità

Audit del 2026-09-09 su Reado v1.16.0, rivisto il 2026-09-12 su v1.18.0. Verificato
leggendo il codice, non la documentazione: `buildCodeExtensions.ts`, `lsp.ts`,
`store.ts`, `menu.ts`, `search.rs`, `extensions/kinds.ts`, `workspace.ts`,
`keybindings.ts`, i pannelli, e l'elenco completo dei comandi Tauri registrati.

Le voci chiuse dalla 1.17.0 in poi sono state tolte dall'elenco: restano solo i gap
aperti. Cosa è stato chiuso sta nel [CHANGELOG](../../CHANGELOG.md).

**Scala di complessità** — costo di implementazione, non valore:

| | Significato |
|---|---|
| **1** | Poche ore. Un flag, una modalità, un campo in più. Nessuna decisione di design. |
| **2** | Un giorno o due. Un file nuovo o un pannello, dentro schemi che esistono già. |
| **3** | Una settimana. Tocca lo store, la persistenza e più pannelli; qualche decisione di design da prendere. |
| **4** | Settimane. Sottosistema nuovo con un modello dati proprio, o refactor di uno esistente. |
| **5** | Mesi. Un pilastro: protocollo nuovo, superficie di sicurezza nuova, API pubblica da mantenere per sempre. |

---

## Pilastri assenti

| Cosa | A che serve esattamente | Compl. |
|---|---|:---:|
| **Debugger (DAP)** | Fermare il programma su un breakpoint e guardarci dentro: stack, variabili, watch, step over/into/out, debug console per valutare espressioni nel frame corrente, `launch.json` per le configurazioni di avvio. Oggi in Reado si debugga con i `print` e il terminale. È il gap singolo più grande: non esiste nulla lato backend, nessun comando Tauri, nessun modello di sessione. | 5 |
| **Extension host JS** | Far girare estensioni che contengono *codice*, non solo dati. Le estensioni di Reado oggi sono dichiarative: `themes`, `iconThemes`, `snippets`, `languages`, `grammars` (`extensions/kinds.ts`). Manca `main`, gli activation event e l'API `vscode`, e con essi ogni contribution point che richiede logica: `commands`, `menus`, `keybindings`, `configuration`, `views`, `webviews`, `customEditors`, `debuggers`, `taskDefinitions`, `problemMatchers`. Sbloccherebbe da solo debugger, task e testing forniti da terze parti — ma è anche la superficie di sicurezza più grande da progettare (sandbox, permessi, API stabile per sempre). | 5 |
| **Remote development** | Aprire una cartella che sta su un'altra macchina — SSH, container, WSL — e lavorarci come fosse locale: language server, terminale e ricerca girano *là*, l'editor sta qui. Serve a chi sviluppa su un server o dentro un devcontainer riproducibile (`devcontainer.json`). Richiede di spezzare in due tutto il backend Rust: metà UI locale, metà agente remoto. | 5 |

---

## Non sono gap

- **Minimap** — sostituita deliberatamente dalla `StructureRibbon`.
- **Esecuzione cella per cella dei notebook** — richiede una sessione di kernel
  Jupyter (protocollo ZeroMQ + HMAC): è un sottosistema a sé, non parte del
  viewer. I notebook si leggono con gli output salvati nel file e si eseguono
  interi via `nbconvert`.
- **Read-first, commenti durevoli, vault, Anywhere, agent, guided review, knowledge graph, semantic search** — superset: non hanno equivalente in VS Code.
- **Già a parità**: multi-cursore, folding, sticky scroll, bracket pair colors, indent guides, Emmet, snippet utente, breadcrumb, outline, problems, ricerca con regex/case/whole-word e risultati editabili, tab preview + pin + riordino drag, multi-selezione nell'explorer, `.editorconfig`, rilevamento EOL/encoding/indentazione, settings UI + JSON + editor dei keybinding, zen mode e centered layout, temi/icon theme/grammatiche/linguaggi da OpenVSX, multi-root, notebook `.ipynb` come celle con output, live region per screen reader con annunci di riga/diff/esiti e audio cue, test explorer (scoperta dal sorgente, run per test/file/progetto, esito nel gutter, vitest/jest/cargo/pytest/go), git completo (merge, rebase anche interattivo, worktree, sottomoduli, commit firmati, grafo della history), gruppi di editor in griglia, buffer untitled, profili di settings, keybinding con `when`, task di progetto con problem matcher, pannello Output, local file history, file di workspace portabile, profili di terminale, column selection, wrap column, find in selection, e un LSP molto completo (hover, completion, diagnostics, definition/type/implementation, references, rename, signature help, inlay hints, code action, formatting, document symbol, call/type hierarchy, semantic tokens, code lens, prepareRename, linked editing, folding range, document link, `workspace/symbol`).
