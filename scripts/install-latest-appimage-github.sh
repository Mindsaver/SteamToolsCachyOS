#!/usr/bin/env bash
# Download the latest GitHub release AppImage for SteamToolsCachyOS (Electron build), extract it, install under ~/.local/share.
# Extraction uses --appimage-extract so FUSE (libfuse.so.2) is NOT required to run the app.
# Requires: curl, python3.
# Usage: curl -fsSL https://raw.githubusercontent.com/Mindsaver/SteamToolsCachyOS/main/scripts/install-latest-appimage-github.sh | bash
set -euo pipefail

DEFAULT_OWNER="Mindsaver"
DEFAULT_REPO="SteamToolsCachyOS"
ASSET_NAME="SteamToolsCachyOS-Linux-x86_64.AppImage"

if [[ -n "${STEAMTOOLS_INSTALL_REPO:-}" ]]; then
  GITHUB_OWNER="${STEAMTOOLS_INSTALL_REPO%%/*}"
  GITHUB_REPO="${STEAMTOOLS_INSTALL_REPO#*/}"
  if [[ -z "$GITHUB_OWNER" || -z "$GITHUB_REPO" || "$GITHUB_OWNER" == "$STEAMTOOLS_INSTALL_REPO" ]]; then
    echo "STEAMTOOLS_INSTALL_REPO must be in the form owner/repo (e.g. Mindsaver/SteamToolsCachyOS)" >&2
    exit 1
  fi
else
  GITHUB_OWNER="${GITHUB_OWNER:-$DEFAULT_OWNER}"
  GITHUB_REPO="${GITHUB_REPO:-$DEFAULT_REPO}"
fi

for cmd in curl python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

API_URL="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest"
echo "Fetching latest release: $API_URL"

TMPJSON="$(mktemp)"
HTTP_CODE=$(curl -fsSL -w "%{http_code}" -o "$TMPJSON" -H "Accept: application/vnd.github+json" "$API_URL" || true)
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "GitHub API failed (HTTP $HTTP_CODE). Response:" >&2
  cat "$TMPJSON" >&2 || true
  rm -f "$TMPJSON"
  exit 1
fi

read -r ASSET_URL RELEASE_TAG < <(python3 -c "
import json, sys
asset_name = sys.argv[2]
with open(sys.argv[1], encoding='utf-8') as f:
    data = json.load(f)
url = None
for a in data.get('assets') or []:
    if a.get('name') == asset_name:
        url = a.get('browser_download_url')
        break
if not url:
    print('No asset named ' + asset_name + ' in the latest release.', file=sys.stderr)
    print('The Electron workflow must have uploaded this AppImage for that release.', file=sys.stderr)
    sys.exit(1)
print(url)
print(data.get('tag_name', ''))
" "$TMPJSON" "$ASSET_NAME")
rm -f "$TMPJSON"

echo "Release: ${RELEASE_TAG:-unknown}"
echo "Downloading: $ASSET_NAME"

PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/SteamToolsCachyOS"
EXTRACT_ROOT="$PREFIX/squashfs-root"
APPRUN="$EXTRACT_ROOT/AppRun"
APP_DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/SteamToolsCachyOS.desktop"
BIN_LINK="${HOME}/.local/bin/SteamToolsCachyOS"
ICON_PATH="$PREFIX/symlink-steam-logo.png"
ICON_URL="https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/assets/symlink-steam-logo.png"
UNINSTALL_SCRIPT="$PREFIX/uninstall-github-appimage.sh"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
DL_PATH="$WORKDIR/$ASSET_NAME"

curl -fSL -o "$DL_PATH" "$ASSET_URL"
chmod +x "$DL_PATH"

echo "Extracting AppImage (no FUSE required)…"
(
  cd "$WORKDIR"
  "./$ASSET_NAME" --appimage-extract
)
if [[ ! -x "$WORKDIR/squashfs-root/AppRun" ]]; then
  echo "Extract failed: $WORKDIR/squashfs-root/AppRun missing or not executable." >&2
  exit 1
fi

mkdir -p "$PREFIX"
mkdir -p "$(dirname "$APP_DESKTOP")"
mkdir -p "$(dirname "$BIN_LINK")"

rm -rf "$EXTRACT_ROOT"
mv "$WORKDIR/squashfs-root" "$EXTRACT_ROOT"
chmod +x "$APPRUN"

# Legacy single-file install; remove if present.
rm -f "$PREFIX/SteamToolsCachyOS.AppImage"

if curl -fsSL -o "$ICON_PATH.part" "$ICON_URL" && mv -f "$ICON_PATH.part" "$ICON_PATH"; then
  :
else
  rm -f "$ICON_PATH.part" 2>/dev/null || true
  ICON_PATH=""
fi

umask 077
{
  printf '%s\n' '[Desktop Entry]'
  printf '%s\n' 'Type=Application'
  printf '%s\n' 'Version=1.5'
  printf '%s\n' 'Name=SteamToolsCachyOS'
  printf '%s\n' 'Comment=Steam toolkit for CachyOS and other Linux distros'
  printf '%s\n' 'Categories=Utility;Game;'
  printf '%s\n' 'Terminal=false'
  printf '%s\n' 'StartupNotify=true'
  printf 'TryExec=%s\n' "$APPRUN"
  printf 'Exec=%s %%u\n' "$APPRUN"
  if [[ -n "$ICON_PATH" ]]; then
    printf 'Icon=%s\n' "$ICON_PATH"
  fi
} >"$APP_DESKTOP"
echo "Wrote: $APP_DESKTOP"

ln -sf "$APPRUN" "$BIN_LINK"
echo "Bin link: $BIN_LINK -> $APPRUN"

cat >"$UNINSTALL_SCRIPT" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/SteamToolsCachyOS"
APP_DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/SteamToolsCachyOS.desktop"
BIN_LINK="${HOME}/.local/bin/SteamToolsCachyOS"
SELF="$PREFIX/uninstall-github-appimage.sh"
rm -rf "$PREFIX/squashfs-root"
rm -f "$PREFIX/SteamToolsCachyOS.AppImage" "$PREFIX/symlink-steam-logo.png" "$APP_DESKTOP" "$BIN_LINK" "$SELF"
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$(dirname "$APP_DESKTOP")" 2>/dev/null || true
fi
echo "Removed extracted AppImage install (squashfs-root, desktop entry, symlink)."
EOS
chmod +x "$UNINSTALL_SCRIPT"
echo "Uninstall later: $UNINSTALL_SCRIPT"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$(dirname "$APP_DESKTOP")" 2>/dev/null || true
fi

echo ""
echo "SteamToolsCachyOS is installed (extracted AppImage; does not require FUSE)."
echo "  Application: $APPRUN"
echo "  Menu: search for SteamToolsCachyOS, or run: $BIN_LINK"
