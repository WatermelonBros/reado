## 1. Storage

- [ ] 1.1 Persist a set of read file paths per project under `.reado/` (e.g. `.reado/read.json`), gitignored; Rust commands `get_read`, `set_read(path, read)`.

## 2. State + auto-mark

- [ ] 2.1 Frontend store for read paths (load on project open).
- [ ] 2.2 Auto-mark: when the editor scrolls to (near) the bottom of a file, mark it read unless the user set it unread; manual override persists.

## 3. UI

- [ ] 3.1 File tree: quiet per-file read/unread indicator; per-folder aggregate (read/total).
- [ ] 3.2 Mark read/unread action (file-tree context menu + command palette).
- [ ] 3.3 Per-project progress summary (status bar or a small header in the tree).

## 4. Verify

- [ ] 4.1 typecheck + cargo check + build green; state survives restart.
