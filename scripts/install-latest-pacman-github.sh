#!/usr/bin/env bash
# Download the latest GitHub release .pacman for SteamToolsCachyOS (Electron) and install with pacman.
# Default on Arch/CachyOS: system package under /opt, same as in-app updater.
# Requires: curl, jq, pacman, sudo (unless already root).
# Usage:
#   curl -fsSL -H "Accept: application/vnd.github.v3.raw" \
#     "https://api.github.com/repos/Mindsaver/SteamToolsCachyOS/contents/scripts/install-latest-pacman-github.sh?ref=main" \
#     | bash
# Forks: set STEAMTOOLS_INSTALL_REPO=owner/repo (same as other install scripts).
set -euo pipefail

DEFAULT_OWNER="Mindsaver"
DEFAULT_REPO="SteamToolsCachyOS"
ASSET_NAME="SteamToolsCachyOS-Linux-x86_64.pacman"

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

for cmd in curl jq pacman; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    echo "Install jq if needed (e.g. pacman -S jq on Arch/CachyOS)." >&2
    echo "This installer requires pacman (Arch / CachyOS). Without it, download the .pacman from the latest GitHub Release and install on a pacman-based system." >&2
    exit 1
  fi
done

if [[ "${EUID:-0}" -ne 0 ]] && ! command -v sudo >/dev/null 2>&1; then
  echo "Need root for pacman -U, but sudo is not installed." >&2
  exit 1
fi

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

RELEASE_TAG="$(jq -r '.tag_name // empty' "$TMPJSON")"
ASSET_URL="$(jq -r --arg name "$ASSET_NAME" '
  (.assets // [])[] | select(.name == $name) | .browser_download_url
' "$TMPJSON" | head -n1)"
rm -f "$TMPJSON"

if [[ -z "$ASSET_URL" ]]; then
  echo "No asset named ${ASSET_NAME} in the latest release." >&2
  echo "The Release Electron workflow must upload this .pacman file." >&2
  exit 1
fi

echo "Release: ${RELEASE_TAG:-unknown}"
echo "Downloading: $ASSET_NAME"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
DL_PATH="$WORKDIR/$ASSET_NAME"

curl -fSL -o "$DL_PATH" "$ASSET_URL"

echo "Installing with pacman (you may be prompted for your sudo password)…"
if [[ "${EUID:-0}" -eq 0 ]]; then
  pacman -U --needed "$DL_PATH"
else
  sudo pacman -U --needed "$DL_PATH"
fi

echo ""
echo "SteamToolsCachyOS is installed (pacman package). Remove later: sudo pacman -Rns steamtoolscachyos"
