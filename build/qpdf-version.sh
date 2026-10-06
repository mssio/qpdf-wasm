#!/usr/bin/env bash
# Prints the version of the qpdf source in vendor/qpdf (from its CMakeLists.txt), e.g. 12.4.2.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
sed -nE 's/^[[:space:]]*VERSION[[:space:]]+([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' "$ROOT/vendor/qpdf/CMakeLists.txt" | head -1
