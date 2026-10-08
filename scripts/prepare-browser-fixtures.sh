#!/usr/bin/env bash
# Installs the packed library into each browser fixture app, then builds them.
# By default packs the current build (requires `npm run build`); with QPDF_TARBALL=<path> it installs that
# tarball instead (release.yml tests the exact tarball it publishes).
# Fixture tools are pinned to exact versions and installed with --ignore-scripts: no third-party install
# scripts run, and none are needed by vite, webpack or webpack-cli.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$ROOT/out/pack"
rm -f "$ROOT"/out/pack/*.tgz
if [ -n "${QPDF_TARBALL:-}" ]; then
  [ -f "$QPDF_TARBALL" ] || { echo "QPDF_TARBALL=$QPDF_TARBALL does not exist" >&2; exit 1; }
  cp "$QPDF_TARBALL" "$ROOT/out/pack/mssio-qpdf-wasm.tgz"
else
  (cd "$ROOT" && npm pack --pack-destination out/pack >/dev/null)
  mv "$ROOT"/out/pack/mssio-qpdf-wasm-*.tgz "$ROOT/out/pack/mssio-qpdf-wasm.tgz"
fi
for app in vite-app webpack-app; do
  dir="$ROOT/test/browser/fixtures/$app"
  rm -rf "$dir/node_modules/@mssio" "$dir/node_modules/.vite"
  cp "$ROOT/test/browser/smoke.js" "$dir/smoke.js"
  cp "$ROOT/test/browser/image-heavy-pdf.js" "$dir/image-heavy-pdf.js"
  (cd "$dir" && npm install --ignore-scripts --no-package-lock --no-audit --no-fund && npm run build)
done
