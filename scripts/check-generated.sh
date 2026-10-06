#!/usr/bin/env bash
# Fails if `npm run build:wasm` changed a committed file it generates (third-party notices, README's
# qpdf version line). Run right after build:wasm.
set -euo pipefail
cd "$(dirname "$0")/.."
generated=(THIRD_PARTY_NOTICES.md README.md)
if ! git diff --quiet -- "${generated[@]}"; then
  echo "build:wasm regenerated files that differ from the committed ones; commit them:" >&2
  git diff --stat -- "${generated[@]}" >&2
  exit 1
fi
