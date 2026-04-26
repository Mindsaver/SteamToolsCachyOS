#!/usr/bin/env bash
# Download the latest GitHub release zip for SteamToolsCachyOS, extract, and run install.sh.
# See README or: curl -fsSL https://raw.githubusercontent.com/Mindsaver/SteamToolsCachyOS/main/scripts/install-latest-github.sh | bash
set -euo pipefail

DEFAULT_OWNER="Mindsaver"
DEFAULT_REPO="SteamToolsCachyOS"
ASSET_NAME="SteamToolsCachyOS-Linux-x86_64.zip"

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

for cmd in curl python3 unzip; do
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
    sys.exit(1)
print(url)
print(data.get('tag_name', ''))
" "$TMPJSON" "$ASSET_NAME")
echo "Release: $RELEASE_TAG"
echo "Downloading: $ASSET_NAME"

WORKDIR="$(mktemp -d)"
trap 'rm -f "$TMPJSON"; rm -rf "$WORKDIR"' EXIT
ZIP_PATH="$WORKDIR/$ASSET_NAME"
curl -fSL -o "$ZIP_PATH" "$ASSET_URL"
mkdir -p "$WORKDIR/extract"
unzip -q -o "$ZIP_PATH" -d "$WORKDIR/extract"
EXTRACT_DIR="$WORKDIR/extract"
if [[ ! -f "$EXTRACT_DIR/install.sh" ]]; then
  # Single top-level directory in the zip
  mapfile -t _TOP < <(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1)
  if [[ "${#_TOP[@]}" -eq 1 && -d "${_TOP[0]}" && -f "${_TOP[0]}/install.sh" ]]; then
    EXTRACT_DIR="${_TOP[0]}"
  else
    echo "install.sh not found after extract." >&2
    find "$WORKDIR/extract" -maxdepth 3 -type f 2>/dev/null | head -30 >&2
    exit 1
  fi
fi

if [[ -f "$EXTRACT_DIR/SteamToolsCachyOS" ]]; then
  chmod +x "$EXTRACT_DIR/SteamToolsCachyOS" "$EXTRACT_DIR/install.sh" 2>/dev/null || true
  chmod +x "$EXTRACT_DIR"/*.sh 2>/dev/null || true
fi

echo "Running install from: $EXTRACT_DIR"
( cd "$EXTRACT_DIR" && ./install.sh )

echo ""
echo "SteamToolsCachyOS is installed. Open it from your application menu or: SteamToolsCachyOS"
