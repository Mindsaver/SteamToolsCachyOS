#!/usr/bin/env bash
# Remove Symlink-Steam user install (~/.local) and the launcher entry.
# Safe to run from any directory; does not delete arbitrary folders.
set -euo pipefail

PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/Symlink-Steam"
BIN_LINK="${HOME}/.local/bin/Symlink-Steam"
DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/Symlink-Steam.desktop"
INSTALLED_BIN="$PREFIX/Symlink-Steam"
# GNU readlink -f: works for broken symlinks if parent path exists
expected_resolved=$(readlink -f "$INSTALLED_BIN" 2>/dev/null || echo "$INSTALLED_BIN")

any=0

if [[ -L "$BIN_LINK" ]]; then
  t=$(readlink -f "$BIN_LINK" 2>/dev/null || true)
  if [[ -n "$t" && "$t" == "$expected_resolved" ]]; then
    rm -f "$BIN_LINK"
    echo "Removed: $BIN_LINK"
    any=1
  elif [[ -n "$t" ]]; then
    echo "Leaving $BIN_LINK (points to $t, not $expected_resolved)." >&2
  fi
fi

if [[ -d "$PREFIX" ]]; then
  rm -rf "$PREFIX"
  echo "Removed: $PREFIX"
  any=1
fi

if [[ -f "$DESKTOP" ]]; then
  rm -f "$DESKTOP"
  echo "Removed: $DESKTOP"
  any=1
fi

if [[ "$any" -eq 0 ]]; then
  echo "Nothing found under ~/.local for Symlink-Steam (no desktop entry or install prefix)."
fi

echo "If you ran the app from a portable folder or zip, delete that folder yourself."
