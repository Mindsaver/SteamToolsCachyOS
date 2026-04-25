#!/usr/bin/env bash
# Small Zenity UI wrapper for steam-game-symlinks.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_SCRIPT="$SCRIPT_DIR/steam-game-symlinks.sh"
_LEGACY_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/steam-game-symlinks-ui.conf"

AMD_DLL_PATH=""

require_zenity() {
  if ! command -v zenity >/dev/null 2>&1; then
    echo "zenity is not installed. Install it and run again." >&2
    exit 1
  fi
}

pick_dll() {
  local picked=""
  picked="$(zenity --file-selection \
    --title="Select amdxcffx64.dll" \
    --filename="${AMD_DLL_PATH:-$HOME/}" \
    --file-filter="DLL files (*.dll) | *.dll" \
    --file-filter="All files | *" 2>/dev/null || true)"
  if [[ -n "$picked" ]]; then
    AMD_DLL_PATH="$picked"
  fi
}

run_sync() {
  local cmd output_file
  cmd=("$BACKEND_SCRIPT")
  if [[ -n "$AMD_DLL_PATH" ]]; then
    cmd+=("--amd-dll=$AMD_DLL_PATH")
  fi

  output_file="$(mktemp)"
  if "${cmd[@]}" >"$output_file" 2>&1; then
    zenity --text-info \
      --title="Steam Sync Complete" \
      --filename="$output_file" \
      --width=900 --height=650
  else
    zenity --error --title="Steam Sync Failed" --text="Sync failed. Showing output next."
    zenity --text-info \
      --title="Steam Sync Error Output" \
      --filename="$output_file" \
      --width=900 --height=650
  fi
  rm -f "$output_file"
}

show_form() {
  local result exit_code
  set +e
  result="$(
    zenity --list \
      --title="Steam Game Symlink Sync" \
      --text="AMD DLL:\n${AMD_DLL_PATH:-Not selected (optional)}\n\nChoose an action." \
      --column="Action" \
      "Choose AMD DLL" \
      "Start Sync" \
      "Quit" \
      --ok-label="Sync Now" \
      --cancel-label="Quit" \
      --width=620 --height=320 2>/dev/null
  )"
  exit_code=$?
  set -e

  if [[ $exit_code -ne 0 ]]; then
    return 1
  fi

  case "$result" in
    "Choose AMD DLL")
      pick_dll
      return 2
      ;;
    "Start Sync")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

main() {
  rm -f "$_LEGACY_CONFIG" 2>/dev/null || true
  while true; do
    if show_form; then
      run_sync
    else
      case $? in
        1) exit 0 ;;
        2) continue ;;
        *) exit 1 ;;
      esac
    fi
  done
}

require_zenity
if [[ ! -x "$BACKEND_SCRIPT" ]]; then
  zenity --error --title="Missing Backend Script" --text="Cannot execute: $BACKEND_SCRIPT"
  exit 1
fi
main
