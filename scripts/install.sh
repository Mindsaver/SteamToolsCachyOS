#!/usr/bin/env bash
# Install Symlink-Steam into ~/.local/share/Symlink-Steam (idempotent; safe to re-run for updates).
# Works from dist/, a zip extract, or a makeself temp directory.
set -euo pipefail

APP_NAME="Symlink-Steam"
BIN_NAME="Symlink-Steam"
ICON_NAME="symlink-steam-logo.png"
UNINSTALL_NAME="uninstall.sh"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/Symlink-Steam"
APP_DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/Symlink-Steam.desktop"
BIN_LINK="${HOME}/.local/bin/${BIN_NAME}"

SRC_BIN="$HERE/$BIN_NAME"
SRC_ICON="$HERE/$ICON_NAME"
SRC_UNINSTALL="$HERE/$UNINSTALL_NAME"
SRC_VERSION="$HERE/VERSION"

DRY_RUN=0
NO_BIN_LINK=0

usage() {
  echo "Usage: $0 [--dry-run] [--no-bin-link]" >&2
  echo "  Installs into $PREFIX and registers the desktop entry." >&2
  echo "  Re-run after downloading a newer build to update in place." >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-bin-link) NO_BIN_LINK=1 ;;
    -h | --help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

desk_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/ /\\s/g'
}

if [[ ! -f "$SRC_BIN" ]] || [[ ! -f "$SRC_ICON" ]]; then
  echo "Missing $BIN_NAME or $ICON_NAME next to this script in:" >&2
  echo "  $HERE" >&2
  exit 1
fi

if [[ ! -f "$SRC_UNINSTALL" ]]; then
  echo "Missing $UNINSTALL_NAME next to this script (expected for a release bundle)." >&2
  exit 1
fi

INSTALLED_BIN="$PREFIX/$BIN_NAME"
INSTALLED_ICON="$PREFIX/$ICON_NAME"
ENV_BIN="$(command -v env)"
if [[ -z "$ENV_BIN" ]]; then
  echo "env(1) not found in PATH." >&2
  exit 1
fi

ICON_FIELD="$(desk_escape "$INSTALLED_ICON")"
EXEC_FIELD="Exec=$(desk_escape "$ENV_BIN") SYMLINK_STEAM_ICON=$(desk_escape "$INSTALLED_ICON") $(desk_escape "$INSTALLED_BIN")"
TRY_FIELD="TryExec=$(desk_escape "$INSTALLED_BIN")"

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

run mkdir -p "$PREFIX"
run mkdir -p "$(dirname "$APP_DESKTOP")"
if [[ "$NO_BIN_LINK" -eq 0 ]]; then
  run mkdir -p "$(dirname "$BIN_LINK")"
fi

run cp -f "$SRC_BIN" "$INSTALLED_BIN"
run cp -f "$SRC_ICON" "$INSTALLED_ICON"
run cp -f "$SRC_UNINSTALL" "$PREFIX/$UNINSTALL_NAME"
if [[ -f "$SRC_VERSION" ]]; then
  run cp -f "$SRC_VERSION" "$PREFIX/VERSION"
fi

run chmod +x "$INSTALLED_BIN" "$PREFIX/$UNINSTALL_NAME"

if [[ "$DRY_RUN" -eq 0 ]]; then
  umask 077
  cat >"$APP_DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Version=1.5
Name=${APP_NAME}
Comment=Steam game symlinks and AMD FSR DLL helper
Icon=${ICON_FIELD}
Categories=Utility;Game;
Terminal=false
StartupNotify=true
${TRY_FIELD}
${EXEC_FIELD}
EOF
  echo "Wrote: $APP_DESKTOP"
else
  echo "[dry-run] would write: $APP_DESKTOP"
fi

if [[ "$NO_BIN_LINK" -eq 0 ]]; then
  run ln -sf "$INSTALLED_BIN" "$BIN_LINK"
  echo "Symlink: $BIN_LINK -> $INSTALLED_BIN"
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  ICON_THEME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"
  if [[ -d "$ICON_THEME_DIR" ]] && [[ "$DRY_RUN" -eq 0 ]]; then
    gtk-update-icon-cache -f -t "$ICON_THEME_DIR" 2>/dev/null || true
  fi
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] Would install $APP_NAME to $PREFIX"
  echo "Upgrade later: run this script again (or run a newer .run installer)."
  echo "Remove (after a real install): $PREFIX/$UNINSTALL_NAME"
  exit 0
fi

# Help app menus pick up the new .desktop without a full session restart.
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$(dirname "$APP_DESKTOP")" 2>/dev/null || true
fi

# Clear end state for normal installs (including when the Makeself .run invokes this script).
if [[ -t 1 ]]; then
  _c_hi=$'\033[1m'
  _c_ok=$'\033[32m'
  _c_rs=$'\033[0m'
else
  _c_hi=
  _c_ok=
  _c_rs=
fi
echo ""
echo "${_c_ok}${_c_hi}==================== Symlink-Steam is installed ====================${_c_rs}"
echo ""
echo "  Application folder:   $PREFIX"
echo "  Desktop menu entry: $APP_DESKTOP"
if [[ "$NO_BIN_LINK" -eq 0 ]]; then
  echo "  Terminal command:   $BIN_LINK"
fi
if [[ -f "$PREFIX/VERSION" ]]; then
  echo "  Build:                $(tr -d '\n' <"$PREFIX/VERSION" | head -c 200)"
fi
echo ""
echo "  You should see Symlink-Steam in your app menu. Re-run this installer to update;"
echo "  remove with: $PREFIX/$UNINSTALL_NAME"
echo ""
echo "${_c_ok}${_c_hi}====================================================================${_c_rs}"
echo ""

# Double-clicking the .run from the file manager often runs with no terminal; show something on screen.
gui_install_done_notice() {
  [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] || return 0
  local title="Symlink-Steam installed"
  local text
  text="Installation finished.

Open your application menu and search for Symlink-Steam.

Installed to:
$PREFIX"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -a "Symlink-Steam" -i "$INSTALLED_ICON" "$title" "$text" 2>/dev/null && return 0
  fi
  if command -v kdialog >/dev/null 2>&1; then
    kdialog --title "Symlink-Steam" --passivepopup "$text" 18 2>/dev/null || true
    return 0
  fi
  if command -v zenity >/dev/null 2>&1; then
    zenity --info --title="$title" --text="$text" --timeout=12 2>/dev/null || true
  fi
}

# No TTY when double-clicking the .run in Dolphin — the banner above is invisible; use the GUI.
if [[ ! -t 1 ]]; then
  gui_install_done_notice
fi
