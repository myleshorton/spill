#!/bin/bash
# Build the samizdat_bridge native library for macOS
# This produces libsamizdat_bridge.dylib

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Auto-detect Dart SDK from Flutter
DART_SDK="${DART_SDK:-$PROJECT_DIR/../flutter/bin/cache/dart-sdk}"

# Fallback: try to find it via flutter
if [ ! -d "$DART_SDK/include" ]; then
  FLUTTER_ROOT=$(flutter sdk-path 2>/dev/null || true)
  if [ -n "$FLUTTER_ROOT" ]; then
    DART_SDK="$FLUTTER_ROOT/bin/cache/dart-sdk"
  fi
fi

# Check Dart SDK exists
if [ ! -f "$DART_SDK/include/dart_api_dl.h" ]; then
  echo "Error: Cannot find Dart SDK. Set DART_SDK env var."
  echo "Tried: $DART_SDK/include/dart_api_dl.h"
  exit 1
fi

echo "Using Dart SDK: $DART_SDK"
echo "Building libsamizdat_bridge.dylib..."

OUTPUT_DIR="$PROJECT_DIR/native/build"
mkdir -p "$OUTPUT_DIR"

clang -shared -o "$OUTPUT_DIR/libsamizdat_bridge.dylib" \
  -I "$DART_SDK/include" \
  "$SCRIPT_DIR/samizdat_bridge.c" \
  "$DART_SDK/include/dart_api_dl.c" \
  -framework Foundation \
  -arch arm64 -arch x86_64 \
  -std=c11 \
  -install_name @rpath/libsamizdat_bridge.dylib

echo "Built: $OUTPUT_DIR/libsamizdat_bridge.dylib"

# Copy to macOS Runner Frameworks directory so the app can find it
FRAMEWORKS_DIR="$PROJECT_DIR/macos/Runner"
mkdir -p "$FRAMEWORKS_DIR"

echo "Done."
