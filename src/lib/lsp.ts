/**
 * Language Server integration (CodeMirror side).
 *
 * The Rust backend hosts the server processes; here we connect a CodeMirror
 * `LSPClient` to one per (server, project root) through a Tauri-backed transport,
 * and hand the editor a `languageServerSupport` extension for the open file.
 * Servers must be installed on the user's machine; when absent, `lsp_start`
 * fails and we silently fall back to the index-based features.

 *
 * The pieces live under `lsp/`: `connection` (servers, transport, lifecycle),
 * `shared` (the state and helpers they all read), and one module per feature.
 * This file re-exports the public surface, so `@/lib/lsp` stays the import site.
 */
export { codeLenses } from "./lsp/codeLens"
export {
  applyCompletion,
  completionWithImports,
  type LspCompletionItem,
  lspAttached,
} from "./lsp/completion"
export {
  hasServer,
  langIdFor,
  lspSupport,
  notifyWatchedFileChanged,
  refreshLspServers,
  useLspServers,
} from "./lsp/connection"
export { fileSaved } from "./lsp/diagnostics"
export {
  type DocumentLink,
  documentLinkAt,
  documentLinks,
  lspFolding,
  openDocumentLink,
} from "./lsp/documentFeature"
export {
  applyTextEdits,
  type CodeAction,
  lspCodeActions,
  lspFormat,
  lspFormatRange,
  onTypeFormatting,
  type ResolvedAction,
  renameSymbolAt,
} from "./lsp/edits"
export { lspHover } from "./lsp/hover"
export { linkedEditing } from "./lsp/linkedEditing"
export {
  type HierItem,
  type HierNode,
  lspCalls,
  lspDefinition,
  lspDocumentSymbols,
  lspLocate,
  lspPrepareCallHierarchy,
  lspPrepareTypeHierarchy,
  lspTypes,
  lspWorkspaceSymbols,
} from "./lsp/navigation"
export { decodeSemanticTokens, semanticTokens } from "./lsp/semanticTokens"
