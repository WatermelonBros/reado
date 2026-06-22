/**
 * Bridge between the language-server diagnostics (in `lsp.ts`, outside React)
 * and the editor's comment composer. A diagnostic's "Create task" action
 * dispatches this effect on its own view; the editor catches it and opens the
 * composer for that line, prefilled with the diagnostic message.
 */
import { StateEffect } from "@codemirror/state";

export const taskFromDiagnostic = StateEffect.define<{
  from: number;
  to: number;
  message: string;
}>();
