#!/usr/bin/env bash
# Full verification, in order. Used by ci.yml, release.yml and qpdf-update.yml.
# Requires Docker, Node 24, and Playwright browsers (npx playwright install --with-deps).
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build:wasm
bash scripts/check-generated.sh
npm run typecheck
npm test
npm run build
npm run lint:package
npm run check:package
npm run check:readme
npm run test:browser
node scripts/size-report.mjs
