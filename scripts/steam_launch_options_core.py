"""Steam install discovery, game list from app manifests, and localconfig.vdf LaunchOptions I/O."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import vdf

STEAM_CLIENT_ENV = "STEAM_CLIENT"
STEAMGAME_FILTER_ENV = "STEAMGAME_FILTER"


def resolve_steam_install() -> Path | None:
    """Match scripts/steam-game-symlinks.sh: STEAM_CLIENT or libraryfolders.vdf under common candidates."""
    env = os.environ.get(STEAM_CLIENT_ENV, "").strip()
    if env:
        p = Path(env).expanduser()
        if (p / "steamapps" / "libraryfolders.vdf").is_file() or (p / "config" / "config.vdf").is_file():
            return p.resolve()
    candidates = [
        Path.home() / ".local/share/Steam",
        Path.home() / ".steam/steam",
    ]
    for c in candidates:
        lib = c / "steamapps" / "libraryfolders.vdf"
        if lib.is_file():
            return c.resolve()
    return None


def _parse_library_paths(libraryfolders_vdf: Path) -> list[Path]:
    raw = libraryfolders_vdf.read_text(encoding="utf-8", errors="replace")
    data = vdf.loads(raw)
    out: list[Path] = []
    root = data.get("libraryfolders")
    if root is None:
        root = data.get("LibraryFolders")
    if not isinstance(root, dict):
        return out
    skip_keys = {"contentid", "time_next_stats_report", "TimeNextStatsReport"}
    for k, entry in root.items():
        if k in skip_keys:
            continue
        if isinstance(entry, dict):
            path = entry.get("path")
            if path:
                out.append(Path(str(path).replace("\\\\", "\\")).expanduser().resolve())
        elif isinstance(entry, str) and k.isdigit():
            out.append(Path(entry.replace("\\\\", "\\")).expanduser().resolve())
    return sorted(set(out))


def iter_library_roots(steam_install: Path) -> list[Path]:
    libvdf = steam_install / "steamapps" / "libraryfolders.vdf"
    if not libvdf.is_file():
        return []
    paths = _parse_library_paths(libvdf)
    if steam_install.resolve() not in paths:
        paths.insert(0, steam_install.resolve())
    return paths


_acf_re = re.compile(r'^\s*"([^"]+)"\s+"(.*)"\s*$')


def parse_acf_fields(manifest_path: Path) -> dict[str, str]:
    fields: dict[str, str] = {}
    try:
        text = manifest_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return fields
    for line in text.splitlines():
        m = _acf_re.match(line)
        if m:
            fields[m.group(1)] = m.group(2)
    return fields


def skip_heuristic_non_game(name: str) -> bool:
    if os.environ.get(STEAMGAME_FILTER_ENV, "heuristic").strip().lower() == "all":
        return False
    if name.startswith("Steam Linux Runtime"):
        return True
    if name.startswith("Proton "):
        return True
    if name == "Steamworks Common Redistributables":
        return True
    return False


@dataclass(frozen=True)
class InstalledGame:
    appid: int
    name: str
    manifest_path: Path


def iter_installed_games(steam_install: Path, *, filter_heuristic: bool = True) -> list[InstalledGame]:
    seen: set[int] = set()
    games: list[InstalledGame] = []
    for lib in iter_library_roots(steam_install):
        steamapps = lib / "steamapps"
        if not steamapps.is_dir():
            continue
        for manifest in sorted(steamapps.glob("appmanifest_*.acf")):
            stem = manifest.stem
            if not stem.startswith("appmanifest_"):
                continue
            aid_s = stem[len("appmanifest_") :]
            if not aid_s.isdigit():
                continue
            appid = int(aid_s)
            if appid in seen:
                continue
            fields = parse_acf_fields(manifest)
            name = fields.get("name") or ""
            installdir = fields.get("installdir") or ""
            if not name or not installdir:
                continue
            if filter_heuristic and skip_heuristic_non_game(name):
                continue
            common = steamapps / "common" / installdir
            if not common.is_dir():
                continue
            seen.add(appid)
            games.append(InstalledGame(appid=appid, name=name, manifest_path=manifest))
    games.sort(key=lambda g: g.appid)
    return games


def userdata_root(steam_install: Path) -> Path:
    u = steam_install / "userdata"
    if u.is_dir():
        return u
    alt = Path.home() / ".steam/steam/userdata"
    if alt.is_dir():
        return alt.resolve()
    return u


def list_userdata_accounts(steam_install: Path) -> list[str]:
    root = userdata_root(steam_install)
    if not root.is_dir():
        return []
    ids: list[str] = []
    for p in root.iterdir():
        if p.is_dir() and p.name.isdigit() and p.name != "0":
            ids.append(p.name)
    return sorted(ids, key=lambda x: int(x))


def localconfig_path(steam_install: Path, account_id: str) -> Path:
    return userdata_root(steam_install) / account_id / "config" / "localconfig.vdf"


def empty_localconfig_template() -> dict[str, Any]:
    """Minimal tree so LaunchOptions can be written before Steam creates the file."""
    return {"UserLocalConfigStore": {"Software": {"Valve": {"Steam": {"apps": {}}}}}}


def navigate_steam_apps(root: dict[str, Any]) -> dict[str, Any]:
    ulc = root.setdefault("UserLocalConfigStore", {})
    if not isinstance(ulc, dict):
        raise ValueError("Invalid VDF: UserLocalConfigStore")
    sw = ulc.setdefault("Software", {})
    if not isinstance(sw, dict):
        raise ValueError("Invalid VDF: Software")
    valve = sw.setdefault("Valve", {})
    if not isinstance(valve, dict):
        raise ValueError("Invalid VDF: Valve")
    steam = valve.setdefault("Steam", {})
    if not isinstance(steam, dict):
        raise ValueError("Invalid VDF: Steam")
    apps = steam.setdefault("apps", {})
    if not isinstance(apps, dict):
        raise ValueError("Invalid VDF: apps")
    return apps


def load_localconfig(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    data = vdf.loads(text)
    if not isinstance(data, dict):
        raise ValueError("localconfig is not a VDF dict")
    return data


def load_localconfig_or_new(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return empty_localconfig_template()
    return load_localconfig(path)


def get_launch_options(root: dict[str, Any], appid: int) -> str:
    apps = navigate_steam_apps(root)
    entry = apps.get(str(appid))
    if not isinstance(entry, dict):
        return ""
    lo = entry.get("LaunchOptions")
    return str(lo) if lo is not None else ""


def set_launch_options(root: dict[str, Any], appid: int, value: str) -> None:
    apps = navigate_steam_apps(root)
    key = str(appid)
    entry = apps.get(key)
    if not isinstance(entry, dict):
        apps[key] = {}
        entry = apps[key]
    if not isinstance(entry, dict):
        apps[key] = {"LaunchOptions": value}
        return
    if value:
        entry["LaunchOptions"] = value
    else:
        entry.pop("LaunchOptions", None)
        if len(entry) == 0:
            apps.pop(key, None)


def backup_localconfig(path: Path) -> Path:
    ts = time.strftime("%Y%m%d-%H%M%S")
    bak = path.with_name(f"{path.name}.bak.{ts}")
    shutil.copy2(path, bak)
    return bak


def save_localconfig(path: Path, root: dict[str, Any], *, do_backup: bool = True) -> Path | None:
    """Write VDF. Returns backup path if one was created."""
    path.parent.mkdir(parents=True, exist_ok=True)
    backup_path: Path | None = None
    if path.is_file() and do_backup:
        backup_path = backup_localconfig(path)
    text = vdf.dumps(root, pretty=True)
    path.write_text(text, encoding="utf-8")
    return backup_path


def transform_launch_options(
    current: str,
    op: str,
    *,
    set_value: str = "",
    prefix: str = "",
    suffix: str = "",
    find: str = "",
    replace_with: str = "",
) -> str:
    if op == "clear":
        return ""
    if op == "set":
        return set_value
    if op == "prefix":
        return f"{prefix}{current}"
    if op == "suffix":
        return f"{current}{suffix}"
    if op == "replace":
        if not find:
            return current
        return current.replace(find, replace_with)
    return current


def is_steam_process_running() -> bool:
    try:
        r = subprocess.run(
            ["pgrep", "-x", "steam", "-U", str(os.getuid())],
            capture_output=True,
            text=True,
            timeout=3,
        )
        return r.returncode == 0 and bool((r.stdout or "").strip())
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return False


def try_quit_steam(*, wait_s: float = 18.0) -> tuple[bool, str]:
    """
    Try to exit Steam: `steam -shutdown`, wait, then SIGTERM / SIGKILL on the `steam` process.
    Returns (True, message) if no `steam` process remains for this user, else (False, message).
    """
    if not is_steam_process_running():
        return True, "Steam is already closed."

    try:
        subprocess.Popen(
            ["steam", "-shutdown"],
            env=os.environ.copy(),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except FileNotFoundError:
        pass

    deadline = time.monotonic() + wait_s
    while time.monotonic() < deadline:
        time.sleep(0.4)
        if not is_steam_process_running():
            return True, "Steam closed cleanly."

    for sig in ("-TERM", "-9"):
        try:
            subprocess.run(
                ["pkill", sig, "-x", "steam"],
                capture_output=True,
                text=True,
                timeout=10,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            try:
                flag = "-TERM" if sig == "-TERM" else "-9"
                subprocess.run(["killall", flag, "steam"], capture_output=True, timeout=10)
            except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
                pass
        time.sleep(0.8)
        if not is_steam_process_running():
            return True, "Steam was stopped." if sig == "-TERM" else "Steam was force-closed."

    if not is_steam_process_running():
        return True, "Steam closed."
    return (
        False,
        "Steam is still running. Close it from the Steam window or tray, then try again.",
    )


def latest_backup(path: Path) -> Path | None:
    parent = path.parent
    pattern = f"{path.name}.bak.*"
    candidates = sorted(parent.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def restore_from_backup(localconfig: Path, backup: Path) -> None:
    shutil.copy2(backup, localconfig)
