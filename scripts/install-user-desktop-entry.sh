#!/usr/bin/env bash
# Install a user .desktop entry so GNOME/KDE/Wayland shells can show the app icon
# (client-side setWindowIcon is often ignored there).
#
# Works from:
#   - A release folder: this script next to Symlink-Steam + symlink-steam-logo.png
#   - The git repo: .../scripts/install-user-desktop-entry.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/Symlink-Steam.desktop"

BUNDLE_BIN="$HERE/Symlink-Steam"
BUNDLE_ICON="$HERE/symlink-steam-logo.png"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
REPO_ICON="$REPO_ROOT/assets/symlink-steam-logo.png"
REPO_DIST="$REPO_ROOT/dist/Symlink-Steam"
REPO_PY="$REPO_ROOT/scripts/steam-sync-ui.py"

# Desktop Entry string escape: space -> \s, backslash -> \\
desk_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/ /\\s/g'
}

if [[ -f "$BUNDLE_BIN" ]] && [[ -f "$BUNDLE_ICON" ]]; then
  chmod +x "$BUNDLE_BIN" 2>/dev/null || true
  ICON_SRC="$BUNDLE_ICON"
  DIST_BIN="$BUNDLE_BIN"
  PY_MAIN=""
elif [[ -f "$REPO_ICON" ]]; then
  ICON_SRC="$REPO_ICON"
  DIST_BIN="$REPO_DIST"
  PY_MAIN="$REPO_PY"
else
  echo "Expected either:" >&2
  echo "  - Symlink-Steam and symlink-steam-logo.png next to this script (zip bundle), or" >&2
  echo "  - repo layout with $REPO_ICON" >&2
  exit 1
fi

if [[ ! -f "$ICON_SRC" ]]; then
  echo "Missing icon: $ICON_SRC" >&2
  exit 1
fi

ICON_FIELD="$(desk_escape "$ICON_SRC")"

if [[ -n "$PY_MAIN" ]] && [[ -f "$DIST_BIN" ]] && [[ -x "$DIST_BIN" ]]; then
  EXEC_FIELD="Exec=$(desk_escape "$DIST_BIN")"
  TRY_FIELD="TryExec=$(desk_escape "$DIST_BIN")"
elif [[ -n "$PY_MAIN" ]] && [[ -f "$DIST_BIN" ]]; then
  echo "Making executable: $DIST_BIN" >&2
  chmod +x "$DIST_BIN"
  EXEC_FIELD="Exec=$(desk_escape "$DIST_BIN")"
  TRY_FIELD="TryExec=$(desk_escape "$DIST_BIN")"
elif [[ -f "$DIST_BIN" ]]; then
  EXEC_FIELD="Exec=$(desk_escape "$DIST_BIN")"
  TRY_FIELD="TryExec=$(desk_escape "$DIST_BIN")"
else
  if [[ ! -f "$PY_MAIN" ]]; then
    echo "Missing $PY_MAIN and no executable $DIST_BIN — build the app or restore scripts." >&2
    exit 1
  fi
  PYTHON3="$(command -v python3)"
  ENV_BIN="$(command -v env)"
  if [[ -z "$PYTHON3" || -z "$ENV_BIN" ]]; then
    echo "python3 and env are required in PATH." >&2
    exit 1
  fi
  EXEC_FIELD="Exec=$(desk_escape "$ENV_BIN") SYMLINK_STEAM_ICON=$(desk_escape "$ICON_SRC") $(desk_escape "$PYTHON3") $(desk_escape "$PY_MAIN")"
  TRY_FIELD="TryExec=$(desk_escape "$PYTHON3")"
fi

mkdir -p "$(dirname "$APP_DESKTOP")"
umask 077
cat >"$APP_DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Version=1.5
Name=Symlink-Steam
Comment=Steam game symlinks and AMD FSR DLL helper
Icon=$ICON_FIELD
Categories=Utility;Game;
Terminal=false
StartupNotify=true
$TRY_FIELD
$EXEC_FIELD
EOF

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  ICON_THEME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"
  if [[ -d "$ICON_THEME_DIR" ]]; then
    gtk-update-icon-cache -f -t "$ICON_THEME_DIR" 2>/dev/null || true
  fi
fi

echo "Wrote: $APP_DESKTOP"
echo "Pick Symlink-Steam from the app menu, or run: gtk-launch Symlink-Steam.desktop"
