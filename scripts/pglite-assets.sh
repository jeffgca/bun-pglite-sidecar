#!/usr/bin/env bash

set -euo pipefail

SRC_DIR="./node_modules/@electric-sql/pglite/dist"
DEST_DIR="./lib/pglite-assets"
FILES=("pglite.wasm" "pglite.data")

mkdir -p "$DEST_DIR"

for file in "${FILES[@]}"; do
	src_path="$SRC_DIR/$file"
	dest_path="$DEST_DIR/$file"

	if [[ ! -f "$src_path" ]]; then
		echo "Source asset missing: $src_path" >&2
		exit 1
	fi

	if [[ -f "$dest_path" ]]; then
		if [[ "$src_path" -nt "$dest_path" ]]; then
			cp "$src_path" "$dest_path"
			echo "Updated $file with newer source"
		else
			echo "Already up-to-date: $dest_path"
			continue
		fi
	else
		cp "$src_path" "$dest_path"
		echo "Copied $file to $DEST_DIR"
	fi
done

echo "pglite assets ready."

