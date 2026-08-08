#!/bin/bash
# build-icons.sh — Render SF Symbols to PNG icons
# Run from the mac-control-center project root:
#   bash scripts/build-icons.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ICON_DIR="$PROJECT_ROOT/com.dylanL.maccontrol.plugin/resources/icons"

mkdir -p "$ICON_DIR"

cd "$PROJECT_ROOT"
swift scripts/render-sfsymbols.swift

echo "Icons rendered to $ICON_DIR"
