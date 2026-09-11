# Reado ↔ VS Code — gap di parità

Audit del 2026-09-09 su Reado v1.16.0, rivisto il 2026-09-10. Verificato leggendo il codice, non la
documentazione: `buildCodeExtensions.ts`, `lsp.ts`, `store.ts`, `menu.ts`,
`search.rs`, `extensions/kinds.ts`, `workspace.ts`, `keybindings.ts`, i pannelli,
e l'elenco completo dei comandi Tauri registrati.

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
| **Notebook (.ipynb)** | Aprire un notebook Jupyter come celle eseguibili con output inline (grafici, tabelle, immagini) invece che come JSON grezzo. Serve per data science ed esplorazione. Modello documento completamente diverso da un file di testo: celle, kernel, output ricchi, salvataggio non lineare. | 4 |
| **Testing UI** | Il Test Explorer: albero dei test del progetto, run/debug di un singolo test dall'icona nel gutter, risultati con diff atteso/ottenuto, rerun dei soli falliti. Oggi si lanciano i test dal terminale e si legge l'output a mano. Senza extension host servirebbe un adapter built-in per framework (vitest, cargo test, pytest…). | 4 |
| **Task runner (`tasks.json`)** | Definire i comandi del progetto una volta (build, lint, test, watch) e lanciarli con ⇧⌘B o dalla palette, con un **problem matcher** che trasforma l'output del compilatore in voci cliccabili nel pannello Problems. È il ponte fra "ho lanciato il build" e "salta all'errore". I "task" che esistono oggi nel codice sono i task di review dei commenti — cosa diversa. | 3 |

## Workbench

| Cosa | A che serve esattamente | Compl. |
|---|---|:---:|
| **Griglia di editor group** | Più di due riquadri. Oggi c'è un pane primario più uno split (`store.ts:886`, `splitPath`): due file affiancati, punto. VS Code ha N gruppi in griglia, ognuno con la propria tab bar e la propria storia, si trascina un file per creare un gruppo nuovo, ⌘1/⌘2/⌘3 saltano fra loro. Serve quando confronti tre cose, o tieni test + implementazione + tipo aperti insieme. Tocca store, sessioni, tab, layout e ripristino sessione. | 4 |
| **Accessibilità / screen reader** | `accessibilitySupport`, la modalità che rende l'editor navigabile con VoiceOver/NVDA, il diff viewer accessibile (le differenze lette come testo invece che viste come colore), e gli audio cue per errori e breakpoint. Non c'è nulla di tutto questo. È anche l'unico gap della lista che decide *chi può usare* Reado. | 4 |
| **Buffer untitled** | Aprire l'app e cominciare a scrivere. Oggi `newFile()` (`docInfo.ts:726`) chiede subito un percorso e pretende un progetto già aperto: non esiste `Untitled-1`, non esiste lo scratch buffer dove incolli qualcosa per guardarlo. Sembra piccolo ma tutto il modello — tab, salvataggio, sessione, comment index — assume che un documento *abbia* un path. | 3 |
| **Profili di settings** | Set commutabili di impostazioni + estensioni + keybinding. "Profilo Rust", "profilo demo", "profilo minimale per screen sharing". Esiste `settingsSync` locale ma non i profili, e non c'è backup/sync fra macchine. Serve a chi lavora su progetti con esigenze diverse senza rifare la configurazione ogni volta. | 3 |
| **Output channel** | Un pannello con i canali di log del sistema: trace del language server, output di un task, log di un'estensione — selezionabili da un menu a tendina. Oggi i log di Reado vanno solo su file (`logger.ts`), quindi diagnosticare un LSP che non parte significa aprire un file esterno. | 2 |
| **Local file history** | Gli snapshot a ogni salvataggio, indipendenti da git: recuperare la versione di venti minuti fa di un file mai committato. Il `TimelinePanel` mostra solo la history git. La base c'è già lato backend (`write_backed` / `restore_backups` parcheggiano già copie per l'undo dei replace): manca il periodico e la UI. | 2 |
| **File di workspace portabile** | L'equivalente di `.code-workspace`: un file che descrive le cartelle del workspace e si apre con doppio clic, si committa, si passa a un collega. Il multi-root funziona già (`workspace.ts`) ma la lista vive in `.reado/workspace.json` della cartella primaria — non è né apribile né condivisibile. | 2 |

## Editor e LSP

| Cosa | A che serve esattamente | Compl. |
|---|---|:---:|
| **Semantic tokens** | Colorazione dal language server invece che dalla grammatica. La grammatica indovina dalla forma del testo; il server *sa* che quel nome è un parametro, che quella funzione è async, che quel simbolo è deprecato. È la differenza fra un file TypeScript che sembra colorato bene e uno che lo è. Richiede di mappare i token type LSP sui temi e gestire gli aggiornamenti incrementali. | 4 |
| **CodeLens** | Le righe cliccabili sopra un simbolo: "3 references", "2 implementations", "run test". Trasformano informazione che oggi va cercata (⇧F12) in informazione che si vede senza chiedere. `textDocument/codeLens` non è implementato. | 3 |
| **Keybinding con `when`** | Condizionare una scorciatoia al contesto (`editorTextFocus`, `terminalFocus`, `listHasSelection`). `keybindings.ts` è una mappa piatta combo → comando: senza `when` lo stesso tasto non può significare cose diverse nell'editor e nel terminale, e ogni scorciatoia nuova deve trovare una combinazione libera *globalmente*. È il motivo per cui in `buildCodeExtensions.ts` ci sono commenti che spiegano perché certi tasti sono lasciati liberi. | 3 |
| **`formatOnType` / `formatOnPaste`** | Riformattare mentre si scrive (chiudi una graffa e il blocco si allinea) e al momento dell'incolla (il codice incollato prende l'indentazione di dove atterra). C'è solo `formatOnSave` (`store.ts:131`). Il secondo è quello che si sente di più: incollare da Stack Overflow senza poi sistemare a mano. | 2 |
| **`prepareRename`** | Chiedere al server, *prima* di aprire il prompt, se il simbolo sotto il cursore è rinominabile e qual è l'esatto range da rinominare. Oggi il range lo indovina `wordAt()` — funziona quasi sempre, ma sbaglia dove un identificatore non coincide con una "parola" (`@decorator`, `$var`, `kebab-case` in CSS) e non avvisa in anticipo su un simbolo che non si può rinominare. *(Il rename cross-file in sé funziona: sistemato il 2026-09-10.)* | 1 |
| **Linked editing** | Rinominare un tag HTML di apertura e vedere quello di chiusura seguire. `linkedEditingRange` non è collegato. | 2 |
| **Folding range LSP** | Piegare per struttura semantica invece che per albero sintattico: la regione `#pragma`, il blocco di import, il commento multi-riga che il parser non considera un nodo pieghevole. Oggi il folding è solo syntax-tree. | 2 |
| **Document link** | I percorsi e gli URL dentro il codice diventano cliccabili quando è il server a segnalarli — l'import in un `package.json`, il path in un file di config. | 2 |
| **`workspace/symbol`** | "Vai al simbolo nel progetto" chiedendolo al language server invece che all'indice interno. Il server conosce i simboli generati, quelli dentro le dipendenze e quelli che una regex non trova. L'indice interno di Reado funziona, ma è un'approssimazione. | 2 |
| **Column selection mode** | La modalità colonna *persistente* (non solo Alt+trascina, che già funziona via `rectangularSelection`) e i cursori colonna da tastiera ⇧⌥⌘Freccia. Serve per editare tabelle di testo e blocchi allineati senza tenere premuto il mouse. | 2 |
| **`wordWrapColumn`** | Andare a capo alla colonna del ruler invece che al bordo della finestra. `wrap` oggi è solo on/off: con la finestra larga le righe lunghe restano lunghe, e il ruler a 120 diventa decorativo. | 1 |
| **Find in selection** | Il toggle "cerca solo dentro la selezione" nel pannello find. Serve per un replace circoscritto a una funzione senza toccare il resto del file. | 1 |

## Rifiniture

| Cosa | A che serve esattamente | Compl. |
|---|---|:---:|
| **Git avanzato** | Presenti: stage/unstage per hunk, commit, branch, stash, fetch/pull/push/sync, blame, conflitti, PR via forge. Mancano: `--amend` (correggere l'ultimo commit senza passare dal terminale), revert di un commit, cherry-pick, rebase interattivo, merge da UI, tag, gestione dei remote, commit firmati, worktree, sottomoduli, e un grafo della history. Sono comandi indipendenti: si possono aggiungere uno alla volta. | 3 |
| **Profili di terminale** | Shell nominate scelte da un menu — "zsh", "bash di debug", "Node REPL", "shell del container" — invece dell'unica shell globale (`store.ts:215`). Include il default per sistema operativo e "Run Selected Text in Terminal", che manda la selezione dell'editor al terminale attivo. | 2 |
| **Localizzazione** | Solo `en` e `it` oggi. Ogni lingua in più è meccanica: le chiavi ci sono già tutte (1212 in `en.json`). | 1 |

---

## Non sono gap

- **Minimap** — sostituita deliberatamente dalla `StructureRibbon`.
- **Read-first, commenti durevoli, vault, Anywhere, agent, guided review, knowledge graph, semantic search** — superset: non hanno equivalente in VS Code.
- **Già a parità**: multi-cursore, folding, sticky scroll, bracket pair colors, indent guides, Emmet, snippet utente, breadcrumb, outline, problems, ricerca con regex/case/whole-word e risultati editabili, tab preview + pin + riordino drag, multi-selezione nell'explorer, `.editorconfig`, rilevamento EOL/encoding/indentazione, settings UI + JSON + editor dei keybinding, zen mode e centered layout, temi/icon theme/grammatiche/linguaggi da OpenVSX, multi-root, e un LSP molto completo (hover, completion, diagnostics, definition/type/implementation, references, rename, signature help, inlay hints, code action, formatting, document symbol, call/type hierarchy).
