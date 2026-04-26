#!/usr/bin/env bash
# Create ~/SteamToolsCachyOS/<Game Name>/ with symlinks to install dir, Proton prefix, system32, and userdata.
# Usage: ./steam-game-symlinks.sh [--dry-run]
set -euo pipefail

DRY_RUN=0
AMD_DLL_PATH=""
MODE="all"
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    --amd-dll=*) AMD_DLL_PATH="${arg#*=}" ;;
    --mode=*) MODE="${arg#*=}" ;;
    -h|--help)
      echo "Usage: $0 [--dry-run]"
      echo "Env:"
      echo "  STEAMGAME_ROOT   Hub directory (default: \$HOME/SteamToolsCachyOS)"
      echo "  STEAM_CLIENT     Steam install dir if autodetect fails"
      echo "  STEAMGAME_FILTER heuristic | all — heuristic skips Proton / Steam Linux Runtime / redistributables (default: heuristic)"
      echo "Args:"
      echo "  --amd-dll=/path/to/amdxcffx64.dll  Copy DLL to each detected game system32 path"
      echo "  --mode=all|folders|dll            all=both, folders=links only (ignores --amd-dll), dll=DLL copy only"
      echo "Each game folder also gets \"Start in Steam.desktop\" (opens steam://rungameid/<AppID>)."
      exit 0
      ;;
  esac
done

STEAMGAME_ROOT="${STEAMGAME_ROOT:-$HOME/SteamToolsCachyOS}"
STEAMGAME_FILTER="${STEAMGAME_FILTER:-heuristic}"

steam_client_from_libraryfolders() {
  local vdf="$1"
  [[ -f "$vdf" ]] || return 1
  awk -F'"' '/"path"/ {print $4; exit}' "$vdf"
}

resolve_steam_client() {
  if [[ -n "${STEAM_CLIENT:-}" ]]; then
    realpath -m "$STEAM_CLIENT"
    return
  fi
  local candidates=(
    "$HOME/.local/share/Steam"
    "$HOME/.steam/steam"
  )
  local libvdf=""
  for c in "${candidates[@]}"; do
    if [[ -f "$c/steamapps/libraryfolders.vdf" ]]; then
      libvdf="$c/steamapps/libraryfolders.vdf"
      steam_client_from_libraryfolders "$libvdf" && return
    fi
  done
  for c in "${candidates[@]}"; do
    libvdf="$c/steamapps/libraryfolders.vdf"
    if [[ -f "$libvdf" ]]; then
      steam_client_from_libraryfolders "$libvdf" && return
    fi
  done
  echo "Could not find Steam installation (libraryfolders.vdf)." >&2
  return 1
}

collect_library_paths() {
  local vdf="$1"
  [[ -f "$vdf" ]] || return 1
  awk -F'"' '/"path"/ {print $4}' "$vdf" | while read -r p; do
    [[ -n "$p" ]] || continue
    realpath -m "$p"
  done | sort -u
}

acf_field() {
  local file="$1" key="$2"
  grep -m1 -E "^[[:space:]]*\"${key}\"[[:space:]]+" "$file" 2>/dev/null \
    | sed -n "s/^[[:space:]]*\"${key}\"[[:space:]]*\"\([^\"]*\)\".*/\1/p"
}

sanitize_dirname() {
  local s="$1"
  s="${s//\//-}"
  s="${s//\\/-}"
  s="${s//:/-}"
  s="${s//\*/-}"
  s="${s//\"/-}"
  s="${s//\?/-}"
  s="${s//</-}"
  s="${s//>/-}"
  s="${s//|/-}"
  s="${s##[[:space:]]}"
  s="${s%%[[:space:]]}"
  printf '%s' "$s"
}

# Desktop launcher: double-click / open from file manager to start the game in Steam.
write_start_in_steam_desktop() {
  local out="$1"
  local appid="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] would write %q\n' "$out"
    return
  fi
  cat >"$out" <<DESK
[Desktop Entry]
Type=Application
Version=1.0
Name=Start in Steam
Comment=Launch this library game in the Steam client (AppID ${appid}).
Exec=steam steam://rungameid/${appid}
TryExec=steam
Icon=steam
Terminal=false
Categories=Game;
Keywords=Steam;Game;SteamToolsCachyOS;
DESK
  chmod +x "$out"
}

skip_heuristic_non_game() {
  local name="$1"
  [[ "$STEAMGAME_FILTER" == "all" ]] && return 1
  case "$name" in
    "Steam Linux Runtime"*) return 0 ;;
    "Proton "*) return 0 ;;
    "Steamworks Common Redistributables") return 0 ;;
  esac
  return 1
}

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run]'; printf ' %q' "$@"; echo
  else
    "$@"
  fi
}

STEAM_INSTALL="$(resolve_steam_client)" || exit 1
LIBVDF="$STEAM_INSTALL/steamapps/libraryfolders.vdf"
mapfile -t LIBRARIES < <(collect_library_paths "$LIBVDF" || true)
if [[ ${#LIBRARIES[@]} -eq 0 ]]; then
  echo "No Steam library paths in $LIBVDF" >&2
  exit 1
fi

if [[ "$MODE" == "folders" ]]; then
  # Folder-only run never copies the DLL; ignore any --amd-dll so bad paths do not fail the run.
  AMD_DLL_PATH=""
fi

if [[ -n "$AMD_DLL_PATH" ]]; then
  AMD_DLL_PATH="$(realpath -m "$AMD_DLL_PATH")"
  if [[ ! -f "$AMD_DLL_PATH" ]]; then
    echo "AMD DLL not found: $AMD_DLL_PATH" >&2
    exit 1
  fi
fi

if [[ "$MODE" != "all" && "$MODE" != "folders" && "$MODE" != "dll" ]]; then
  echo "Invalid mode: $MODE (expected all|folders|dll)" >&2
  exit 1
fi
if [[ "$MODE" == "dll" && -z "$AMD_DLL_PATH" ]]; then
  echo "--mode=dll requires --amd-dll=/path/to/amdxcffx64.dll" >&2
  exit 1
fi

USERDATA_ROOT="$STEAM_INSTALL/userdata"
if [[ ! -d "$USERDATA_ROOT" ]]; then
  if [[ -d "$HOME/.steam/steam/userdata" ]]; then
    USERDATA_ROOT="$(realpath "$HOME/.steam/steam/userdata")"
  fi
fi

jobs=()
for lib in "${LIBRARIES[@]}"; do
  steamapps="$lib/steamapps"
  [[ -d "$steamapps" ]] || continue
  shopt -s nullglob
  for manifest in "$steamapps"/appmanifest_*.acf; do
    base="${manifest##*/}"
    appid="${base#appmanifest_}"
    appid="${appid%.acf}"
    [[ "$appid" =~ ^[0-9]+$ ]] || continue
    jobs+=("${appid}|${lib}|${manifest}")
  done
  shopt -u nullglob
done

mapfile -t jobs < <(printf '%s\n' "${jobs[@]}" | sort -t'|' -k1,1n)

declare -A SEEN_APPIDS
declare -A TARGET_NAMES_COUNT

run mkdir -p "$STEAMGAME_ROOT"

for job in "${jobs[@]}"; do
  IFS='|' read -r appid lib manifest <<<"$job"
  [[ -n "${SEEN_APPIDS[$appid]:-}" ]] && continue

  name="$(acf_field "$manifest" "name")"
  installdir="$(acf_field "$manifest" "installdir")"
  [[ -n "$name" ]] || continue
  [[ -n "$installdir" ]] || continue

  if skip_heuristic_non_game "$name"; then
    continue
  fi

  steamapps="$lib/steamapps"
  common_path="$steamapps/common/$installdir"
  if [[ ! -d "$common_path" ]]; then
    continue
  fi

  SEEN_APPIDS[$appid]=1

  safe="$(sanitize_dirname "$name")"
  if [[ -z "$safe" ]]; then
    safe="app-$appid"
  fi
  if [[ "${TARGET_NAMES_COUNT[$safe]:-0}" -gt 0 ]]; then
    safe="${safe} (${appid})"
  fi
  TARGET_NAMES_COUNT[$safe]=$((${TARGET_NAMES_COUNT[$safe]:-0} + 1))

  game_dir="$STEAMGAME_ROOT/$safe"
  common_link="$game_dir/common"
  sys32_link="$game_dir/compatdata_windows_system32"
  prefix_link="$game_dir/compatdata_prefix"

  compat_root=""
  for lib2 in "${LIBRARIES[@]}"; do
    r="$lib2/steamapps/compatdata/$appid"
    if [[ -d "$r" ]]; then
      compat_root="$(realpath -m "$r")"
      break
    fi
  done

  compat_sys32=""
  if [[ -n "$compat_root" && -d "$compat_root/pfx/drive_c/windows/system32" ]]; then
    compat_sys32="$(realpath -m "$compat_root/pfx/drive_c/windows/system32")"
  fi

  if [[ "$MODE" != "dll" ]]; then
    run mkdir -p "$game_dir"
    common_abs="$(realpath -m "$common_path")"
    run ln -sfn "$common_abs" "$common_link"

    if [[ -n "$compat_root" ]]; then
      run ln -sfn "$compat_root" "$prefix_link"
    else
      if [[ -e "$prefix_link" || -L "$prefix_link" ]]; then
        run rm -f "$prefix_link"
      fi
    fi

    if [[ -n "$compat_sys32" ]]; then
      run ln -sfn "$compat_sys32" "$sys32_link"
    else
      if [[ -e "$sys32_link" || -L "$sys32_link" ]]; then
        run rm -f "$sys32_link"
      fi
    fi

    write_start_in_steam_desktop "$game_dir/Start in Steam.desktop" "$appid"
  fi

  if [[ "$MODE" != "folders" && -n "$AMD_DLL_PATH" && -n "$compat_sys32" ]]; then
    run cp -f "$AMD_DLL_PATH" "$compat_sys32/amdxcffx64.dll"
  fi

  if [[ "$MODE" != "dll" && -d "$USERDATA_ROOT" ]]; then
    shopt -s nullglob
    ud_paths=()
    for ud in "$USERDATA_ROOT"/*/"$appid"; do
      if [[ -d "$ud" ]]; then
        ud_paths+=("$(realpath -m "$ud")")
      fi
    done
    shopt -u nullglob
    n="${#ud_paths[@]}"
    if [[ "$n" -eq 1 ]]; then
      run ln -sfn "${ud_paths[0]}" "$game_dir/userdata"
      for f in "$game_dir"/userdata_*; do
        [[ -e "$f" ]] || continue
        run rm -f "$f"
      done 2>/dev/null || true
    elif [[ "$n" -gt 1 ]]; then
      if [[ -L "$game_dir/userdata" || -e "$game_dir/userdata" ]]; then
        run rm -rf "$game_dir/userdata"
      fi
      for p in "${ud_paths[@]}"; do
        id="$(basename "$(dirname "$p")")"
        run ln -sfn "$p" "$game_dir/userdata_${id}"
      done
    else
      if [[ -L "$game_dir/userdata" || -e "$game_dir/userdata" ]]; then
        run rm -f "$game_dir/userdata"
      fi
      for f in "$game_dir"/userdata_*; do
        [[ -e "$f" ]] || continue
        run rm -f "$f"
      done 2>/dev/null || true
    fi
  fi
done

echo "Steam symlink hub: $STEAMGAME_ROOT (mode=$MODE, filter=$STEAMGAME_FILTER, libraries: ${#LIBRARIES[@]})"
