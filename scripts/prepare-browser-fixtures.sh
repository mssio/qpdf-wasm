#!/usr/bin/env bash
# Packs the built library and installs it into each browser fixture app, then builds them.
# Requires `npm run build` to have run.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$ROOT/out/pack"
rm -f "$ROOT"/out/pack/*.tgz
(cd "$ROOT" && npm pack --pack-destination out/pack >/dev/null)
mv "$ROOT"/out/pack/mssio-qpdf-wasm-*.tgz "$ROOT/out/pack/mssio-qpdf-wasm.tgz"
for app in vite-app webpack-app; do
  dir="$ROOT/test/browser/fixtures/$app"
  rm -rf "$dir/node_modules/@mssio"
  cp "$ROOT/test/browser/smoke.js" "$dir/smoke.js"
  (cd "$dir" && npm install --no-package-lock --no-audit --no-fund && npm run build)
done
