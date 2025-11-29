#!/usr/bin/env bash

set -euo pipefail

if ! command -v bun >/dev/null 2>&1; then
	echo "Error: bun is not on your PATH. Install it from https://bun.sh and ensure 'bun' is available." >&2
	exit 1
fi

if [[ -f .env ]]; then
	set -a
	source .env
	set +a
fi

BUN_MACOS_X86_TARGET="bun-darwin-x64"
BUN_MACOS_ARM_TARGET="bun-darwin-arm64"
BUN_LINUX_TARGET="bun-linux-x64"
BUN_WINDOWS_TARGET="bun-windows-x64"


ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
VERSION=$(node -p "require('./package.json').version")

if [[ -z "${EXE_FILE_NAME:-}" ]]; then
	EXE_FILE_NAME="sidecar"
fi

# PLAT_SUFFIX=`bun ./scripts/tauri-name.js`

# BUILD_FILE=`bun ./scripts/tauri-name.js`

if [[ -z "${OUTPUT_DIR:-}" ]]; then
	OUTPUT_DIR="$ROOT_DIR/dist"
fi

mkdir -p "$OUTPUT_DIR"
 
bun build --compile --define:APP_VERSION=$VERSION --target=$BUN_MACOS_ARM_TARGET "$ROOT_DIR"/index.ts --outfile="$OUTPUT_DIR/$EXE_FILE_NAME-aarch64-apple-darwin"
bun build --compile --define:APP_VERSION=$VERSION --target=$BUN_MACOS_X86_TARGET "$ROOT_DIR"/index.ts --outfile="$OUTPUT_DIR/$EXE_FILE_NAME-x86_64-apple-darwin"
bun build --compile --define:APP_VERSION=$VERSION --target=$BUN_LINUX_TARGET "$ROOT_DIR"/index.ts --outfile="$OUTPUT_DIR/$EXE_FILE_NAME-x86_64-unknown-linux-gnu"
bun build --compile --define:APP_VERSION=$VERSION --target=$BUN_WINDOWS_TARGET "$ROOT_DIR"/index.ts --outfile="$OUTPUT_DIR/$EXE_FILE_NAME-x86_64-pc-windows-msvc.exe"

# Clean up any .bun-build files generated during the build process
shopt -s nullglob dotglob
for build_file in "$ROOT_DIR"/*.bun-build; do
	rm -f "$build_file"
done
shopt -u nullglob dotglob

echo "Build completed: $OUTPUT_DIR/$EXE_FILE_NAME"

