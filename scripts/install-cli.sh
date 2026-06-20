#!/usr/bin/env bash
#
# Build the `reado` CLI and link it onto your PATH so agents (claude/codex)
# launched from Reado can read and resolve tasks.
#
# Usage:
#   scripts/install-cli.sh [DEST_DIR]   # DEST_DIR defaults to ~/.local/bin
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="${1:-$HOME/.local/bin}"

echo "Building reado CLI (release)…"
cargo build --release --manifest-path "$repo_root/crates/reado-cli/Cargo.toml"

mkdir -p "$dest"
ln -sf "$repo_root/crates/reado-cli/target/release/reado" "$dest/reado"

echo "Linked reado -> $dest/reado"
case ":$PATH:" in
  *":$dest:"*) ;;
  *) echo "Note: $dest is not on your PATH. Add it, e.g.:"
     echo "      echo 'export PATH=\"$dest:\$PATH\"' >> ~/.zshrc" ;;
esac

echo "Done. Verify with: reado --help"
