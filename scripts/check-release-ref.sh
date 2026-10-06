#!/usr/bin/env bash
# Release guard: run in the repo root by release.yml before anything is built or published.
# Usage: check-release-ref.sh <tag> <commit-sha>
# Fails unless the tag is "v" + package.json's version and the commit is on origin/main.
set -euo pipefail
tag="$1"
sha="$2"
version=$(node -p "require('./package.json').version")
if [ "v$version" != "$tag" ]; then
  echo "Tag $tag does not match package.json version $version" >&2
  exit 1
fi
if ! git merge-base --is-ancestor "$sha" origin/main 2>/dev/null; then
  echo "Tag $tag points at $sha, which is not on main. Tag a commit on main." >&2
  exit 1
fi
echo "Release ref OK: $tag at $sha is on main"
