#!/usr/bin/env bash
# Download the latest GitHub release AppImage for SteamToolsCachyOS (Electron build), install under ~/.local/share.
# Requires: curl, python3. AppImages need libfuse.so.2 (FUSE 2); this script tries to install it via sudo when missing.
# Set STEAMTOOLS_SKIP_FUSE_INSTALL=1 to skip that step (CI / containers).
# Usage: curl -fsSL https://raw.githubusercontent.com/Mindsaver/SteamToolsCachyOS/main/scripts/install-latest-appimage-github.sh | bash
set -euo pipefail

fuse2_present() {
  ldconfig -p 2>/dev/null | grep -qF 'libfuse.so.2' && return 0
  [[ -f /usr/lib/libfuse.so.2 ]] && return 0
  [[ -f /usr/lib64/libfuse.so.2 ]] && return 0
  return 1
}

install_fuse2_if_needed() {
  fuse2_present && return 0
  if [[ "${STEAMTOOLS_SKIP_FUSE_INSTALL:-}" == "1" ]]; then
    echo "Skipping FUSE 2 install (STEAMTOOLS_SKIP_FUSE_INSTALL=1)." >&2
    return 0
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    echo "Note: libfuse.so.2 not found and sudo is unavailable; install FUSE 2 manually to run the AppImage." >&2
    return 0
  fi
  ID=""
  ID_LIKE=""
  if [[ -r /etc/os-release ]]; then
    # shellcheck source=/dev/null
    . /etc/os-release
  fi
  echo "AppImage needs FUSE 2 (libfuse.so.2). Installing package with sudo…"
  set +e
  case "${ID:-}" in
    arch|cachyos|endeavouros|manjaro|garuda)
      sudo pacman -S --needed --noconfirm fuse2
      ;;
    ubuntu|debian|linuxmint|pop|zorin|elementary)
      sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libfuse2
      ;;
    fedora|rhel|centos|rocky|almalinux)
      sudo dnf install -y fuse-libs 2>/dev/null || sudo dnf install -y fuse
      ;;
    opensuse-tumbleweed|opensuse-leap|opensuse)
      sudo zypper install -y libfuse2 2>/dev/null || sudo zypper install -y fuse
      ;;
    alpine)
      sudo apk add --no-cache fuse
      ;;
    void)
      sudo xbps-install -Sy fuse
      ;;
    *)
      if [[ "${ID_LIKE:-}" == *arch* ]]; then
        sudo pacman -S --needed --noconfirm fuse2
      elif [[ "${ID_LIKE:-}" == *debian* ]] || [[ "${ID_LIKE:-}" == *ubuntu* ]]; then
        sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libfuse2
      elif [[ "${ID_LIKE:-}" == *fedora* ]] || [[ "${ID_LIKE:-}" == *rhel* ]]; then
        sudo dnf install -y fuse-libs 2>/dev/null || sudo dnf install -y fuse
      else
        echo "Could not detect your distro for automatic FUSE 2 install (${ID:-unknown}). Install libfuse.so.2 manually." >&2
        set -e
        return 0
      fi
      ;;
  esac
  rc=$?
  set -e
  if [[ "$rc" -eq 0 ]] && fuse2_present; then
    echo "FUSE 2 is installed; the AppImage should run without libfuse.so.2 errors."
    return 0
  fi
  echo "Automatic FUSE install did not succeed (wrong password, unsupported distro, or package rename)." >&2
  echo "Install manually, e.g. Arch/CachyOS: sudo pacman -S fuse2   Debian/Ubuntu: sudo apt install libfuse2" >&2
}

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
APPIMAGE="$PREFIX/SteamToolsCachyOS.AppImage"
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

mkdir -p "$PREFIX"
mkdir -p "$(dirname "$APP_DESKTOP")"
mkdir -p "$(dirname "$BIN_LINK")"

mv -f "$DL_PATH" "$APPIMAGE"
chmod +x "$APPIMAGE"

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
  printf 'TryExec=%s\n' "$APPIMAGE"
  printf 'Exec=%s %%u\n' "$APPIMAGE"
  if [[ -n "$ICON_PATH" ]]; then
    printf 'Icon=%s\n' "$ICON_PATH"
  fi
} >"$APP_DESKTOP"
echo "Wrote: $APP_DESKTOP"

ln -sf "$APPIMAGE" "$BIN_LINK"
echo "Bin link: $BIN_LINK -> $APPIMAGE"

cat >"$UNINSTALL_SCRIPT" <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/SteamToolsCachyOS"
APPIMAGE="$PREFIX/SteamToolsCachyOS.AppImage"
APP_DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/SteamToolsCachyOS.desktop"
BIN_LINK="${HOME}/.local/bin/SteamToolsCachyOS"
SELF="$PREFIX/uninstall-github-appimage.sh"
rm -f "$APPIMAGE" "$PREFIX/symlink-steam-logo.png" "$APP_DESKTOP" "$BIN_LINK" "$SELF"
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$(dirname "$APP_DESKTOP")" 2>/dev/null || true
fi
echo "Removed AppImage install (desktop entry, ~/.local/bin symlink, and AppImage files)."
EOS
chmod +x "$UNINSTALL_SCRIPT"
echo "Uninstall later: $UNINSTALL_SCRIPT"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$(dirname "$APP_DESKTOP")" 2>/dev/null || true
fi

install_fuse2_if_needed

echo ""
echo "SteamToolsCachyOS (AppImage) is installed."
echo "  Application: $APPIMAGE"
echo "  Menu: search for SteamToolsCachyOS, or run: $BIN_LINK"
if ! fuse2_present; then
  echo ""
  echo "If launching fails with \"libfuse.so.2\", install FUSE 2 manually, e.g.:"
  echo "  Arch / CachyOS: sudo pacman -S fuse2"
  echo "  Debian / Ubuntu: sudo apt install libfuse2"
fi
