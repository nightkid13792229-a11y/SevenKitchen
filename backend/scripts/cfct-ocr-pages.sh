#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${TMPDIR:-/tmp}/sevenkitchen-cfct-ocr"
SOURCE="$SCRIPT_DIR/cfct-ocr-pages.m"
BIN="$BUILD_DIR/cfct-ocr-pages"

mkdir -p "$BUILD_DIR"

if [[ ! -x "$BIN" || "$SOURCE" -nt "$BIN" ]]; then
  xcrun clang \
    -fobjc-arc \
    -framework Foundation \
    -framework AppKit \
    -framework PDFKit \
    -framework Vision \
    "$SOURCE" \
    -o "$BIN"
fi

exec "$BIN" "$@"
