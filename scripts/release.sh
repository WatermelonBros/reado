#!/usr/bin/env bash
#
# Auto-release: derive the next version from Conventional Commits since the last
# tag, bump package.json + tauri.conf.json, commit, tag, and push (which triggers
# the Release workflow).
#
#   feat!:  / fix!: / "BREAKING CHANGE" in body  → major
#   feat:                                         → minor
#   fix: (or anything else)                       → patch
#
# Usage: pnpm release           (auto bump)
#        pnpm release major|minor|patch   (force a bump level)
set -euo pipefail
cd "$(dirname "$0")/.."

last=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
range="${last}..HEAD"

if [ -z "$(git log "$range" --oneline 2>/dev/null)" ]; then
  echo "No commits since ${last}; nothing to release."
  exit 0
fi

# Decide the bump: explicit arg wins, else infer from commit messages.
bump="${1:-}"
if [ -z "$bump" ]; then
  log=$(git log "$range" --pretty=format:"%s%n%b")
  if echo "$log" | grep -qE "^[a-z]+(\(.+\))?!:" || echo "$log" | grep -q "BREAKING CHANGE"; then
    bump="major"
  elif echo "$log" | grep -qE "^feat(\(.+\))?:"; then
    bump="minor"
  else
    bump="patch"
  fi
fi

ver="${last#v}"
IFS=. read -r major minor patch <<<"$ver"
case "$bump" in
  major) major=$((major + 1)); minor=0; patch=0 ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  patch) patch=$((patch + 1)) ;;
  *) echo "Unknown bump '$bump' (use major|minor|patch)"; exit 1 ;;
esac
next="${major}.${minor}.${patch}"
tag="v${next}"

echo "→ ${last} → ${tag}  (${bump})"
git log "$range" --pretty=format:"   %s" | sed 's/^/  /'
echo

# Bump only the version line in each manifest (minimal diff).
sed -i.bak -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+(\")/\1${next}\2/" \
  package.json src-tauri/tauri.conf.json
rm -f package.json.bak src-tauri/tauri.conf.json.bak

git add package.json src-tauri/tauri.conf.json
git commit -m "release: ${tag}"
git tag "${tag}"
git push origin HEAD
git push origin "${tag}"
echo "Released ${tag}"
