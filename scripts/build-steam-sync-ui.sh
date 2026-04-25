#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"
APP_SCRIPT="$SCRIPTS_DIR/steam-sync-ui.py"
BUILD_VENV="$ROOT_DIR/.venv-ui-build"

if [[ ! -f "$APP_SCRIPT" ]]; then
  echo "App script missing: $APP_SCRIPT" >&2
  exit 1
fi

python3 -m venv "$BUILD_VENV"
source "$BUILD_VENV/bin/activate"
python -m pip install --upgrade pip
python -m pip install PySide6 pyinstaller vdf

pyinstaller \
  --noconfirm \
  --clean \
  --onefile \
  --name Symlink-Steam \
  --paths "$SCRIPTS_DIR" \
  --hidden-import dll_ffx_versions \
  --hidden-import vdf \
  --hidden-import steam_launch_options_core \
  --hidden-import launch_options_window \
  --add-data "$SCRIPTS_DIR/steam-game-symlinks.sh:." \
  --add-data "$ROOT_DIR/assets/symlink-steam-logo.png:." \
  "$APP_SCRIPT"

DIST_DIR="$ROOT_DIR/dist"
ICON_SRC="$ROOT_DIR/assets/symlink-steam-logo.png"
INSTALL_SCRIPT="$SCRIPTS_DIR/install-user-desktop-entry.sh"
README_DIST="$DIST_DIR/README.txt"

cp -f "$ICON_SRC" "$DIST_DIR/symlink-steam-logo.png"
cp -f "$INSTALL_SCRIPT" "$DIST_DIR/install-user-desktop-entry.sh"
chmod +x "$DIST_DIR/Symlink-Steam" "$DIST_DIR/install-user-desktop-entry.sh"

cat >"$README_DIST" <<'EOF'
Symlink-Steam — Linux bundle (zip this whole folder)

  ./Symlink-Steam
      Run the app from this directory (or anywhere; paths are relative to the binary).

  ./install-user-desktop-entry.sh
      One-time: adds a menu entry and desktop icon (Wayland-friendly).

Copy or extract the folder anywhere before running; keep Symlink-Steam,
symlink-steam-logo.png, and install-user-desktop-entry.sh together.
EOF

echo ""
echo "Release folder (zip this):"
echo "  $DIST_DIR/"
echo "    Symlink-Steam"
echo "    symlink-steam-logo.png"
echo "    install-user-desktop-entry.sh"
echo "    README.txt"
echo ""
echo "Run:"
echo "  $DIST_DIR/Symlink-Steam"
