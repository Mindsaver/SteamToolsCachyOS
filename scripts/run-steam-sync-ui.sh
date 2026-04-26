#!/usr/bin/env bash
# Dev launcher: local venv with PySide6 + vdf (PEP 668–safe on Arch/CachyOS).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${STEAMTOOLS_CACHYOS_VENV:-${SYMLINK_STEAM_VENV:-$ROOT/.venv-ui-dev}}"
REQ="$ROOT/scripts/requirements-ui.txt"
PY="$VENV/bin/python"
PIP="$VENV/bin/pip"

if [[ ! -x "$PY" ]]; then
  echo "Creating venv: $VENV" >&2
  python3 -m venv "$VENV"
  "$PIP" install --upgrade pip
  "$PIP" install -r "$REQ"
fi

exec "$PY" "$ROOT/scripts/steam-sync-ui.py" "$@"
