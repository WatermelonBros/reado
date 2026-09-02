#!/usr/bin/env bash
#
# Print the CHANGELOG section for one version, for use as a GitHub release body.
#
# The release commit always carries the changelog entries for the version it
# tags (see CLAUDE.md → Releases & changelog), so the notes are already written
# by the time the tag builds — this just lifts them out.
#
# Usage: scripts/release-notes.sh v1.7.1   (a bare 1.7.1 works too)
set -euo pipefail
cd "$(dirname "$0")/.."

version="${1:?usage: release-notes.sh <version>}"
version="${version#v}"

# Everything between this version's heading and the next one, with the blank
# lines at either end trimmed (held back until the next real line proves they
# were *between* content, not padding). All in awk — `tac` isn't on macOS.
notes=$(
  awk -v v="$version" '
    index($0, "## [" v "]") == 1 { on = 1; next }
    on && /^## \[/ { exit }
    on && !/[^[:space:]]/ { held++; next }
    on {
      while (started && held-- > 0) print ""
      held = 0
      started = 1
      print
    }
  ' CHANGELOG.md
)

if [ -z "$notes" ]; then
  # A tag with no changelog section still gets a usable release page rather
  # than an empty one — and the missing section is visible, not silent.
  echo "No changelog entry was recorded for ${version}."
else
  echo "$notes"
fi

echo
echo "---"
echo
echo "See the assets below to download and install Reado for your platform."
echo "Reado updates itself automatically from signed releases."
