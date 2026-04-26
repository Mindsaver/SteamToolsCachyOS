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
INSTALL_TERMINAL_SH="$SCRIPTS_DIR/SteamToolsCachyOS-Linux-install-terminal.sh"
INSTALL_DESKTOP="$ROOT_DIR/assets/SteamToolsCachyOS-Install.desktop"
INSTALL_DESKTOP_RUN="$ROOT_DIR/assets/SteamToolsCachyOS-Install-Run-in-Terminal.desktop"
README_DIST="$DIST_DIR/README.txt"
VERSION_FILE="$DIST_DIR/VERSION"
MS_ROOT="$DIST_DIR/makeself_root"
RUN_OUT="$DIST_DIR/SteamToolsCachyOS-Linux-x86_64.run"
BIN_OUT="$DIST_DIR/SteamToolsCachyOS"

if [[ ! -f "$APP_SCRIPT" ]]; then
  echo "App script missing: $APP_SCRIPT" >&2
  exit 1
fi

python3 -m venv "$BUILD_VENV"
source "$BUILD_VENV/bin/activate"
python -m pip install --upgrade pip
python -m pip install PySide6 pyinstaller vdf packaging

pyinstaller \
  --noconfirm \
  --clean \
  --onefile \
  --name SteamToolsCachyOS \
  --paths "$SCRIPTS_DIR" \
  --hidden-import dll_ffx_versions \
  --hidden-import vdf \
  --hidden-import steam_launch_options_core \
  --hidden-import launch_options_window \
  --hidden-import launch_options_compose \
  --hidden-import launch_options_structured_panel \
  --hidden-import gpu_vendor_detect \
  --hidden-import steam_compat_context \
  --hidden-import fsr_dll_window \
  --hidden-import steamtools_update \
  --hidden-import packaging \
  --hidden-import packaging.version \
  --add-data "$SCRIPTS_DIR/steam-game-symlinks.sh:." \
  --add-data "$ROOT_DIR/assets/symlink-steam-logo.png:." \
  "$APP_SCRIPT"

GIT_SHORT="$(cd "$ROOT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo nogit)"
BUILD_DATE="$(date -Iseconds 2>/dev/null || date)"

# Semver in RELEASE_VERSION for GitHub / in-app updates (and first line of VERSION)
RELEASE_VERSION_FILE="$DIST_DIR/RELEASE_VERSION"
if [[ -n "${RELEASE_VERSION:-}" ]]; then
  SEMVER="${RELEASE_VERSION#v}"
elif [[ -n "${GITHUB_REF_NAME:-}" && "$GITHUB_REF_NAME" == v* ]]; then
  SEMVER="${GITHUB_REF_NAME#v}"
else
  _TAG="$(cd "$ROOT_DIR" && (git describe --tags --exact-match 2>/dev/null || git describe --tags --abbrev=0 2>/dev/null) || true)"
  if [[ -n "${_TAG:-}" ]]; then
    SEMVER="${_TAG#v}"
  else
    SEMVER="0.0.0+dev.${GIT_SHORT}"
  fi
fi
printf '%s\n' "$SEMVER" >"$RELEASE_VERSION_FILE"
{
  printf '%s\n' "$SEMVER"
  printf '%s %s\n' "$BUILD_DATE" "$GIT_SHORT"
} >"$VERSION_FILE"

cp -f "$ICON_SRC" "$DIST_DIR/symlink-steam-logo.png"
cp -f "$INSTALL_SH" "$DIST_DIR/install.sh"
cp -f "$UNINSTALL_SCRIPT" "$DIST_DIR/uninstall.sh"
cp -f "$INSTALL_TERMINAL_SH" "$DIST_DIR/SteamToolsCachyOS-Linux-install-terminal.sh"
cp -f "$INSTALL_DESKTOP" "$DIST_DIR/SteamToolsCachyOS-Install.desktop"
cp -f "$INSTALL_DESKTOP_RUN" "$DIST_DIR/SteamToolsCachyOS-Install-Run-in-Terminal.desktop"
chmod +x "$BIN_OUT" "$DIST_DIR/install.sh" "$DIST_DIR/uninstall.sh" \
  "$DIST_DIR/SteamToolsCachyOS-Linux-install-terminal.sh"

cat >"$README_DIST" <<'EOF'
SteamToolsCachyOS — Linux release (zip this folder; optional single-file .run if your packager built it)

  One-file installer (when SteamToolsCachyOS-Linux-x86_64.run is present)
      chmod +x SteamToolsCachyOS-Linux-x86_64.run
      ./SteamToolsCachyOS-Linux-x86_64.run
      Extracts to a temp directory and runs install.sh automatically.

  If double-clicking the .run does nothing (common on KDE / Wayland)
      Double-click one of:
        SteamToolsCachyOS-Install-Run-in-Terminal.desktop  (runs the .run with Terminal=true)
        SteamToolsCachyOS-Install.desktop                  (Konsole / other terminals)
      Or in a shell:  ./SteamToolsCachyOS-Linux-install-terminal.sh

  Install or update from this folder
      ./install.sh
      Copies the app to ~/.local/share/SteamToolsCachyOS, registers the menu entry, and
      symlinks ~/.local/bin/SteamToolsCachyOS. Run again after unpacking a newer release
      to update in place (same paths; files are overwritten).

  Run without installing
      ./SteamToolsCachyOS

  Remove
      ./uninstall.sh
      Or after install: ~/.local/share/SteamToolsCachyOS/uninstall.sh

  VERSION
      Line 1: release semver. Line 2: UTC date + git revision. install.sh copies into the prefix.

  RELEASE_VERSION
      Single line: semver (matches Git tag without leading "v").

  Install latest from GitHub (downloads release zip; needs curl, python3, unzip)
      curl -fsSL https://raw.githubusercontent.com/Mindsaver/SteamToolsCachyOS/main/scripts/install-latest-github.sh | bash

  Forks: STEAMTOOLS_INSTALL_REPO=owner/repo

Maintainer: install the `makeself` package (or set MAKESELF=/path/to/makeself.sh) to produce the .run.
Set SKIP_MAKESELF=1 when invoking the build script to skip .run generation.
EOF

rm -rf "$MS_ROOT"
mkdir -p "$MS_ROOT"
cp -f "$BIN_OUT" "$DIST_DIR/symlink-steam-logo.png" \
  "$DIST_DIR/install.sh" "$DIST_DIR/uninstall.sh" "$DIST_DIR/README.txt" \
  "$DIST_DIR/SteamToolsCachyOS-Linux-install-terminal.sh" "$DIST_DIR/SteamToolsCachyOS-Install.desktop" \
  "$DIST_DIR/SteamToolsCachyOS-Install-Run-in-Terminal.desktop" \
  "$VERSION_FILE" "$RELEASE_VERSION_FILE" "$MS_ROOT/"
chmod +x "$MS_ROOT/SteamToolsCachyOS" "$MS_ROOT/install.sh" "$MS_ROOT/uninstall.sh" \
  "$MS_ROOT/SteamToolsCachyOS-Linux-install-terminal.sh"

cat >"$MS_ROOT/MAKESELF_HELP_HEADER.txt" <<'EOF'
This .run archive installs SteamToolsCachyOS under your user account
(~/.local/share/SteamToolsCachyOS). No root password is needed.

After unpacking, install.sh runs automatically. When it finishes, this
terminal shows a clear "SteamToolsCachyOS is installed" summary. You can then
open the app from your desktop environment's application menu.

If double-clicking this .run file does nothing, use SteamToolsCachyOS-Install-Run-in-Terminal.desktop
or SteamToolsCachyOS-Install.desktop from the same folder as the .run (or SteamToolsCachyOS-Linux-install-terminal.sh).
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
    "$MS_ROOT" "$RUN_OUT" "SteamToolsCachyOS: installs to your menu (watch this terminal when done)" \
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
echo "    SteamToolsCachyOS"
echo "    symlink-steam-logo.png"
echo "    install.sh"
echo "    uninstall.sh"
echo "    VERSION"
echo "    RELEASE_VERSION"
echo "    README.txt"
echo "    SteamToolsCachyOS-Linux-install-terminal.sh"
echo "    SteamToolsCachyOS-Install.desktop"
echo "    SteamToolsCachyOS-Install-Run-in-Terminal.desktop"
if [[ -f "$RUN_OUT" ]]; then
  echo "    SteamToolsCachyOS-Linux-x86_64.run"
fi
echo ""
echo "Run (portable):"
echo "  $BIN_OUT"
