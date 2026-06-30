# X6 — Error Handling & Resilience

Every area against representative failure modes. The bar: graceful degradation, never a crash or unhandled rejection (cf. BUG-1).

**Cases: 406.**

---

### TC-ERR-0001 — the launcher: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0002 — the launcher: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0003 — the launcher: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0004 — the launcher: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0005 — the launcher: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0006 — the launcher: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0007 — the launcher: a huge file
**As a** user, **when I** hit a huge file while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0008 — the launcher: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0009 — the launcher: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0010 — the launcher: a symlink loop
**As a** user, **when I** hit a symlink loop while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0011 — the launcher: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0012 — the launcher: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0013 — the launcher: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0014 — the launcher: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0015 — the launcher: an empty project
**As a** user, **when I** hit an empty project while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0016 — the launcher: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0017 — the launcher: running out of disk
**As a** user, **when I** hit running out of disk while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0018 — the launcher: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0019 — the launcher: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0020 — the launcher: a read-only file
**As a** user, **when I** hit a read-only file while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0021 — the launcher: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0022 — the launcher: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0023 — the launcher: two windows on one project
**As a** user, **when I** hit two windows on one project while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0024 — the launcher: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0025 — the launcher: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0026 — the launcher: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0027 — the launcher: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0028 — the launcher: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0029 — the launcher: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using the launcher, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0030 — the editor: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0031 — the editor: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0032 — the editor: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0033 — the editor: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0034 — the editor: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0035 — the editor: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0036 — the editor: a huge file
**As a** user, **when I** hit a huge file while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0037 — the editor: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0038 — the editor: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0039 — the editor: a symlink loop
**As a** user, **when I** hit a symlink loop while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0040 — the editor: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0041 — the editor: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0042 — the editor: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0043 — the editor: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0044 — the editor: an empty project
**As a** user, **when I** hit an empty project while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0045 — the editor: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0046 — the editor: running out of disk
**As a** user, **when I** hit running out of disk while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0047 — the editor: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0048 — the editor: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0049 — the editor: a read-only file
**As a** user, **when I** hit a read-only file while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0050 — the editor: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0051 — the editor: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0052 — the editor: two windows on one project
**As a** user, **when I** hit two windows on one project while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0053 — the editor: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0054 — the editor: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0055 — the editor: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0056 — the editor: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0057 — the editor: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0058 — the editor: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using the editor, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0059 — the file tree: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0060 — the file tree: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0061 — the file tree: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0062 — the file tree: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0063 — the file tree: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0064 — the file tree: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0065 — the file tree: a huge file
**As a** user, **when I** hit a huge file while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0066 — the file tree: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0067 — the file tree: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0068 — the file tree: a symlink loop
**As a** user, **when I** hit a symlink loop while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0069 — the file tree: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0070 — the file tree: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0071 — the file tree: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0072 — the file tree: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0073 — the file tree: an empty project
**As a** user, **when I** hit an empty project while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0074 — the file tree: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0075 — the file tree: running out of disk
**As a** user, **when I** hit running out of disk while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0076 — the file tree: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0077 — the file tree: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0078 — the file tree: a read-only file
**As a** user, **when I** hit a read-only file while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0079 — the file tree: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0080 — the file tree: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0081 — the file tree: two windows on one project
**As a** user, **when I** hit two windows on one project while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0082 — the file tree: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0083 — the file tree: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0084 — the file tree: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0085 — the file tree: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0086 — the file tree: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0087 — the file tree: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using the file tree, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0088 — search: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0089 — search: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0090 — search: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0091 — search: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0092 — search: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0093 — search: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0094 — search: a huge file
**As a** user, **when I** hit a huge file while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0095 — search: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0096 — search: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0097 — search: a symlink loop
**As a** user, **when I** hit a symlink loop while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0098 — search: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0099 — search: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0100 — search: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0101 — search: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0102 — search: an empty project
**As a** user, **when I** hit an empty project while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0103 — search: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0104 — search: running out of disk
**As a** user, **when I** hit running out of disk while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0105 — search: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0106 — search: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0107 — search: a read-only file
**As a** user, **when I** hit a read-only file while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0108 — search: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0109 — search: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0110 — search: two windows on one project
**As a** user, **when I** hit two windows on one project while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0111 — search: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0112 — search: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0113 — search: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0114 — search: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0115 — search: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0116 — search: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using search, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0117 — comments: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0118 — comments: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0119 — comments: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0120 — comments: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0121 — comments: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0122 — comments: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0123 — comments: a huge file
**As a** user, **when I** hit a huge file while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0124 — comments: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0125 — comments: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0126 — comments: a symlink loop
**As a** user, **when I** hit a symlink loop while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0127 — comments: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0128 — comments: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0129 — comments: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0130 — comments: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0131 — comments: an empty project
**As a** user, **when I** hit an empty project while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0132 — comments: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0133 — comments: running out of disk
**As a** user, **when I** hit running out of disk while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0134 — comments: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0135 — comments: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0136 — comments: a read-only file
**As a** user, **when I** hit a read-only file while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0137 — comments: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0138 — comments: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0139 — comments: two windows on one project
**As a** user, **when I** hit two windows on one project while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0140 — comments: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0141 — comments: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0142 — comments: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0143 — comments: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0144 — comments: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0145 — comments: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using comments, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0146 — git: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0147 — git: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0148 — git: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0149 — git: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0150 — git: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0151 — git: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0152 — git: a huge file
**As a** user, **when I** hit a huge file while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0153 — git: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0154 — git: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0155 — git: a symlink loop
**As a** user, **when I** hit a symlink loop while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0156 — git: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0157 — git: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0158 — git: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0159 — git: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0160 — git: an empty project
**As a** user, **when I** hit an empty project while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0161 — git: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0162 — git: running out of disk
**As a** user, **when I** hit running out of disk while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0163 — git: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0164 — git: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0165 — git: a read-only file
**As a** user, **when I** hit a read-only file while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0166 — git: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0167 — git: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0168 — git: two windows on one project
**As a** user, **when I** hit two windows on one project while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0169 — git: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0170 — git: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0171 — git: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0172 — git: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0173 — git: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0174 — git: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using git, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0175 — guided review: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0176 — guided review: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0177 — guided review: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0178 — guided review: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0179 — guided review: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0180 — guided review: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0181 — guided review: a huge file
**As a** user, **when I** hit a huge file while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0182 — guided review: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0183 — guided review: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0184 — guided review: a symlink loop
**As a** user, **when I** hit a symlink loop while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0185 — guided review: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0186 — guided review: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0187 — guided review: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0188 — guided review: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0189 — guided review: an empty project
**As a** user, **when I** hit an empty project while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0190 — guided review: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0191 — guided review: running out of disk
**As a** user, **when I** hit running out of disk while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0192 — guided review: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0193 — guided review: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0194 — guided review: a read-only file
**As a** user, **when I** hit a read-only file while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0195 — guided review: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0196 — guided review: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0197 — guided review: two windows on one project
**As a** user, **when I** hit two windows on one project while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0198 — guided review: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0199 — guided review: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0200 — guided review: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0201 — guided review: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0202 — guided review: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0203 — guided review: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using guided review, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0204 — terminal: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0205 — terminal: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0206 — terminal: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0207 — terminal: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0208 — terminal: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0209 — terminal: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0210 — terminal: a huge file
**As a** user, **when I** hit a huge file while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0211 — terminal: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0212 — terminal: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0213 — terminal: a symlink loop
**As a** user, **when I** hit a symlink loop while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0214 — terminal: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0215 — terminal: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0216 — terminal: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0217 — terminal: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0218 — terminal: an empty project
**As a** user, **when I** hit an empty project while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0219 — terminal: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0220 — terminal: running out of disk
**As a** user, **when I** hit running out of disk while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0221 — terminal: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0222 — terminal: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0223 — terminal: a read-only file
**As a** user, **when I** hit a read-only file while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0224 — terminal: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0225 — terminal: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0226 — terminal: two windows on one project
**As a** user, **when I** hit two windows on one project while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0227 — terminal: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0228 — terminal: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0229 — terminal: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0230 — terminal: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0231 — terminal: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0232 — terminal: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using terminal, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0233 — LSP: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0234 — LSP: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0235 — LSP: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0236 — LSP: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0237 — LSP: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0238 — LSP: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0239 — LSP: a huge file
**As a** user, **when I** hit a huge file while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0240 — LSP: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0241 — LSP: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0242 — LSP: a symlink loop
**As a** user, **when I** hit a symlink loop while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0243 — LSP: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0244 — LSP: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0245 — LSP: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0246 — LSP: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0247 — LSP: an empty project
**As a** user, **when I** hit an empty project while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0248 — LSP: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0249 — LSP: running out of disk
**As a** user, **when I** hit running out of disk while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0250 — LSP: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0251 — LSP: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0252 — LSP: a read-only file
**As a** user, **when I** hit a read-only file while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0253 — LSP: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0254 — LSP: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0255 — LSP: two windows on one project
**As a** user, **when I** hit two windows on one project while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0256 — LSP: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0257 — LSP: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0258 — LSP: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0259 — LSP: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0260 — LSP: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0261 — LSP: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using LSP, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0262 — forge: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0263 — forge: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0264 — forge: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0265 — forge: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0266 — forge: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0267 — forge: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0268 — forge: a huge file
**As a** user, **when I** hit a huge file while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0269 — forge: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0270 — forge: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0271 — forge: a symlink loop
**As a** user, **when I** hit a symlink loop while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0272 — forge: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0273 — forge: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0274 — forge: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0275 — forge: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0276 — forge: an empty project
**As a** user, **when I** hit an empty project while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0277 — forge: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0278 — forge: running out of disk
**As a** user, **when I** hit running out of disk while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0279 — forge: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0280 — forge: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0281 — forge: a read-only file
**As a** user, **when I** hit a read-only file while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0282 — forge: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0283 — forge: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0284 — forge: two windows on one project
**As a** user, **when I** hit two windows on one project while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0285 — forge: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0286 — forge: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0287 — forge: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0288 — forge: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0289 — forge: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0290 — forge: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using forge, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0291 — anywhere: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0292 — anywhere: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0293 — anywhere: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0294 — anywhere: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0295 — anywhere: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0296 — anywhere: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0297 — anywhere: a huge file
**As a** user, **when I** hit a huge file while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0298 — anywhere: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0299 — anywhere: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0300 — anywhere: a symlink loop
**As a** user, **when I** hit a symlink loop while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0301 — anywhere: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0302 — anywhere: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0303 — anywhere: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0304 — anywhere: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0305 — anywhere: an empty project
**As a** user, **when I** hit an empty project while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0306 — anywhere: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0307 — anywhere: running out of disk
**As a** user, **when I** hit running out of disk while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0308 — anywhere: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0309 — anywhere: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0310 — anywhere: a read-only file
**As a** user, **when I** hit a read-only file while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0311 — anywhere: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0312 — anywhere: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0313 — anywhere: two windows on one project
**As a** user, **when I** hit two windows on one project while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0314 — anywhere: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0315 — anywhere: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0316 — anywhere: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0317 — anywhere: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0318 — anywhere: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0319 — anywhere: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using anywhere, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0320 — the palette: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0321 — the palette: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0322 — the palette: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0323 — the palette: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0324 — the palette: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0325 — the palette: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0326 — the palette: a huge file
**As a** user, **when I** hit a huge file while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0327 — the palette: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0328 — the palette: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0329 — the palette: a symlink loop
**As a** user, **when I** hit a symlink loop while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0330 — the palette: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0331 — the palette: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0332 — the palette: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0333 — the palette: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0334 — the palette: an empty project
**As a** user, **when I** hit an empty project while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0335 — the palette: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0336 — the palette: running out of disk
**As a** user, **when I** hit running out of disk while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0337 — the palette: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0338 — the palette: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0339 — the palette: a read-only file
**As a** user, **when I** hit a read-only file while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0340 — the palette: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0341 — the palette: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0342 — the palette: two windows on one project
**As a** user, **when I** hit two windows on one project while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0343 — the palette: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0344 — the palette: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0345 — the palette: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0346 — the palette: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0347 — the palette: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0348 — the palette: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using the palette, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0349 — settings: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0350 — settings: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0351 — settings: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0352 — settings: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0353 — settings: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0354 — settings: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0355 — settings: a huge file
**As a** user, **when I** hit a huge file while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0356 — settings: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0357 — settings: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0358 — settings: a symlink loop
**As a** user, **when I** hit a symlink loop while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0359 — settings: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0360 — settings: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0361 — settings: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0362 — settings: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0363 — settings: an empty project
**As a** user, **when I** hit an empty project while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0364 — settings: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0365 — settings: running out of disk
**As a** user, **when I** hit running out of disk while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0366 — settings: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0367 — settings: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0368 — settings: a read-only file
**As a** user, **when I** hit a read-only file while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0369 — settings: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0370 — settings: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0371 — settings: two windows on one project
**As a** user, **when I** hit two windows on one project while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0372 — settings: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0373 — settings: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0374 — settings: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0375 — settings: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0376 — settings: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0377 — settings: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using settings, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0378 — modals: a missing binary (ripgrep/git/lsp server)
**As a** user, **when I** hit a missing binary (ripgrep/git/lsp server) while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0379 — modals: a permission-denied file
**As a** user, **when I** hit a permission-denied file while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0380 — modals: a file deleted mid-edit
**As a** user, **when I** hit a file deleted mid-edit while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0381 — modals: a git operation that fails
**As a** user, **when I** hit a git operation that fails while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0382 — modals: a network failure (forge/anywhere)
**As a** user, **when I** hit a network failure (forge/anywhere) while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0383 — modals: a malformed .reado file
**As a** user, **when I** hit a malformed .reado file while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0384 — modals: a huge file
**As a** user, **when I** hit a huge file while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0385 — modals: a binary masquerading as text
**As a** user, **when I** hit a binary masquerading as text while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0386 — modals: a path with unicode/emoji
**As a** user, **when I** hit a path with unicode/emoji while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0387 — modals: a symlink loop
**As a** user, **when I** hit a symlink loop while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0388 — modals: concurrent edits from disk + editor
**As a** user, **when I** hit concurrent edits from disk + editor while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0389 — modals: a backend command timeout
**As a** user, **when I** hit a backend command timeout while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0390 — modals: an LSP server crash
**As a** user, **when I** hit an LSP server crash while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0391 — modals: an unsupported file type
**As a** user, **when I** hit an unsupported file type while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0392 — modals: an empty project
**As a** user, **when I** hit an empty project while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0393 — modals: a project that is not a git repo
**As a** user, **when I** hit a project that is not a git repo while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0394 — modals: running out of disk
**As a** user, **when I** hit running out of disk while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0395 — modals: a very long line (1MB)
**As a** user, **when I** hit a very long line (1MB) while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0396 — modals: a file with mixed line endings
**As a** user, **when I** hit a file with mixed line endings while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0397 — modals: a read-only file
**As a** user, **when I** hit a read-only file while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0398 — modals: a corrupt SQLite index
**As a** user, **when I** hit a corrupt SQLite index while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0399 — modals: a .reado dir with no write permission
**As a** user, **when I** hit a .reado dir with no write permission while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0400 — modals: two windows on one project
**As a** user, **when I** hit two windows on one project while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0401 — modals: a rapidly-changing file (watcher storm)
**As a** user, **when I** hit a rapidly-changing file (watcher storm) while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0402 — modals: an interrupted commit
**As a** user, **when I** hit an interrupted commit while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0403 — modals: a forge auth failure
**As a** user, **when I** hit a forge auth failure while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0404 — modals: a clipboard with huge content
**As a** user, **when I** hit a clipboard with huge content while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0405 — modals: a deeply nested directory
**As a** user, **when I** hit a deeply nested directory while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO

### TC-ERR-0406 — modals: a filename with newlines
**As a** user, **when I** hit a filename with newlines while using modals, **I expect** a graceful, non-crashing error or empty state — never an ErrorBoundary trip or unhandled rejection.
- **Result:** TODO
