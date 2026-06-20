#!/usr/bin/env bash
# Build the `reado` CLI and place it where Tauri expects a sidecar binary:
# src-tauri/binaries/reado-<target-triple>(.exe). Run by beforeBuildCommand.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-${TARGET:-$(rustc -vV | sed -n 's/host: //p')}}"
EXT=""
case "$TARGET" in *windows*) EXT=".exe" ;; esac

cargo build --release --manifest-path crates/reado-cli/Cargo.toml --target "$TARGET"

SRC="crates/reado-cli/target/$TARGET/release/reado$EXT"
[ -f "$SRC" ] || SRC="crates/reado-cli/target/release/reado$EXT"

# Sidecar must not share the Tauri package name ("reado"); ship as "reado-cli".
mkdir -p src-tauri/binaries
cp "$SRC" "src-tauri/binaries/reado-cli-$TARGET$EXT"
echo "bundled src-tauri/binaries/reado-cli-$TARGET$EXT"
