#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_JSON="$ROOT_DIR/package.json"

if [[ ! -f "$PACKAGE_JSON" ]]; then
	echo "Error: package.json not found at $PACKAGE_JSON" >&2
	exit 1
fi

# Extract version using node
VERSION=$(node -p "require('$PACKAGE_JSON').version" 2>/dev/null || echo "")

if [[ -z "$VERSION" ]]; then
	echo "Error: Failed to extract version from package.json" >&2
	exit 1
fi

# Validate format: should match semantic versioning like 0.0.1, 1.2.3, etc.
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "Error: Version '$VERSION' is not in the correct format (expected: X.Y.Z)" >&2
	exit 1
fi

echo "$VERSION"
