"""Check GitHub Releases, download the Linux zip, and re-run install.sh (same as install-latest-github.sh)."""
from __future__ import annotations

import json
import os
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from packaging.version import Version, parse as parse_version

from PySide6.QtCore import QObject, QThread, Qt, Signal, Slot, QTimer
from PySide6.QtWidgets import QApplication, QMessageBox, QProgressDialog, QWidget

# Defaults match https://github.com/Mindsaver/SteamToolsCachyOS
DEFAULT_GITHUB_OWNER = "Mindsaver"
DEFAULT_GITHUB_REPO = "SteamToolsCachyOS"
RELEASE_ASSET_NAME = "SteamToolsCachyOS-Linux-x86_64.zip"
# When True (default), release-looking installs throttle startup GitHub checks (see last_update_check).
# Local/direct builds (0.0.0+dev… or any +dev in RELEASE_VERSION) skip throttling unless
# STEAMTOOLS_AUTO_CHECK_THROTTLE=1. STEAMTOOLS_AUTO_CHECK_THROTTLE=0 turns throttling off for releases too.
_AUTO_UPDATE_CHECK_THROTTLE_ENABLED = True
# Default minimum gap between automatic /releases/latest checks (override with STEAMTOOLS_AUTO_CHECK_INTERVAL_HOURS).
_DEFAULT_AUTO_CHECK_INTERVAL_S = 60 * 60
_MIN_AUTO_CHECK_INTERVAL_S = 5 * 60
_MAX_AUTO_CHECK_INTERVAL_S = 14 * 24 * 60 * 60
CACHE_SUBDIR = "SteamToolsCachyOS"
CACHE_STAMP = "last_update_check"
# Strong refs on the main window until each worker QThread finishes (avoid Python GC mid-run).
_UPDATE_THREADS_ATTR = "_steamtools_update_active_threads"


def _retain_worker_thread(owner: QWidget, thread: QThread) -> None:
    """Keep a Python reference to ``thread`` until it emits ``finished``."""
    bucket: list[QThread] = getattr(owner, _UPDATE_THREADS_ATTR, [])
    if not bucket:
        setattr(owner, _UPDATE_THREADS_ATTR, bucket)
    bucket.append(thread)

    def _on_finished() -> None:
        try:
            bucket.remove(thread)
        except ValueError:
            pass
        thread.deleteLater()

    thread.finished.connect(_on_finished)


class UpdateResultSink(QObject):
    """Lives on the GUI thread. Call ``post()`` from any thread (e.g. ``QThread.run``) to run
    ``consumer`` on the GUI thread — the reliable pattern vs. connecting a worker signal to a Python callable.
    """

    payload = Signal(object)

    def __init__(self, parent: QWidget, consumer: Callable[[object], None]) -> None:
        super().__init__(parent)
        self._consumer = consumer
        self.payload.connect(self._deliver, Qt.ConnectionType.QueuedConnection)

    @Slot(object)
    def _deliver(self, obj: object) -> None:
        self._consumer(obj)

    def post(self, obj: object) -> None:
        self.payload.emit(obj)


def _set_startup_check_status(parent: QWidget, text: str | None) -> None:
    label = getattr(parent, "status_label", None)
    if label is None or text is None:
        return
    setattr(parent, "_steamtools_startup_check_status", True)
    label.setText(text)


def _clear_startup_check_status(parent: QWidget) -> None:
    """Clear the in-flight \"Checking…\" state without clobbering a follow-up status message."""
    if not getattr(parent, "_steamtools_startup_check_status", False):
        return
    setattr(parent, "_steamtools_startup_check_status", False)
    label = getattr(parent, "status_label", None)
    if label is not None and label.text() == "Checking for updates…":
        label.setText("Ready")


def _flash_status(parent: QWidget, text: str, ms: int = 6000) -> None:
    label = getattr(parent, "status_label", None)
    if label is None:
        return
    label.setText(text)
    QTimer.singleShot(ms, lambda: _restore_status_if_idle(parent))


def _restore_status_if_idle(parent: QWidget) -> None:
    if getattr(parent, "_steamtools_startup_check_status", False):
        return
    label = getattr(parent, "status_label", None)
    if label is not None:
        label.setText("Ready")


def _https_ssl_context() -> ssl.SSLContext:
    """PyInstaller onefile often lacks system CA paths; certifi ships Mozilla roots."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


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


def _version_search_roots() -> list[Path]:
    """Ordered unique dirs that may contain RELEASE_VERSION / VERSION (install layout varies)."""
    roots: list[Path] = []
    seen: set[Path] = set()

    def add(p: Path | None) -> None:
        if p is None:
            return
        try:
            r = p.resolve()
        except OSError:
            r = p
        if r in seen:
            return
        seen.add(r)
        roots.append(r)

    add(install_prefix())
    add(bundle_prefix())
    if getattr(sys, "frozen", False):
        xdg = os.environ.get("XDG_DATA_HOME", "").strip()
        if xdg:
            add(Path(xdg) / "SteamToolsCachyOS")
        add(Path.home() / ".local/share/SteamToolsCachyOS")
    return roots


def read_local_version_string() -> str | None:
    for pfx in _version_search_roots():
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


def _auto_update_when_unfrozen() -> bool:
    """Allow startup check while running from source (not PyInstaller) for QA."""
    v = (os.environ.get("STEAMTOOLS_AUTO_UPDATE_WHEN_UNFROZEN") or "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _should_run_startup_release_check() -> bool:
    return bool(getattr(sys, "frozen", False) or _auto_update_when_unfrozen())


def _cache_stamp_path() -> Path:
    home = Path.home()
    base = os.environ.get("XDG_CACHE_HOME", "").strip()
    cache = Path(base) if base else (home / ".cache")
    return cache / CACHE_SUBDIR / CACHE_STAMP


def _local_build_version_skips_release_throttle() -> bool:
    """True for typical ``./build`` trees (``0.0.0+dev.*`` / ``+dev`` in semver) so GitHub is checked every launch."""
    s = read_local_version_string()
    if not s:
        return True
    line = s.strip().splitlines()[0].strip().lower()
    if "+dev" in line:
        return True
    if line.startswith("0.0.0+"):
        return True
    return False


def _autocheck_throttle_active() -> bool:
    """Rate-limit startup GitHub release checks using ~/.cache/.../last_update_check."""
    v = (os.environ.get("STEAMTOOLS_AUTO_CHECK_THROTTLE") or "").strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    if not _AUTO_UPDATE_CHECK_THROTTLE_ENABLED:
        return False
    if _local_build_version_skips_release_throttle():
        return False
    return True


def autocheck_interval_seconds() -> int:
    """Minimum time between automatic startup checks.

    Override with ``STEAMTOOLS_AUTO_CHECK_INTERVAL_HOURS`` (float, e.g. ``0.25`` for 15 minutes).
    Values are clamped so a typo cannot hammer GitHub every few seconds.
    """
    raw = (os.environ.get("STEAMTOOLS_AUTO_CHECK_INTERVAL_HOURS") or "").strip()
    if not raw:
        return _DEFAULT_AUTO_CHECK_INTERVAL_S
    try:
        hours = float(raw)
    except ValueError:
        return _DEFAULT_AUTO_CHECK_INTERVAL_S
    if hours <= 0:
        return _DEFAULT_AUTO_CHECK_INTERVAL_S
    secs = int(hours * 3600.0)
    return max(_MIN_AUTO_CHECK_INTERVAL_S, min(secs, _MAX_AUTO_CHECK_INTERVAL_S))


def should_throttle_autocheck() -> bool:
    """If True, skip the automatic background check — manual 'Check for updates' ignores this."""
    if not _autocheck_throttle_active():
        return False
    if os.environ.get("STEAMTOOLS_FORCE_UPDATE_CHECK", "").strip().lower() in ("1", "true", "yes", "on"):
        return False
    p = _cache_stamp_path()
    if not p.is_file():
        return False
    try:
        t = float(p.read_text(encoding="utf-8", errors="replace").strip())
    except (OSError, ValueError):
        return False
    return (time.time() - t) < autocheck_interval_seconds()


def write_autocheck_timestamp() -> None:
    if not _autocheck_throttle_active():
        return
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
    with urllib.request.urlopen(req, timeout=60, context=_https_ssl_context()) as resp:
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
    with urllib.request.urlopen(req, timeout=300, context=_https_ssl_context()) as resp, dest.open(
        "wb"
    ) as out:
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
    def __init__(
        self,
        parent: QWidget | None = None,
        *,
        result_sink: UpdateResultSink,
    ) -> None:
        super().__init__(parent)
        self._result_sink = result_sink

    def run(self) -> None:  # noqa: D102
        try:
            self._result_sink.post(fetch_latest_release())
        except (OSError, ValueError, urllib.error.URLError, RuntimeError, json.JSONDecodeError) as e:
            self._result_sink.post(e)
        except BaseException as e:
            self._result_sink.post(e)


class DownloadInstallThread(QThread):
    finished_with_result = Signal(object)  # int 0 success, or str error

    def __init__(self, latest: LatestRelease, parent: QWidget | None = None) -> None:
        super().__init__(parent)
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
            # Do not use QProcess from this QThread — Qt objects must run on the main thread.
            try:
                completed = subprocess.run(
                    ["/bin/bash", str(inst)],
                    cwd=str(ddir),
                    capture_output=True,
                    text=True,
                    timeout=600,
                    check=False,
                )
            except subprocess.TimeoutExpired:
                self.finished_with_result.emit("install.sh timed out after 10 minutes.")
                return
            if completed.returncode != 0:
                out = (completed.stdout or "") + (completed.stderr or "")
                self.finished_with_result.emit(
                    f"install.sh failed ({completed.returncode})\n{out}"[:2000]
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


def _restart_application(parent: QWidget) -> None:
    """Start a new instance of this app and exit (loads newly installed binary on disk)."""
    # Resolve the real binary (e.g. ~/.local/bin/SteamToolsCachyOS → …/SteamToolsCachyOS).
    exe_path = Path(sys.executable).expanduser().resolve()
    exe = str(exe_path)
    if not exe_path.is_file():
        QMessageBox.critical(
            parent,
            "Restart failed",
            f"Could not find the application executable:\n{exe}",
        )
        return
    argv = [exe, *list(sys.argv[1:])]
    workdir = str(Path.home())
    app = QApplication.instance()

    def _defer_quit() -> None:
        if app is not None:
            app.quit()

    def _spawn_subprocess() -> bool:
        try:
            kwargs: dict = dict(
                args=argv,
                cwd=workdir,
                executable=exe,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
                env=os.environ.copy(),
            )
            if sys.platform != "win32":
                kwargs["close_fds"] = True
            subprocess.Popen(**kwargs)
            return True
        except OSError:
            return False

    def _spawn_posix_spawnv() -> bool:
        if not hasattr(os, "spawnv") or not hasattr(os, "P_NOWAIT"):
            return False
        try:
            pid = os.spawnv(os.P_NOWAIT, exe, argv)
            return pid > 0
        except OSError:
            return False

    # Avoid QProcess.startDetached: some PySide6 / Qt builds report success without spawning a
    # process, which closes the app and leaves nothing running.

    if not _spawn_subprocess() and not _spawn_posix_spawnv():
        QMessageBox.critical(
            parent,
            "Restart failed",
            "Could not restart automatically. Please start SteamToolsCachyOS from your menu or terminal.",
        )
        return

    # Let the child finish fork/exec before this process tears down Qt / Wayland (otherwise the
    # new instance can fail to show a window or exit immediately on some desktops).
    QTimer.singleShot(500, _defer_quit)


def _finish_download(parent: QWidget, progress: QProgressDialog, x: object) -> None:
    progress.close()
    if x == 0:
        mb = QMessageBox(parent)
        mb.setWindowTitle("Update installed")
        mb.setIcon(QMessageBox.Icon.Information)
        mb.setText("The new version was installed.")
        mb.setInformativeText(
            "Restart now to load the new build, or choose Later to keep this session "
            "(you will still be running the previous build until you quit)."
        )
        restart_btn = mb.addButton("Restart now", QMessageBox.ButtonRole.AcceptRole)
        mb.addButton("Later", QMessageBox.ButtonRole.RejectRole)
        mb.setDefaultButton(restart_btn)
        mb.exec()
        if mb.clickedButton() == restart_btn:
            _restart_application(parent)
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
    t = DownloadInstallThread(latest, parent)
    _retain_worker_thread(parent, t)
    def _slot_dl(x: object) -> None:
        _finish_download(parent, progress, x)

    t.finished_with_result.connect(_slot_dl, Qt.ConnectionType.QueuedConnection)
    t.start()


def _normalize_semver_token(s: str) -> str:
    t = (s or "").strip().splitlines()[0].strip() if s else ""
    if len(t) > 1 and t[0] in "vV":
        t = t[1:]
    return t


def handle_check_thread_result(
    parent: QWidget,
    result: object,
    local_str: str | None,
    *,
    is_auto: bool,
) -> None:
    if is_auto:
        _clear_startup_check_status(parent)
    if not isinstance(result, LatestRelease):
        if not is_auto:
            QMessageBox.warning(
                parent,
                "Update check",
                f"Could not check for updates:\n{result!s}",
            )
        else:
            _flash_status(parent, f"Update check failed: {result!s}"[:160], 9000)
        return
    effective = (local_str or "").strip() or read_local_version_string() or ""
    effective = _normalize_semver_token(effective)
    if not effective:
        if not is_auto:
            QMessageBox.information(
                parent,
                "Update check",
                "Could not read a local version (install from a release or use dist/ with RELEASE_VERSION).",
            )
        else:
            _flash_status(
                parent,
                "No release version next to the app (missing RELEASE_VERSION). Help → Check for updates.",
                10000,
            )
        return
    # Throttle only once we can compare (avoid 24h silence when local version was unreadable).
    if is_auto:
        write_autocheck_timestamp()
    try:
        local_v = parse_version(effective)
        if not isinstance(local_v, Version):
            local_v = parse_version("0")
    except ValueError:
        local_v = parse_version("0")
    if result.version <= local_v:
        if not is_auto:
            QMessageBox.information(
                parent,
                "Up to date",
                f"You are on the latest version ({effective}).",
            )
        else:
            _flash_status(parent, f"Up to date ({effective}).", 5000)
        return
    r = QMessageBox.question(
        parent,
        "Update available",
        f"A newer release is available:\n\n"
        f"  Installed: {effective}\n"
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

    def consumer(result: object) -> None:
        handle_check_thread_result(parent, result, local, is_auto=False)

    sink = UpdateResultSink(parent, consumer)
    t = CheckReleaseThread(parent, result_sink=sink)
    _retain_worker_thread(parent, t)
    t.start()


def maybe_start_automatic_update_check(parent: QWidget) -> None:
    """Startup background check: PyInstaller build, or dev with STEAMTOOLS_AUTO_UPDATE_WHEN_UNFROZEN=1.

    Results are delivered with ``UpdateResultSink`` (signal owned by a main-thread ``QObject``,
    ``post()`` from ``QThread.run``) so handlers always run on the GUI thread.
    """
    if getattr(parent, "_steamtools_startup_autocheck_started", False):
        return
    if not _should_run_startup_release_check():
        return
    if auto_update_disabled():
        return
    if should_throttle_autocheck():
        return
    setattr(parent, "_steamtools_startup_autocheck_started", True)
    local_hint = read_local_version_string()
    _set_startup_check_status(parent, "Checking for updates…")

    def consumer(result: object) -> None:
        handle_check_thread_result(parent, result, local_hint, is_auto=True)

    sink = UpdateResultSink(parent, consumer)
    t = CheckReleaseThread(parent, result_sink=sink)
    _retain_worker_thread(parent, t)
    t.start()