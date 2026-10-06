#!/usr/bin/env bash
# Full verification, in order. Used by ci.yml, release.yml and qpdf-update.yml.
# Requires Docker, Node 24, and Playwright browsers (npx playwright install --with-deps).
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build:wasm
if ! git diff --quiet -- THIRD_PARTY_NOTICES.md; then
  echo "THIRD_PARTY_NOTICES.md changed after build:wasm; commit the regenerated file." >&2
  git diff --stat -- THIRD_PARTY_NOTICES.md >&2
  exit 1
fi
npm run typecheck
npm test
npm run build
npm run lint:package
npm run check:package
npm run check:readme
npm run test:browser
node scripts/size-report.mjs
