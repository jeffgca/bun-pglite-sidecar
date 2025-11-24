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

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

if [[ -z "${EXE_FILE_NAME:-}" ]]; then
	EXE_FILE_NAME="index"
fi

if [[ -z "${OUTPUT_DIR:-}" ]]; then
	OUTPUT_DIR="$ROOT_DIR/dist"
fi

mkdir -p "$OUTPUT_DIR"

bun build --compile --target=bun "$ROOT_DIR"/index.ts --outfile="$OUTPUT_DIR/$EXE_FILE_NAME"

# Clean up any .bun-build files generated during the build process
shopt -s nullglob dotglob
for build_file in "$ROOT_DIR"/*.bun-build; do
	rm -f "$build_file"
done
shopt -u nullglob dotglob

echo "Build completed: $OUTPUT_DIR/$EXE_FILE_NAME"

