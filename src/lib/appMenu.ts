/**
 * The rendered app-menu model for the Windows/Linux title bar.
 *
 * `decorations: false` removes the native menu strip on those platforms, so the
 * title bar draws its own menu bar from this model. Item ids match the cases in
 * `runMenuCommand` (lib/menu.ts) — the same handler the native macOS menu uses —
 * so there's a single source of truth for what each command does. Labels mirror
 * the native menu (English) for parity with macOS. Native-only items (undo/copy/
 * paste, quit) are omitted: the webview/keyboard already handle them.
 */
export type MenuItem =
  | { id: string; label: string }
  | { sep: true }
  | { header: string };

export interface Menu {
  label: string;
  items: MenuItem[];
}

export const APP_MENUS: Menu[] = [
  {
    label: "File",
    items: [
      { id: "window:new", label: "New Window" },
      { id: "newFile", label: "New File…" },
      { id: "openFile", label: "Open File…" },
      { id: "openFolder", label: "Open Folder…" },
      { id: "openRecent", label: "Open Recent…" },
      { sep: true },
      { id: "save", label: "Save" },
      { id: "saveAs", label: "Save As…" },
      { header: "Auto Save" },
      { id: "autosave:off", label: "Off" },
      { id: "autosave:afterDelay", label: "After Delay" },
      { id: "autosave:onFocusChange", label: "On Focus Change" },
      { id: "revert", label: "Revert File" },
      { id: "format", label: "Format Document" },
      { sep: true },
      { id: "reopenClosed", label: "Reopen Closed Editor" },
      { id: "closeEditor", label: "Close Editor" },
      { id: "closeProject", label: "Close Project" },
      { sep: true },
      { id: "settings", label: "Settings…" },
      { id: "checkUpdates", label: "Check for Updates…" },
    ],
  },
  {
    label: "Edit",
    items: [
      { id: "find", label: "Find…" },
      { id: "edit:replace", label: "Replace…" },
      { sep: true },
      { id: "edit:findInFiles", label: "Find in Files…" },
      { id: "edit:replaceInFiles", label: "Replace in Files…" },
      { sep: true },
      { id: "edit:toggleComment", label: "Toggle Line Comment" },
      { id: "edit:toggleBlockComment", label: "Toggle Block Comment" },
      { id: "gotoLine", label: "Go to Line…" },
    ],
  },
  {
    label: "Selection",
    items: [
      { id: "sel:expand", label: "Expand Selection" },
      { id: "sel:shrink", label: "Shrink Selection" },
      { sep: true },
      { id: "sel:addNext", label: "Add Selection to Next Match" },
      { id: "sel:allOccurrences", label: "Select All Occurrences" },
      { id: "sel:cursorAbove", label: "Add Cursor Above" },
      { id: "sel:cursorBelow", label: "Add Cursor Below" },
      { id: "sel:lineEnds", label: "Add Cursors to Line Ends" },
      { id: "sel:duplicate", label: "Duplicate Selection" },
      { sep: true },
      { id: "sel:explain", label: "Explain Selection with AI" },
      { sep: true },
      { id: "sel:copyUp", label: "Copy Line Up" },
      { id: "sel:copyDown", label: "Copy Line Down" },
      { id: "sel:moveUp", label: "Move Line Up" },
      { id: "sel:moveDown", label: "Move Line Down" },
    ],
  },
  {
    label: "Go",
    items: [
      { id: "go:back", label: "Back" },
      { id: "go:forward", label: "Forward" },
      { sep: true },
      { id: "palette:files", label: "Go to File…" },
      { id: "palette:symbols", label: "Go to Symbol in File…" },
      { id: "palette:wsymbols", label: "Go to Symbol in Project…" },
      { id: "palette:commands", label: "Command Palette…" },
      { id: "palette:search", label: "Search in Project…" },
      { sep: true },
      { id: "gotodef", label: "Go to Definition" },
      { id: "go:peek", label: "Peek Definition" },
      { id: "go:typedef", label: "Go to Type Definition" },
      { id: "go:impl", label: "Go to Implementation" },
      { id: "go:references", label: "Find References" },
      { id: "go:bracket", label: "Go to Bracket" },
      { id: "go:lastEdit", label: "Go to Last Edit Location" },
      { sep: true },
      { id: "go:nextProblem", label: "Next Problem" },
      { id: "go:prevProblem", label: "Previous Problem" },
      { sep: true },
      { id: "go:nextTab", label: "Next Editor" },
      { id: "go:prevTab", label: "Previous Editor" },
    ],
  },
  {
    label: "View",
    items: [
      { id: "palette:commands", label: "Command Palette…" },
      { header: "Open View" },
      { id: "view:open:files", label: "Files" },
      { id: "view:open:search", label: "Search" },
      { id: "view:open:comments", label: "Comments" },
      { id: "view:open:outline", label: "Outline" },
      { id: "view:open:git", label: "Source Control" },
      { id: "view:open:extensions", label: "Extensions" },
      { sep: true },
      { id: "view:sidebar", label: "Toggle Sidebar" },
      { id: "view:activityBar", label: "Toggle Activity Bar" },
      { id: "view:statusBar", label: "Toggle Status Bar" },
      { id: "view:breadcrumbs", label: "Toggle Breadcrumbs" },
      { id: "terminal", label: "Toggle Terminal" },
      { id: "view:split", label: "Split Editor" },
      { sep: true },
      { id: "view:wrap", label: "Toggle Word Wrap" },
      { id: "view:whitespace", label: "Render Whitespace" },
      { id: "view:focus", label: "Focus Mode" },
      { id: "view:readingWidth", label: "Centered/Reading Layout" },
      { sep: true },
      { id: "graph", label: "Knowledge Graph" },
      { id: "docs", label: "Documentation" },
      { header: "Appearance" },
      { id: "theme:reado-dark", label: "Dark" },
      { id: "theme:reado-light", label: "Light" },
      { id: "theme:reado-high-contrast", label: "High Contrast" },
      { id: "theme:reado-sepia", label: "Sepia" },
      { sep: true },
      { id: "zoom:in", label: "Zoom In" },
      { id: "zoom:out", label: "Zoom Out" },
      { id: "zoom:reset", label: "Reset Zoom" },
    ],
  },
  {
    label: "Terminal",
    items: [
      { id: "terminal:new", label: "New Terminal" },
      { id: "terminal:split", label: "Split Terminal" },
      { id: "terminal:clear", label: "Clear Terminal" },
      { id: "terminal:restart", label: "Restart Terminal" },
      { sep: true },
      { id: "terminal:launch:claude", label: "Launch Claude" },
      { id: "terminal:launch:codex", label: "Launch Codex" },
      { id: "terminal:launch:copilot", label: "Launch Copilot" },
      { id: "terminal:sendReview", label: "Send Review" },
    ],
  },
  {
    label: "Help",
    items: [
      { id: "help:shortcuts", label: "Keyboard Shortcuts" },
      { id: "docs", label: "Documentation" },
      { id: "help:website", label: "Reado Website" },
      { id: "help:report", label: "Report an Issue" },
      { sep: true },
      { id: "help:revealLog", label: "Reveal Log File" },
      { id: "help:copyLogPath", label: "Copy Log Path" },
      { sep: true },
      { id: "help:releases", label: "Release Notes" },
      { id: "checkUpdates", label: "Check for Updates…" },
    ],
  },
];
