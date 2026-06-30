# X12 — OS Divergence Points

Behaviours that genuinely differ per OS — keys, window chrome, paths, shell/PTY, LSP discovery, fonts, watcher, updater, fractional scaling. Each is checked on macOS / Windows / Linux.

**Cases: 72.**

---

### TC-OSDIV-0001 — Modifier glyphs in hints/tooltips — macOS
**As a** user, **when I** exercise "Modifier glyphs in hints/tooltips" on macOS, **I expect** ⌘/⌥ render as Ctrl/Alt off macOS (cf. BUG-5).
- **Result:** TODO

### TC-OSDIV-0002 — Modifier glyphs in hints/tooltips — Windows
**As a** user, **when I** exercise "Modifier glyphs in hints/tooltips" on Windows, **I expect** ⌘/⌥ render as Ctrl/Alt off macOS (cf. BUG-5).
- **Result:** TODO (not executed)

### TC-OSDIV-0003 — Modifier glyphs in hints/tooltips — Linux
**As a** user, **when I** exercise "Modifier glyphs in hints/tooltips" on Linux, **I expect** ⌘/⌥ render as Ctrl/Alt off macOS (cf. BUG-5).
- **Result:** TODO (not executed)

### TC-OSDIV-0004 — Keyboard shortcuts fire — macOS
**As a** user, **when I** exercise "Keyboard shortcuts fire" on macOS, **I expect** Mod maps to the OS-correct key in every context.
- **Result:** TODO

### TC-OSDIV-0005 — Keyboard shortcuts fire — Windows
**As a** user, **when I** exercise "Keyboard shortcuts fire" on Windows, **I expect** Mod maps to the OS-correct key in every context.
- **Result:** TODO (not executed)

### TC-OSDIV-0006 — Keyboard shortcuts fire — Linux
**As a** user, **when I** exercise "Keyboard shortcuts fire" on Linux, **I expect** Mod maps to the OS-correct key in every context.
- **Result:** TODO (not executed)

### TC-OSDIV-0007 — Window chrome — macOS
**As a** user, **when I** exercise "Window chrome" on macOS, **I expect** native traffic lights on macOS; custom min/max/close on Windows/Linux.
- **Result:** TODO

### TC-OSDIV-0008 — Window chrome — Windows
**As a** user, **when I** exercise "Window chrome" on Windows, **I expect** native traffic lights on macOS; custom min/max/close on Windows/Linux.
- **Result:** TODO (not executed)

### TC-OSDIV-0009 — Window chrome — Linux
**As a** user, **when I** exercise "Window chrome" on Linux, **I expect** native traffic lights on macOS; custom min/max/close on Windows/Linux.
- **Result:** TODO (not executed)

### TC-OSDIV-0010 — Title bar decorations — macOS
**As a** user, **when I** exercise "Title bar decorations" on macOS, **I expect** decorations toggled correctly (setDecorations(false) off macOS).
- **Result:** TODO

### TC-OSDIV-0011 — Title bar decorations — Windows
**As a** user, **when I** exercise "Title bar decorations" on Windows, **I expect** decorations toggled correctly (setDecorations(false) off macOS).
- **Result:** TODO (not executed)

### TC-OSDIV-0012 — Title bar decorations — Linux
**As a** user, **when I** exercise "Title bar decorations" on Linux, **I expect** decorations toggled correctly (setDecorations(false) off macOS).
- **Result:** TODO (not executed)

### TC-OSDIV-0013 — Window controls operable — macOS
**As a** user, **when I** exercise "Window controls operable" on macOS, **I expect** minimise/maximise/close all work.
- **Result:** TODO

### TC-OSDIV-0014 — Window controls operable — Windows
**As a** user, **when I** exercise "Window controls operable" on Windows, **I expect** minimise/maximise/close all work.
- **Result:** TODO (not executed)

### TC-OSDIV-0015 — Window controls operable — Linux
**As a** user, **when I** exercise "Window controls operable" on Linux, **I expect** minimise/maximise/close all work.
- **Result:** TODO (not executed)

### TC-OSDIV-0016 — Path separators in the tree — macOS
**As a** user, **when I** exercise "Path separators in the tree" on macOS, **I expect** backslash paths normalise to forward slashes everywhere.
- **Result:** TODO

### TC-OSDIV-0017 — Path separators in the tree — Windows
**As a** user, **when I** exercise "Path separators in the tree" on Windows, **I expect** backslash paths normalise to forward slashes everywhere.
- **Result:** TODO (not executed)

### TC-OSDIV-0018 — Path separators in the tree — Linux
**As a** user, **when I** exercise "Path separators in the tree" on Linux, **I expect** backslash paths normalise to forward slashes everywhere.
- **Result:** TODO (not executed)

### TC-OSDIV-0019 — Comment anchors store forward-slash paths — macOS
**As a** user, **when I** exercise "Comment anchors store forward-slash paths" on macOS, **I expect** anchors are portable across OSes.
- **Result:** TODO

### TC-OSDIV-0020 — Comment anchors store forward-slash paths — Windows
**As a** user, **when I** exercise "Comment anchors store forward-slash paths" on Windows, **I expect** anchors are portable across OSes.
- **Result:** TODO (not executed)

### TC-OSDIV-0021 — Comment anchors store forward-slash paths — Linux
**As a** user, **when I** exercise "Comment anchors store forward-slash paths" on Linux, **I expect** anchors are portable across OSes.
- **Result:** TODO (not executed)

### TC-OSDIV-0022 — Search result paths — macOS
**As a** user, **when I** exercise "Search result paths" on macOS, **I expect** path:line links resolve with the OS separator.
- **Result:** TODO

### TC-OSDIV-0023 — Search result paths — Windows
**As a** user, **when I** exercise "Search result paths" on Windows, **I expect** path:line links resolve with the OS separator.
- **Result:** TODO (not executed)

### TC-OSDIV-0024 — Search result paths — Linux
**As a** user, **when I** exercise "Search result paths" on Linux, **I expect** path:line links resolve with the OS separator.
- **Result:** TODO (not executed)

### TC-OSDIV-0025 — Filesystem case sensitivity — macOS
**As a** user, **when I** exercise "Filesystem case sensitivity" on macOS, **I expect** case-sensitive Linux vs case-insensitive macOS/Windows handled.
- **Result:** TODO

### TC-OSDIV-0026 — Filesystem case sensitivity — Windows
**As a** user, **when I** exercise "Filesystem case sensitivity" on Windows, **I expect** case-sensitive Linux vs case-insensitive macOS/Windows handled.
- **Result:** TODO (not executed)

### TC-OSDIV-0027 — Filesystem case sensitivity — Linux
**As a** user, **when I** exercise "Filesystem case sensitivity" on Linux, **I expect** case-sensitive Linux vs case-insensitive macOS/Windows handled.
- **Result:** TODO (not executed)

### TC-OSDIV-0028 — Default shell / PTY — macOS
**As a** user, **when I** exercise "Default shell / PTY" on macOS, **I expect** zsh/bash on unix, PowerShell/cmd via COMSPEC on Windows.
- **Result:** TODO

### TC-OSDIV-0029 — Default shell / PTY — Windows
**As a** user, **when I** exercise "Default shell / PTY" on Windows, **I expect** zsh/bash on unix, PowerShell/cmd via COMSPEC on Windows.
- **Result:** TODO (not executed)

### TC-OSDIV-0030 — Default shell / PTY — Linux
**As a** user, **when I** exercise "Default shell / PTY" on Linux, **I expect** zsh/bash on unix, PowerShell/cmd via COMSPEC on Windows.
- **Result:** TODO (not executed)

### TC-OSDIV-0031 — Terminal rendering — macOS
**As a** user, **when I** exercise "Terminal rendering" on macOS, **I expect** ConPTY vs unix PTY: ANSI, resize, alternate screen.
- **Result:** TODO

### TC-OSDIV-0032 — Terminal rendering — Windows
**As a** user, **when I** exercise "Terminal rendering" on Windows, **I expect** ConPTY vs unix PTY: ANSI, resize, alternate screen.
- **Result:** TODO (not executed)

### TC-OSDIV-0033 — Terminal rendering — Linux
**As a** user, **when I** exercise "Terminal rendering" on Linux, **I expect** ConPTY vs unix PTY: ANSI, resize, alternate screen.
- **Result:** TODO (not executed)

### TC-OSDIV-0034 — LSP server discovery — macOS
**As a** user, **when I** exercise "LSP server discovery" on macOS, **I expect** login-shell PATH on unix vs Windows PATH.
- **Result:** TODO

### TC-OSDIV-0035 — LSP server discovery — Windows
**As a** user, **when I** exercise "LSP server discovery" on Windows, **I expect** login-shell PATH on unix vs Windows PATH.
- **Result:** TODO (not executed)

### TC-OSDIV-0036 — LSP server discovery — Linux
**As a** user, **when I** exercise "LSP server discovery" on Linux, **I expect** login-shell PATH on unix vs Windows PATH.
- **Result:** TODO (not executed)

### TC-OSDIV-0037 — Package-manager install hints — macOS
**As a** user, **when I** exercise "Package-manager install hints" on macOS, **I expect** apt/dnf/pacman/brew on Linux; a sensible hint (or none) on Windows.
- **Result:** TODO

### TC-OSDIV-0038 — Package-manager install hints — Windows
**As a** user, **when I** exercise "Package-manager install hints" on Windows, **I expect** apt/dnf/pacman/brew on Linux; a sensible hint (or none) on Windows.
- **Result:** TODO (not executed)

### TC-OSDIV-0039 — Package-manager install hints — Linux
**As a** user, **when I** exercise "Package-manager install hints" on Linux, **I expect** apt/dnf/pacman/brew on Linux; a sensible hint (or none) on Windows.
- **Result:** TODO (not executed)

### TC-OSDIV-0040 — Default code font — macOS
**As a** user, **when I** exercise "Default code font" on macOS, **I expect** a bundled/available monospace font on each OS.
- **Result:** TODO

### TC-OSDIV-0041 — Default code font — Windows
**As a** user, **when I** exercise "Default code font" on Windows, **I expect** a bundled/available monospace font on each OS.
- **Result:** TODO (not executed)

### TC-OSDIV-0042 — Default code font — Linux
**As a** user, **when I** exercise "Default code font" on Linux, **I expect** a bundled/available monospace font on each OS.
- **Result:** TODO (not executed)

### TC-OSDIV-0043 — File watcher semantics — macOS
**As a** user, **when I** exercise "File watcher semantics" on macOS, **I expect** create/modify/delete/rename events arrive on each OS.
- **Result:** TODO

### TC-OSDIV-0044 — File watcher semantics — Windows
**As a** user, **when I** exercise "File watcher semantics" on Windows, **I expect** create/modify/delete/rename events arrive on each OS.
- **Result:** TODO (not executed)

### TC-OSDIV-0045 — File watcher semantics — Linux
**As a** user, **when I** exercise "File watcher semantics" on Linux, **I expect** create/modify/delete/rename events arrive on each OS.
- **Result:** TODO (not executed)

### TC-OSDIV-0046 — Line endings — macOS
**As a** user, **when I** exercise "Line endings" on macOS, **I expect** CRLF files on Windows open/edit/save without corruption.
- **Result:** TODO

### TC-OSDIV-0047 — Line endings — Windows
**As a** user, **when I** exercise "Line endings" on Windows, **I expect** CRLF files on Windows open/edit/save without corruption.
- **Result:** TODO (not executed)

### TC-OSDIV-0048 — Line endings — Linux
**As a** user, **when I** exercise "Line endings" on Linux, **I expect** CRLF files on Windows open/edit/save without corruption.
- **Result:** TODO (not executed)

### TC-OSDIV-0049 — Drag-and-drop file import — macOS
**As a** user, **when I** exercise "Drag-and-drop file import" on macOS, **I expect** Finder/Explorer/Nautilus drops import correctly.
- **Result:** TODO

### TC-OSDIV-0050 — Drag-and-drop file import — Windows
**As a** user, **when I** exercise "Drag-and-drop file import" on Windows, **I expect** Finder/Explorer/Nautilus drops import correctly.
- **Result:** TODO (not executed)

### TC-OSDIV-0051 — Drag-and-drop file import — Linux
**As a** user, **when I** exercise "Drag-and-drop file import" on Linux, **I expect** Finder/Explorer/Nautilus drops import correctly.
- **Result:** TODO (not executed)

### TC-OSDIV-0052 — Clipboard copy/paste — macOS
**As a** user, **when I** exercise "Clipboard copy/paste" on macOS, **I expect** terminal + editor copy/paste per OS conventions.
- **Result:** TODO

### TC-OSDIV-0053 — Clipboard copy/paste — Windows
**As a** user, **when I** exercise "Clipboard copy/paste" on Windows, **I expect** terminal + editor copy/paste per OS conventions.
- **Result:** TODO (not executed)

### TC-OSDIV-0054 — Clipboard copy/paste — Linux
**As a** user, **when I** exercise "Clipboard copy/paste" on Linux, **I expect** terminal + editor copy/paste per OS conventions.
- **Result:** TODO (not executed)

### TC-OSDIV-0055 — Reado Anywhere — macOS
**As a** user, **when I** exercise "Reado Anywhere" on macOS, **I expect** cert generation + LAN bind work through the OS firewall.
- **Result:** TODO

### TC-OSDIV-0056 — Reado Anywhere — Windows
**As a** user, **when I** exercise "Reado Anywhere" on Windows, **I expect** cert generation + LAN bind work through the OS firewall.
- **Result:** TODO (not executed)

### TC-OSDIV-0057 — Reado Anywhere — Linux
**As a** user, **when I** exercise "Reado Anywhere" on Linux, **I expect** cert generation + LAN bind work through the OS firewall.
- **Result:** TODO (not executed)

### TC-OSDIV-0058 — Updater bundle — macOS
**As a** user, **when I** exercise "Updater bundle" on macOS, **I expect** dmg/msi/nsis/deb/appimage update path per OS.
- **Result:** TODO

### TC-OSDIV-0059 — Updater bundle — Windows
**As a** user, **when I** exercise "Updater bundle" on Windows, **I expect** dmg/msi/nsis/deb/appimage update path per OS.
- **Result:** TODO (not executed)

### TC-OSDIV-0060 — Updater bundle — Linux
**As a** user, **when I** exercise "Updater bundle" on Linux, **I expect** dmg/msi/nsis/deb/appimage update path per OS.
- **Result:** TODO (not executed)

### TC-OSDIV-0061 — Open external links — macOS
**As a** user, **when I** exercise "Open external links" on macOS, **I expect** URLs open in the OS default browser.
- **Result:** TODO

### TC-OSDIV-0062 — Open external links — Windows
**As a** user, **when I** exercise "Open external links" on Windows, **I expect** URLs open in the OS default browser.
- **Result:** TODO (not executed)

### TC-OSDIV-0063 — Open external links — Linux
**As a** user, **when I** exercise "Open external links" on Linux, **I expect** URLs open in the OS default browser.
- **Result:** TODO (not executed)

### TC-OSDIV-0064 — Native menu — macOS
**As a** user, **when I** exercise "Native menu" on macOS, **I expect** the menu bar renders per OS (mac menu vs in-window).
- **Result:** TODO

### TC-OSDIV-0065 — Native menu — Windows
**As a** user, **when I** exercise "Native menu" on Windows, **I expect** the menu bar renders per OS (mac menu vs in-window).
- **Result:** TODO (not executed)

### TC-OSDIV-0066 — Native menu — Linux
**As a** user, **when I** exercise "Native menu" on Linux, **I expect** the menu bar renders per OS (mac menu vs in-window).
- **Result:** TODO (not executed)

### TC-OSDIV-0067 — Reado CLI install — macOS
**As a** user, **when I** exercise "Reado CLI install" on macOS, **I expect** the `reado` CLI installs to the right per-OS location.
- **Result:** TODO

### TC-OSDIV-0068 — Reado CLI install — Windows
**As a** user, **when I** exercise "Reado CLI install" on Windows, **I expect** the `reado` CLI installs to the right per-OS location.
- **Result:** TODO (not executed)

### TC-OSDIV-0069 — Reado CLI install — Linux
**As a** user, **when I** exercise "Reado CLI install" on Linux, **I expect** the `reado` CLI installs to the right per-OS location.
- **Result:** TODO (not executed)

### TC-OSDIV-0070 — High-DPI / fractional scaling — macOS
**As a** user, **when I** exercise "High-DPI / fractional scaling" on macOS, **I expect** the UI is crisp at the OS display scaling.
- **Result:** TODO

### TC-OSDIV-0071 — High-DPI / fractional scaling — Windows
**As a** user, **when I** exercise "High-DPI / fractional scaling" on Windows, **I expect** the UI is crisp at the OS display scaling.
- **Result:** TODO (not executed)

### TC-OSDIV-0072 — High-DPI / fractional scaling — Linux
**As a** user, **when I** exercise "High-DPI / fractional scaling" on Linux, **I expect** the UI is crisp at the OS display scaling.
- **Result:** TODO (not executed)
