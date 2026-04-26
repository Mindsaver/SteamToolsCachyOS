"""Check GitHub Releases, download the Linux zip, and re-run install.sh (same as install-latest-github.sh)."""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

from packaging.version import Version, parse as parse_version

from PySide6.QtCore import QProcess, QThread, Qt, Signal
from PySide6.QtWidgets import QMessageBox, QProgressDialog, QWidget

# Defaults match https://github.com/Mindsaver/SteamToolsCachyOS
DEFAULT_GITHUB_OWNER = "Mindsaver"
DEFAULT_GITHUB_REPO = "SteamToolsCachyOS"
RELEASE_ASSET_NAME = "SteamToolsCachyOS-Linux-x86_64.zip"
AUTO_CHECK_INTERVAL_S = 24 * 60 * 60
CACHE_SUBDIR = "SteamToolsCachyOS"
CACHE_STAMP = "last_update_check"


@dataclass(frozen=True)
class LatestRelease:
    version: Version
    version_str: str
    tag_name: str
    download_url: str


def get_owner_repo() -> tuple[str, str]:
    ovr = (os.environ.get("STEAMTOOLS_UPDATE_REPO") or os.environ.get("STEAMTOOLS_INSTALL_REPO") or "").strip()
    if ovr and "/" in ovr:
        left, right = ovr.split("/", 1)
        if left and right:
            return left, right
    return DEFAULT_GITHUB_OWNER, DEFAULT_GITHUB_REPO


def _api_url_latest() -> str:
    o, r = get_owner_repo()
    return f"https://api.github.com/repos/{o}/{r}/releases/latest"


def install_prefix() -> Path | None:
    """Directory containing the installed app binary and RELEASE_VERSION (e.g. ~/.local/share/SteamToolsCachyOS)."""
    if getattr(sys, "frozen", False) and sys.executable:
        exe = Path(sys.executable).resolve()
        parent = exe.parent
        if (parent / "install.sh").is_file() and (parent / "SteamToolsCachyOS").is_file():
            return parent
        if exe.name == "SteamToolsCachyOS" and (parent / "RELEASE_VERSION").is_file():
            return parent
    return None


def bundle_prefix() -> Path:
    """Unpacked/development tree next to the script or onefile extract."""
    if getattr(sys, "frozen", False) and sys.executable:
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def read_local_version_string() -> str | None:
    pfx = install_prefix() or bundle_prefix()
    rel = pfx / "RELEASE_VERSION"
    if rel.is_file():
        s = rel.read_text(encoding="utf-8", errors="replace").strip()
        if s:
            return s.splitlines()[0].strip()
    vfile = pfx / "VERSION"
    if vfile.is_file():
        line = vfile.read_text(encoding="utf-8", errors="replace").strip().splitlines()
        if line:
            return line[0].strip()
    return None


def auto_update_disabled() -> bool:
    v = (os.environ.get("STEAMTOOLS_NO_AUTO_UPDATE") or "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _cache_stamp_path() -> Path:
    home = Path.home()
    base = os.environ.get("XDG_CACHE_HOME", "").strip()
    cache = Path(base) if base else (home / ".cache")
    return cache / CACHE_SUBDIR / CACHE_STAMP


def should_throttle_autocheck() -> bool:
    """If True, skip the automatic background check (24h) — manual 'Check for updates' ignores this."""
    p = _cache_stamp_path()
    if not p.is_file():
        return False
    try:
        t = float(p.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return False
    return (time.time() - t) < AUTO_CHECK_INTERVAL_S


def write_autocheck_timestamp() -> None:
    p = _cache_stamp_path()
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(str(time.time()), encoding="utf-8")
    except OSError:
        pass


def _fetch_releases_json() -> dict:
    req = urllib.request.Request(
        _api_url_latest(),
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "SteamToolsCachyOS-updater",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
    return json.loads(body.decode("utf-8"))


def parse_latest_release(data: dict) -> LatestRelease:
    tag = (data.get("tag_name") or "").strip() or "v0"
    ver_str = tag[1:] if tag.startswith("v") else tag
    url: str | None = None
    for a in data.get("assets") or []:
        if a.get("name") == RELEASE_ASSET_NAME:
            url = a.get("browser_download_url")
            break
    if not url:
        raise RuntimeError(f"Release has no asset named {RELEASE_ASSET_NAME!r}.")
    v = parse_version(ver_str)
    if not isinstance(v, Version):
        v = parse_version("0")
    return LatestRelease(version=v, version_str=ver_str, tag_name=tag, download_url=url)


def fetch_latest_release() -> LatestRelease:
    return parse_latest_release(_fetch_releases_json())


def is_update_available() -> bool | None:
    """True if a newer version exists on GitHub, False if not, None if we cannot tell."""
    try:
        local = read_local_version_string()
        if not local:
            return None
        local_v = parse_version(local)
        if not isinstance(local_v, Version):
            local_v = parse_version("0")
        latest = fetch_latest_release()
    except (OSError, ValueError, urllib.error.URLError, RuntimeError, json.JSONDecodeError):
        return None
    return bool(latest.version > local_v)


def _download_to_file(url: str, dest: Path) -> None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "SteamToolsCachyOS-updater"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=300) as resp, dest.open("wb") as out:
        shutil.copyfileobj(resp, out, length=256 * 1024)


def extract_zip_and_find_install(zip_path: Path) -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="stc-up-"))
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(tmp)
    if (tmp / "install.sh").is_file():
        return tmp
    subs = [p for p in tmp.iterdir() if p.is_dir()]
    if len(subs) == 1 and (subs[0] / "install.sh").is_file():
        return subs[0]
    raise FileNotFoundError("install.sh not found in downloaded zip.")


class CheckReleaseThread(QThread):
    finished_with_result = Signal(object)  # LatestRelease or BaseException

    def run(self) -> None:  # noqa: D102
        try:
            self.finished_with_result.emit(fetch_latest_release())
        except (OSError, ValueError, urllib.error.URLError, RuntimeError, json.JSONDecodeError) as e:
            self.finished_with_result.emit(e)


class DownloadInstallThread(QThread):
    finished_with_result = Signal(object)  # int 0 success, or str error

    def __init__(self, latest: LatestRelease) -> None:
        super().__init__()
        self._latest = latest

    def run(self) -> None:  # noqa: D102
        zpath = Path(tempfile.mktemp(suffix=".zip", prefix="stc-get-"))
        ddir: Path | None = None
        try:
            _download_to_file(self._latest.download_url, zpath)
            ddir = extract_zip_and_find_install(zpath)
            inst = ddir / "install.sh"
            if not inst.is_file():
                self.finished_with_result.emit("install.sh missing after extract.")
                return
            for x in ddir.glob("*.sh"):
                try:
                    x.chmod(x.stat().st_mode | 0o111)
                except OSError:
                    pass
            b = ddir / "SteamToolsCachyOS"
            if b.is_file():
                try:
                    b.chmod(b.stat().st_mode | 0o111)
                except OSError:
                    pass
            proc = QProcess()
            proc.setProgram("/bin/bash")
            proc.setArguments([str(inst)])
            proc.setWorkingDirectory(str(ddir))
            proc.start()
            if not proc.waitForFinished(-1):
                self.finished_with_result.emit("install.sh did not complete.")
                return
            if proc.exitCode() != 0:
                out = bytes(proc.readAllStandardOutput()).decode(errors="replace")
                err = bytes(proc.readAllStandardError()).decode(errors="replace")
                self.finished_with_result.emit(
                    f"install.sh failed ({proc.exitCode()})\n{out}\n{err}"[:2000]
                )
                return
            self.finished_with_result.emit(0)
        except (OSError, zipfile.BadZipFile, RuntimeError) as e:
            self.finished_with_result.emit(str(e))
        finally:
            try:
                zpath.unlink()
            except OSError:
                pass
            if ddir is not None and ddir.is_dir() and "stc-up-" in str(ddir):
                try:
                    shutil.rmtree(ddir, ignore_errors=True)
                except OSError:
                    pass


def _finish_download(parent: QWidget, progress: QProgressDialog, x: object) -> None:
    progress.close()
    if x == 0:
        QMessageBox.information(
            parent,
            "Update installed",
            "The new version was installed. Please restart SteamToolsCachyOS.",
        )
    elif isinstance(x, str):
        QMessageBox.critical(
            parent,
            "Update failed",
            f"Update did not complete successfully:\n\n{x}",
        )
    else:
        QMessageBox.critical(parent, "Update failed", "Update did not complete successfully.")


def _start_download_install(parent: QWidget, latest: LatestRelease) -> None:
    progress = QProgressDialog("Downloading and installing…", "", 0, 0, parent)
    progress.setWindowModality(Qt.ApplicationModal)
    progress.setCancelButton(None)
    progress.setMinimumDuration(0)
    progress.show()
    t = DownloadInstallThread(latest)
    t.finished_with_result.connect(lambda x, p=parent, pr=progress: _finish_download(p, pr, x))
    t.start()


def handle_check_thread_result(
    parent: QWidget,
    result: object,
    local_str: str | None,
    *,
    is_auto: bool,
) -> None:
    if not isinstance(result, LatestRelease):
        if not is_auto:
            QMessageBox.warning(
                parent,
                "Update check",
                f"Could not check for updates:\n{result!s}",
            )
        return
    if not local_str:
        if not is_auto:
            QMessageBox.information(
                parent,
                "Update check",
                "Could not read a local version (install from a release or use dist/ with RELEASE_VERSION).",
            )
        return
    try:
        local_v = parse_version(local_str)
        if not isinstance(local_v, Version):
            local_v = parse_version("0")
    except ValueError:
        local_v = parse_version("0")
    if result.version <= local_v:
        if not is_auto:
            QMessageBox.information(
                parent,
                "Up to date",
                f"You are on the latest version ({local_str}).",
            )
        return
    r = QMessageBox.question(
        parent,
        "Update available",
        f"A newer release is available:\n\n"
        f"  Installed: {local_str}\n"
        f"  Latest:    {result.version_str} ({result.tag_name})\n\n"
        f"Download and install now? (You will need to restart the app.)",
        QMessageBox.Yes | QMessageBox.No,
        QMessageBox.Yes,
    )
    if r != QMessageBox.Yes:
        return
    _start_download_install(parent, result)


def start_manual_check_for_updates(parent: QWidget) -> None:
    local = read_local_version_string()
    t = CheckReleaseThread(parent)
    t.finished_with_result.connect(
        lambda r, p=parent, lo=local: handle_check_thread_result(p, r, lo, is_auto=False)
    )
    t.start()


def maybe_start_automatic_update_check(parent: QWidget) -> None:
    """Background check (throttled); only when running installed frozen binary."""
    if not getattr(sys, "frozen", False):
        return
    if install_prefix() is None:
        return
    if auto_update_disabled():
        return
    if should_throttle_autocheck():
        return
    write_autocheck_timestamp()
    local = read_local_version_string()
    t = CheckReleaseThread(parent)
    t.finished_with_result.connect(
        lambda r, p=parent, lo=local: handle_check_thread_result(p, r, lo, is_auto=True)
    )
    t.start()