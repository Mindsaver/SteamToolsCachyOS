#!/usr/bin/env bash
# Remove SteamToolsCachyOS user install (~/.local) and the launcher entry.
# Also removes legacy Symlink-Steam install paths if still present.
# Safe to run from any directory; does not delete arbitrary folders.
set -euo pipefail

PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/SteamToolsCachyOS"
BIN_LINK="${HOME}/.local/bin/SteamToolsCachyOS"
DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/SteamToolsCachyOS.desktop"
INSTALLED_BIN="$PREFIX/SteamToolsCachyOS"

LEGACY_PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/Symlink-Steam"
LEGACY_BIN_LINK="${HOME}/.local/bin/Symlink-Steam"
LEGACY_DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/Symlink-Steam.desktop"
LEGACY_INSTALLED_BIN="$LEGACY_PREFIX/Symlink-Steam"

remove_one_install() {
  local prefix="$1"
  local bin_link="$2"
  local desktop="$3"
  local installed_bin="$4"
  local label="$5"

  local expected_resolved
  expected_resolved=$(readlink -f "$installed_bin" 2>/dev/null || echo "$installed_bin")

  if [[ -L "$bin_link" ]]; then
    local t
    t=$(readlink -f "$bin_link" 2>/dev/null || true)
    if [[ -n "$t" && "$t" == "$expected_resolved" ]]; then
      rm -f "$bin_link"
      echo "Removed: $bin_link ($label)"
      any=1
    elif [[ -n "$t" ]]; then
      echo "Leaving $bin_link (points to $t, not $expected_resolved)." >&2
    fi
  fi

  if [[ -d "$prefix" ]]; then
    rm -rf "$prefix"
    echo "Removed: $prefix ($label)"
    any=1
  fi

  if [[ -f "$desktop" ]]; then
    rm -f "$desktop"
    echo "Removed: $desktop ($label)"
    any=1
  fi
}

any=0

remove_one_install "$PREFIX" "$BIN_LINK" "$DESKTOP" "$INSTALLED_BIN" "current"
remove_one_install "$LEGACY_PREFIX" "$LEGACY_BIN_LINK" "$LEGACY_DESKTOP" "$LEGACY_INSTALLED_BIN" "legacy"

if [[ "$any" -eq 0 ]]; then
  echo "Nothing found under ~/.local for SteamToolsCachyOS or legacy Symlink-Steam (no desktop entry or install prefix)."
fi

echo "If you ran the app from a portable folder or zip, delete that folder yourself."
