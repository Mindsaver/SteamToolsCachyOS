#!/usr/bin/env bash
# Run the Makeself .run in a visible terminal (double-clicking the .run on KDE often has no TTY).
# No extra prompts: Konsole uses --hold so the window stays open after install without "Press Enter".
set -euo pipefail

RUN_NAME="SteamToolsCachyOS-Linux-x86_64.run"

# Resolve this script's directory even when Dolphin/KDE launches us with a weird cwd.
_script="${BASH_SOURCE[0]:-$0}"
if command -v readlink >/dev/null 2>&1 && _rp="$(readlink -f "$_script" 2>/dev/null)"; then
  _script="$_rp"
elif command -v realpath >/dev/null 2>&1 && _rp="$(realpath "$_script" 2>/dev/null)"; then
  _script="$_rp"
elif [[ "$_script" != /* ]]; then
  _script="$(pwd)/${_script#./}"
fi
HERE="$(cd "$(dirname "$_script")" && pwd)"
RUN="$HERE/$RUN_NAME"

if [[ ! -f "$RUN" ]]; then
  echo "Missing: $RUN" >&2
  echo "Keep this file next to $RUN_NAME in the same folder." >&2
  exit 1
fi

chmod +x "$RUN" 2>/dev/null || true

# No trailing read/sleep: Konsole --hold keeps the tab open after the child exits.
runner=$(printf 'cd %q && ./%q; exit $?' "$HERE" "$RUN_NAME")

try_term() {
  # KDE / Plasma: prefer Konsole first (works reliably on CachyOS when Path=. is ignored).
  if [[ "${XDG_CURRENT_DESKTOP:-}" == *KDE* ]] || [[ -n "${KDE_FULL_SESSION:-}" ]]; then
    if command -v konsole >/dev/null 2>&1; then
      exec konsole --hold -e bash -c "$runner"
    fi
  fi
  if command -v konsole >/dev/null 2>&1; then
    exec konsole --hold -e bash -c "$runner"
  fi
  if command -v xdg-terminal-exec >/dev/null 2>&1; then
    exec xdg-terminal-exec -- bash -c "$runner"
  fi
  if command -v gnome-terminal >/dev/null 2>&1; then
    exec gnome-terminal -- bash -c "$runner"
  fi
  if command -v xfce4-terminal >/dev/null 2>&1; then
    exec xfce4-terminal -e bash -c "$runner"
  fi
  if command -v kitty >/dev/null 2>&1; then
    exec kitty bash -c "$runner"
  fi
  if command -v alacritty >/dev/null 2>&1; then
    exec alacritty -e bash -c "$runner"
  fi
  if command -v foot >/dev/null 2>&1; then
    exec foot bash -c "$runner"
  fi
  if command -v xterm >/dev/null 2>&1; then
    exec xterm -hold -e bash -c "$runner"
  fi
  return 1
}

if [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  try_term || true
fi

cd "$HERE"
exec "./$RUN_NAME"
