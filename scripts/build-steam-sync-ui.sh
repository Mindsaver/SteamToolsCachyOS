#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"
APP_SCRIPT="$SCRIPTS_DIR/steam-sync-ui.py"
BUILD_VENV="$ROOT_DIR/.venv-ui-build"
DIST_DIR="$ROOT_DIR/dist"
ICON_SRC="$ROOT_DIR/assets/symlink-steam-logo.png"
INSTALL_SH="$SCRIPTS_DIR/install.sh"
UNINSTALL_SCRIPT="$SCRIPTS_DIR/uninstall.sh"
INSTALL_TERMINAL_SH="$SCRIPTS_DIR/Symlink-Steam-Linux-install-terminal.sh"
INSTALL_DESKTOP="$ROOT_DIR/assets/Symlink-Steam-Install.desktop"
INSTALL_DESKTOP_RUN="$ROOT_DIR/assets/Symlink-Steam-Install-Run-in-Terminal.desktop"
README_DIST="$DIST_DIR/README.txt"
VERSION_FILE="$DIST_DIR/VERSION"
MS_ROOT="$DIST_DIR/makeself_root"
RUN_OUT="$DIST_DIR/Symlink-Steam-Linux-x86_64.run"

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
  --hidden-import launch_options_compose \
  --hidden-import launch_options_structured_panel \
  --hidden-import gpu_vendor_detect \
  --hidden-import fsr_dll_window \
  --add-data "$SCRIPTS_DIR/steam-game-symlinks.sh:." \
  --add-data "$ROOT_DIR/assets/symlink-steam-logo.png:." \
  "$APP_SCRIPT"

GIT_SHORT="$(cd "$ROOT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo nogit)"
BUILD_DATE="$(date -Iseconds 2>/dev/null || date)"
echo "${BUILD_DATE} ${GIT_SHORT}" >"$VERSION_FILE"

cp -f "$ICON_SRC" "$DIST_DIR/symlink-steam-logo.png"
cp -f "$INSTALL_SH" "$DIST_DIR/install.sh"
cp -f "$UNINSTALL_SCRIPT" "$DIST_DIR/uninstall.sh"
cp -f "$INSTALL_TERMINAL_SH" "$DIST_DIR/Symlink-Steam-Linux-install-terminal.sh"
cp -f "$INSTALL_DESKTOP" "$DIST_DIR/Symlink-Steam-Install.desktop"
cp -f "$INSTALL_DESKTOP_RUN" "$DIST_DIR/Symlink-Steam-Install-Run-in-Terminal.desktop"
chmod +x "$DIST_DIR/Symlink-Steam" "$DIST_DIR/install.sh" "$DIST_DIR/uninstall.sh" \
  "$DIST_DIR/Symlink-Steam-Linux-install-terminal.sh"

cat >"$README_DIST" <<'EOF'
Symlink-Steam — Linux release (zip this folder; optional single-file .run if your packager built it)

  One-file installer (when Symlink-Steam-Linux-x86_64.run is present)
      chmod +x Symlink-Steam-Linux-x86_64.run
      ./Symlink-Steam-Linux-x86_64.run
      Extracts to a temp directory and runs install.sh automatically.

  If double-clicking the .run does nothing (common on KDE / Wayland)
      Double-click one of:
        Symlink-Steam-Install-Run-in-Terminal.desktop  (runs the .run with Terminal=true)
        Symlink-Steam-Install.desktop                  (Konsole / other terminals)
      Or in a shell:  ./Symlink-Steam-Linux-install-terminal.sh

  Install or update from this folder
      ./install.sh
      Copies the app to ~/.local/share/Symlink-Steam, registers the menu entry, and
      symlinks ~/.local/bin/Symlink-Steam. Run again after unpacking a newer release
      to update in place (same paths; files are overwritten).

  Run without installing
      ./Symlink-Steam

  Remove
      ./uninstall.sh
      Or after install: ~/.local/share/Symlink-Steam/uninstall.sh

  VERSION
      One-line build stamp (UTC date + git revision); install.sh copies it into the prefix.

Maintainer: install the `makeself` package (or set MAKESELF=/path/to/makeself.sh) to produce the .run.
Set SKIP_MAKESELF=1 when invoking the build script to skip .run generation.
EOF

rm -rf "$MS_ROOT"
mkdir -p "$MS_ROOT"
cp -f "$DIST_DIR/Symlink-Steam" "$DIST_DIR/symlink-steam-logo.png" \
  "$DIST_DIR/install.sh" "$DIST_DIR/uninstall.sh" "$DIST_DIR/README.txt" \
  "$DIST_DIR/Symlink-Steam-Linux-install-terminal.sh" "$DIST_DIR/Symlink-Steam-Install.desktop" \
  "$DIST_DIR/Symlink-Steam-Install-Run-in-Terminal.desktop" \
  "$VERSION_FILE" "$MS_ROOT/"
chmod +x "$MS_ROOT/Symlink-Steam" "$MS_ROOT/install.sh" "$MS_ROOT/uninstall.sh" \
  "$MS_ROOT/Symlink-Steam-Linux-install-terminal.sh"

cat >"$MS_ROOT/MAKESELF_HELP_HEADER.txt" <<'EOF'
This .run archive installs Symlink-Steam under your user account
(~/.local/share/Symlink-Steam). No root password is needed.

After unpacking, install.sh runs automatically. When it finishes, this
terminal shows a clear "Symlink-Steam is installed" summary. You can then
open the app from your desktop environment's application menu.

If double-clicking this .run file does nothing, use Symlink-Steam-Install-Run-in-Terminal.desktop
or Symlink-Steam-Install.desktop from the same folder as the .run (or Symlink-Steam-Linux-install-terminal.sh).
EOF

MAKESELF_CMD="${MAKESELF:-}"
if [[ -z "$MAKESELF_CMD" ]]; then
  if command -v makeself >/dev/null 2>&1; then
    MAKESELF_CMD=makeself
  elif command -v makeself.sh >/dev/null 2>&1; then
    MAKESELF_CMD=makeself.sh
  fi
fi

if [[ "${SKIP_MAKESELF:-}" == "1" ]]; then
  echo "SKIP_MAKESELF=1: not building .run (makeself skipped)."
elif [[ -z "${MAKESELF_CMD:-}" ]]; then
  echo "makeself not found in PATH (install the makeself package, or set MAKESELF=...). Skipping .run."
else
  rm -f "$RUN_OUT"
  set +e
  "$MAKESELF_CMD" \
    --nowait \
    --tar-quietly \
    --help-header "$MS_ROOT/MAKESELF_HELP_HEADER.txt" \
    "$MS_ROOT" "$RUN_OUT" "Symlink-Steam: installs to your menu (watch this terminal when done)" \
    ./install.sh
  ms_ec=$?
  set -e
  if [[ "$ms_ec" -ne 0 ]]; then
    echo "makeself failed (exit $ms_ec); .run not created. dist/ zip contents are still usable." >&2
    rm -f "$RUN_OUT"
  else
    chmod +x "$RUN_OUT"
    echo "Built: $RUN_OUT"
  fi
fi

rm -rf "$MS_ROOT"

echo ""
echo "Release folder (zip this):"
echo "  $DIST_DIR/"
echo "    Symlink-Steam"
echo "    symlink-steam-logo.png"
echo "    install.sh"
echo "    uninstall.sh"
echo "    VERSION"
echo "    README.txt"
echo "    Symlink-Steam-Linux-install-terminal.sh"
echo "    Symlink-Steam-Install.desktop"
echo "    Symlink-Steam-Install-Run-in-Terminal.desktop"
if [[ -f "$RUN_OUT" ]]; then
  echo "    Symlink-Steam-Linux-x86_64.run"
fi
echo ""
echo "Run (portable):"
echo "  $DIST_DIR/Symlink-Steam"
