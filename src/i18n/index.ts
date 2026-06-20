/**
 * Minimal internationalization.
 *
 * Reado ships Italian and English. The dictionary is a flat key→string map per
 * locale; `t(key)` resolves against the active locale and falls back to English.
 * This is intentionally dependency-free — the string set is small and a full
 * i18n framework would be more machinery than the MVP needs.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Locale = "en" | "it";

/** English is the source of truth; every other locale mirrors these keys. */
const en = {
  "app.tagline": "A calm place to read code.",
  "recents.title": "Recent projects",
  "recents.empty": "No projects yet. Open a folder to start reading.",
  "recents.open": "Open folder…",
  "recents.openHint": "Open any local folder — a git repository or not.",
  "recents.remove": "Remove from list",

  "tree.showHidden": "Show hidden & ignored files",
  "tree.empty": "This folder is empty.",
  "tree.search": "Filter files…",

  "editor.empty": "Select a file from the tree to start reading.",
  "editor.binary": "Binary file — preview not available ({size}).",
  "editor.wrap": "Wrap lines",
  "editor.focus": "Focus mode",
  "editor.measure": "Reading width",
  "editor.edit": "Toggle editing",
  "editor.save": "Save",
  "diff.toggle": "Toggle diff",
  "diff.base": "Diff base",
  "diff.head": "HEAD (uncommitted)",
  "diff.noBase": "Not present in the selected base.",
  "diff.noChanges": "No changes versus the selected base.",

  "status.noFile": "No file open",
  "status.branch": "branch",
  "status.comments": "{count} open",
  "status.agentIdle": "Agent idle",
  "status.notGit": "Not a git repository",

  "palette.placeholder": "Type a command…",
  "finder.placeholder": "Go to file…",
  "search.placeholder": "Search in project…",
  "search.noResults": "No matches.",
  "search.results": "{count} matches",
  "search.ripgrepMissing": "ripgrep (rg) is not installed or not on PATH.",

  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.themeMode": "Theme mode",
  "settings.mode.manual": "Manual",
  "settings.mode.system": "Follow system",
  "settings.mode.auto": "Trust Reado (time of day)",
  "settings.language": "Language",
  "settings.codeFont": "Code font",
  "settings.completionSound": "Play a sound when the agent finishes",
  "settings.notifications": "Notifications",
  "settings.checkUpdates": "Check for updates…",
  "settings.close": "Close",

  "empty.firstComment":
    "Select one or more lines, then press the comment shortcut to leave your first note.",

  "comment.type.bug": "Bug",
  "comment.type.refactor": "Refactor",
  "comment.type.performance": "Performance",
  "comment.type.question": "Question",
  "comment.type.note": "Note",
  "comment.state.open": "Open",
  "comment.state.in-progress": "In progress",
  "comment.state.done": "Done",
  "comment.state.discarded": "Discarded",
  "comment.task": "Task",
  "comment.note": "Note",
  "comment.taskHint": "Tasks are sent to the AI; notes are not.",
  "comment.bodyPlaceholder": "Leave a comment… Markdown supported.",
  "comment.replyPlaceholder": "Reply…",
  "comment.new": "New comment on selection",
  "comment.save": "Comment",
  "comment.reply": "Reply",
  "comment.edit": "Edit",
  "comment.delete": "Delete",
  "comment.deleteConfirm": "Delete this comment? This cannot be undone.",
  "comment.you": "You",
  "comment.lines": "Lines {from}–{to}",
  "comment.line": "Line {line}",
  "comment.scope.range": "Lines",
  "comment.scope.file": "File",
  "comment.scope.project": "Project",
  "comment.orphan": "Orphaned — the anchored code could not be found.",

  "terminal.new": "New terminal",
  "terminal.close": "Close terminal",
  "terminal.hide": "Hide terminal",
  "terminal.toggle": "Toggle terminal",
  "terminal.launchClaude": "Claude",
  "terminal.launchCodex": "Codex",
  "terminal.sendReview": "Send review",
  "terminal.reviewSent": "{count} task(s) sent to the agent.",
  "terminal.noTasks": "No open tasks to send.",
  "review.title": "Send review",
  "review.target": "Send to",
  "review.send": "Send {count}",
  "review.selectAll": "Select all",

  "files.panel": "Files",
  "git.panel": "Source control",
  "git.clean": "No changes — the working tree is clean.",
  "comments.panel": "Comments",
  "graph.title": "Knowledge graph",
  "docs.title": "Documentation",
  "graph.legend.file": "File",
  "graph.legend.comment": "Comment",
  "graph.legend.link": "Linked",
  "orphans.panel": "Orphans",
  "orphans.empty": "No orphaned comments.",
  "orphans.lastKnown": "Last known: {loc}",
  "orphans.reanchor": "Re-anchor",
  "orphans.reanchorHint":
    "Re-anchoring “{label}” — select a line or range in the editor and confirm.",
  "orphans.confirm": "Anchor here",
  "comments.empty": "No comments yet. Hover a line and click +, or select code and press the comment shortcut.",
  "comments.filter.all": "All",
  "comments.filter.thisFile": "This file",
  "comments.jump": "Jump to code",
  "comments.open": "Open",
  "comments.history": "History",
  "comments.historyEmpty": "No resolved comments yet.",
  "comments.resolvedAt": "Resolved {date}",

  "gitignore.title": "Add .reado/ to .gitignore?",
  "gitignore.body":
    "Reado stores your comments under .reado/. By default they stay local and are not committed. You can version them later in Settings.",
  "gitignore.add": "Add to .gitignore",
  "gitignore.keep": "Keep tracked",
  "gitignore.dontAsk": "Don't ask again",

  "theme.reado-dark": "Reado Dark",
  "theme.reado-light": "Reado Light",
  "theme.reado-high-contrast": "Reado High-Contrast",
  "theme.reado-sepia": "Reado Sepia",

  "common.cancel": "Cancel",
  "common.loading": "Loading…",
  "common.error": "Something went wrong.",
};

export type MessageKey = keyof typeof en;

const it: Record<MessageKey, string> = {
  "app.tagline": "Un posto tranquillo per leggere il codice.",
  "recents.title": "Progetti recenti",
  "recents.empty": "Ancora nessun progetto. Apri una cartella per iniziare a leggere.",
  "recents.open": "Apri cartella…",
  "recents.openHint": "Apri una cartella locale qualsiasi — repository git o no.",
  "recents.remove": "Rimuovi dalla lista",

  "tree.showHidden": "Mostra file nascosti e ignorati",
  "tree.empty": "Questa cartella è vuota.",
  "tree.search": "Filtra i file…",

  "editor.empty": "Seleziona un file dall'albero per iniziare a leggere.",
  "editor.binary": "File binario — anteprima non disponibile ({size}).",
  "editor.wrap": "A capo automatico",
  "editor.focus": "Modalità focus",
  "editor.measure": "Larghezza di lettura",
  "editor.edit": "Attiva/disattiva modifica",
  "editor.save": "Salva",
  "diff.toggle": "Mostra/nascondi diff",
  "diff.base": "Base del diff",
  "diff.head": "HEAD (non committato)",
  "diff.noBase": "Non presente nella base selezionata.",
  "diff.noChanges": "Nessuna modifica rispetto alla base selezionata.",

  "status.noFile": "Nessun file aperto",
  "status.branch": "ramo",
  "status.comments": "{count} aperti",
  "status.agentIdle": "Agente inattivo",
  "status.notGit": "Non è un repository git",

  "palette.placeholder": "Digita un comando…",
  "finder.placeholder": "Vai al file…",
  "search.placeholder": "Cerca nel progetto…",
  "search.noResults": "Nessun risultato.",
  "search.results": "{count} risultati",
  "search.ripgrepMissing": "ripgrep (rg) non è installato o non è nel PATH.",

  "settings.title": "Impostazioni",
  "settings.theme": "Tema",
  "settings.themeMode": "Modalità tema",
  "settings.mode.manual": "Manuale",
  "settings.mode.system": "Segui il sistema",
  "settings.mode.auto": "Affidati a Reado (ora del giorno)",
  "settings.language": "Lingua",
  "settings.codeFont": "Font del codice",
  "settings.completionSound": "Riproduci un suono quando l'agente finisce",
  "settings.notifications": "Notifiche",
  "settings.checkUpdates": "Controlla aggiornamenti…",
  "settings.close": "Chiudi",

  "empty.firstComment":
    "Seleziona una o più righe, poi premi la scorciatoia per lasciare la tua prima nota.",

  "comment.type.bug": "Bug",
  "comment.type.refactor": "Refactor",
  "comment.type.performance": "Performance",
  "comment.type.question": "Domanda",
  "comment.type.note": "Nota",
  "comment.state.open": "Aperto",
  "comment.state.in-progress": "In corso",
  "comment.state.done": "Risolto",
  "comment.state.discarded": "Scartato",
  "comment.task": "Task",
  "comment.note": "Nota",
  "comment.taskHint": "I task vengono inviati all'AI; le note no.",
  "comment.bodyPlaceholder": "Lascia un commento… Markdown supportato.",
  "comment.replyPlaceholder": "Rispondi…",
  "comment.new": "Nuovo commento sulla selezione",
  "comment.save": "Commenta",
  "comment.reply": "Rispondi",
  "comment.edit": "Modifica",
  "comment.delete": "Elimina",
  "comment.deleteConfirm": "Eliminare questo commento? L'azione è irreversibile.",
  "comment.you": "Tu",
  "comment.lines": "Righe {from}–{to}",
  "comment.line": "Riga {line}",
  "comment.scope.range": "Righe",
  "comment.scope.file": "File",
  "comment.scope.project": "Progetto",
  "comment.orphan": "Orfano — il codice ancorato non è stato trovato.",

  "terminal.new": "Nuovo terminale",
  "terminal.close": "Chiudi terminale",
  "terminal.hide": "Nascondi terminale",
  "terminal.toggle": "Mostra/nascondi terminale",
  "terminal.launchClaude": "Claude",
  "terminal.launchCodex": "Codex",
  "terminal.sendReview": "Invia review",
  "terminal.reviewSent": "{count} task inviati all'agente.",
  "terminal.noTasks": "Nessun task aperto da inviare.",
  "review.title": "Invia review",
  "review.target": "Invia a",
  "review.send": "Invia {count}",
  "review.selectAll": "Seleziona tutti",

  "files.panel": "File",
  "git.panel": "Controllo sorgente",
  "git.clean": "Nessuna modifica — working tree pulito.",
  "comments.panel": "Commenti",
  "graph.title": "Grafo della conoscenza",
  "docs.title": "Documentazione",
  "graph.legend.file": "File",
  "graph.legend.comment": "Commento",
  "graph.legend.link": "Collegato",
  "orphans.panel": "Orfani",
  "orphans.empty": "Nessun commento orfano.",
  "orphans.lastKnown": "Ultima posizione: {loc}",
  "orphans.reanchor": "Ri-ancora",
  "orphans.reanchorHint":
    "Ri-ancoraggio di “{label}” — seleziona una riga o un intervallo nell'editor e conferma.",
  "orphans.confirm": "Ancora qui",
  "comments.empty": "Ancora nessun commento. Passa su una riga e clicca +, oppure seleziona del codice e premi la scorciatoia.",
  "comments.filter.all": "Tutti",
  "comments.filter.thisFile": "Questo file",
  "comments.jump": "Vai al codice",
  "comments.open": "Aperti",
  "comments.history": "Cronologia",
  "comments.historyEmpty": "Ancora nessun commento risolto.",
  "comments.resolvedAt": "Risolto {date}",

  "gitignore.title": "Aggiungere .reado/ a .gitignore?",
  "gitignore.body":
    "Reado salva i tuoi commenti in .reado/. Per impostazione predefinita restano locali e non vengono committati. Puoi versionarli più avanti dalle Impostazioni.",
  "gitignore.add": "Aggiungi a .gitignore",
  "gitignore.keep": "Mantieni tracciato",
  "gitignore.dontAsk": "Non chiedere più",

  "theme.reado-dark": "Reado Scuro",
  "theme.reado-light": "Reado Chiaro",
  "theme.reado-high-contrast": "Reado Alto Contrasto",
  "theme.reado-sepia": "Reado Seppia",

  "common.cancel": "Annulla",
  "common.loading": "Caricamento…",
  "common.error": "Qualcosa è andato storto.",
};

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, it };

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/** Persisted active locale. Defaults to the OS language when it is Italian. */
export const useLocale = create<LocaleState>()(
  persist(
    (set) => ({
      locale: navigator.language.startsWith("it") ? "it" : "en",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "reado.locale" },
  ),
);

/**
 * React hook returning a translator bound to the active locale.
 * Interpolates `{name}` placeholders from `vars`.
 */
export function useT() {
  const locale = useLocale((s) => s.locale);
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    let str = dictionaries[locale][key] ?? en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  };
}
