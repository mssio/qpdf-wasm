#!/usr/bin/env bash
# Builds src/wasm/* inside the pinned emscripten/emsdk Docker image.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
EMSDK_VERSION=$(tr -d '[:space:]' < "$ROOT/build/emsdk-version")
if [ ! -f "$ROOT/vendor/qpdf/CMakeLists.txt" ]; then
  echo "vendor/qpdf is missing: run 'git submodule update --init'" >&2
  exit 1
fi
docker run --rm \
  -v "$ROOT:/work" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  "emscripten/emsdk:$EMSDK_VERSION" \
  bash /work/build/build.sh
