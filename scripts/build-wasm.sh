#!/usr/bin/env bash
# Builds src/wasm/* inside the pinned emscripten/emsdk Docker image (version + digest).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
EMSDK_VERSION=$(tr -d '[:space:]' < "$ROOT/build/emsdk-version")
EMSDK_DIGEST=$(tr -d '[:space:]' < "$ROOT/build/emsdk-digest")
if [[ ! "$EMSDK_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "build/emsdk-digest must contain the image digest (sha256:<64 hex>), got: '$EMSDK_DIGEST'" >&2
  exit 1
fi
if [ ! -f "$ROOT/vendor/qpdf/CMakeLists.txt" ]; then
  echo "vendor/qpdf is missing: run 'git submodule update --init'" >&2
  exit 1
fi
docker run --rm \
  -v "$ROOT:/work" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  "emscripten/emsdk:${EMSDK_VERSION}@${EMSDK_DIGEST}" \
  bash /work/build/build.sh
