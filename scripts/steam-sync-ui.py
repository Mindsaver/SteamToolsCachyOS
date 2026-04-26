#!/usr/bin/env python3
import os
import sys
from pathlib import Path

from PySide6.QtCore import QProcess, Qt, QTimer
from PySide6.QtGui import QIcon, QPixmap, QShowEvent
from PySide6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

import steamtools_update
from fsr_dll_window import open_fsr_dll_window
from launch_options_window import open_launch_options_manager


APP_NAME = "SteamToolsCachyOS"
ICON_FILENAME = "symlink-steam-logo.png"
BACKEND_SCRIPT = Path(__file__).resolve().parent / "steam-game-symlinks.sh"
# Previously used for saved DLL path; remove so nothing is left behind.
_LEGACY_CONFIG = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "steam-game-symlinks-ui.json"


def app_icon_path() -> Path | None:
    override = (
        os.environ.get("STEAMTOOLS_CACHYOS_ICON", "").strip()
        or os.environ.get("SYMLINK_STEAM_ICON", "").strip()
    )
    if override:
        p = Path(override).expanduser()
        if p.is_file():
            return p

    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", ""))
        candidate = base / ICON_FILENAME
        return candidate if candidate.is_file() else None

    here = Path(__file__).resolve().parent
    for candidate in (
        here.parent / "assets" / ICON_FILENAME,
        here / ICON_FILENAME,
        here.parent / ICON_FILENAME,
    ):
        if candidate.is_file():
            return candidate
    return None


def build_app_icon() -> QIcon:
    """Load PNG into QIcon with common sizes (helps X11 / some compositors)."""
    path = app_icon_path()
    if path is None:
        return QIcon()
    resolved = path.resolve()
    base = QPixmap(str(resolved))
    if base.isNull():
        return QIcon()
    icon = QIcon()
    for size in (16, 24, 32, 48, 64, 128, 256, 512):
        if base.width() >= size:
            scaled = base.scaled(
                size,
                size,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
            icon.addPixmap(scaled)
    if icon.isNull():
        icon.addPixmap(base)
    return icon


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self._release_version = steamtools_update.read_local_version_string()
        if self._release_version:
            self.setWindowTitle(f"{APP_NAME} — {self._release_version}")
        else:
            self.setWindowTitle(APP_NAME)
        self.resize(860, 560)
        self.process: QProcess | None = None
        self._launch_options_manager_ref: object | None = None
        self._fsr_dll_window_ref: object | None = None

        menu_bar = self.menuBar()
        help_menu = menu_bar.addMenu("Help")
        help_menu.addAction("Check for updates…", self._check_for_updates)
        help_menu.addAction("About SteamToolsCachyOS", self._show_about)

        root = QWidget(self)
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(10)

        title = QLabel("SteamToolsCachyOS")
        title.setStyleSheet("font-size: 18px; font-weight: 600;")
        layout.addWidget(title)

        if self._release_version:
            ver_lbl = QLabel(f"Version {self._release_version}")
        else:
            ver_lbl = QLabel("Version — development (not a release install)")
        ver_lbl.setStyleSheet("color: #888; font-size: 12px;")
        layout.addWidget(ver_lbl)

        desc = QLabel(
            "Create per-game folders (symlinks + a \"Start in Steam\" shortcut in each). "
            "Use “Update FSR DLL…” when you want to copy amdxcffx64.dll into those prefixes."
        )
        desc.setStyleSheet("color: #b8b8b8;")
        desc.setWordWrap(True)
        layout.addWidget(desc)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        self.create_btn = QPushButton("Create Symlink Game Folders")
        self.create_btn.clicked.connect(self.start_create_folders)
        self.create_btn.setDefault(True)
        actions.addWidget(self.create_btn)

        self.fsr_dll_btn = QPushButton("Update FSR DLL…")
        self.fsr_dll_btn.setToolTip("Drop in DLL, check detected versions, and run the copy into game prefixes")
        self.fsr_dll_btn.clicked.connect(self._open_fsr_dll_window)
        actions.addWidget(self.fsr_dll_btn)

        self.launch_opts_btn = QPushButton("Game launch options…")
        self.launch_opts_btn.setToolTip("Optional extra commands Steam runs before a game starts")
        self.launch_opts_btn.clicked.connect(self._open_launch_options)
        actions.addWidget(self.launch_opts_btn)

        actions.addStretch(1)

        self.status_label = QLabel("Ready")
        self.status_label.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        actions.addWidget(self.status_label)
        layout.addLayout(actions)

        self.log = QTextEdit()
        self.log.setReadOnly(True)
        layout.addWidget(self.log, stretch=1)

        try:
            _LEGACY_CONFIG.unlink(missing_ok=True)
        except OSError:
            pass
        self.validate_backend()

    def showEvent(self, event: QShowEvent) -> None:
        """Schedule the automatic update check after the window is actually shown (GUI thread, compositor ready)."""
        super().showEvent(event)
        if getattr(self, "_steamtools_startup_update_scheduled", False):
            return
        self._steamtools_startup_update_scheduled = True
        # One shot shortly after first paint so the event loop is running before we spawn threads / dialogs.
        QTimer.singleShot(150, self._deferred_automatic_update_check)

    def _deferred_automatic_update_check(self) -> None:
        steamtools_update.maybe_start_automatic_update_check(self)

    def _check_for_updates(self) -> None:
        steamtools_update.start_manual_check_for_updates(self)

    def _show_about(self) -> None:
        ver = steamtools_update.read_local_version_string() or "(unknown)"
        pfx = steamtools_update.install_prefix() or steamtools_update.bundle_prefix()
        build_extra = ""
        vfile = pfx / "VERSION"
        if vfile.is_file():
            raw = vfile.read_text(encoding="utf-8", errors="replace").strip()
            lines = [ln for ln in raw.splitlines() if ln.strip()]
            if len(lines) > 1:
                build_extra = "\n" + "\n".join(lines[1 : min(3, len(lines))])
        QMessageBox.about(
            self,
            f"About {APP_NAME}",
            f"{APP_NAME}\n\nVersion: {ver}{build_extra}\n\n"
            "https://github.com/Mindsaver/SteamToolsCachyOS",
        )

    def validate_backend(self) -> None:
        if not BACKEND_SCRIPT.exists():
            QMessageBox.critical(self, APP_NAME, f"Backend script not found:\n{BACKEND_SCRIPT}")
            self.create_btn.setEnabled(False)
            self.fsr_dll_btn.setEnabled(False)
        elif not os.access(BACKEND_SCRIPT, os.X_OK):
            QMessageBox.critical(self, APP_NAME, f"Backend script is not executable:\n{BACKEND_SCRIPT}")
            self.create_btn.setEnabled(False)
            self.fsr_dll_btn.setEnabled(False)

    def _open_launch_options(self) -> None:
        open_launch_options_manager(self, APP_NAME)

    def _open_fsr_dll_window(self) -> None:
        open_fsr_dll_window(self, APP_NAME, BACKEND_SCRIPT)

    def append_log(self, text: str) -> None:
        text = text.rstrip()
        if text:
            self.log.append(text)

    def start_create_folders(self) -> None:
        self.start_process()

    def start_process(self) -> None:
        if self.process is not None:
            QMessageBox.information(self, APP_NAME, "Another task is already running.")
            return

        self.process = QProcess(self)
        self.process.setProgram(str(BACKEND_SCRIPT))
        self.process.setArguments(["--mode=folders"])
        self.process.readyReadStandardOutput.connect(self.read_stdout)
        self.process.readyReadStandardError.connect(self.read_stderr)
        self.process.finished.connect(self.on_finished)
        self.process.errorOccurred.connect(self.on_error)

        self.create_btn.setEnabled(False)
        self.fsr_dll_btn.setEnabled(False)
        self.launch_opts_btn.setEnabled(False)
        self.status_label.setText("Running: folders")
        self.append_log("")
        self.append_log("=== Starting: Create Symlink Game Folders ===")
        self.append_log("(Each game folder gets Start in Steam.desktop — open it to launch that title in Steam.)")

        self.process.start()

    def read_stdout(self) -> None:
        if self.process is None:
            return
        data = bytes(self.process.readAllStandardOutput()).decode(errors="replace")
        self.append_log(data)

    def read_stderr(self) -> None:
        if self.process is None:
            return
        data = bytes(self.process.readAllStandardError()).decode(errors="replace")
        self.append_log(data)

    def on_finished(self, exit_code: int, _status: QProcess.ExitStatus) -> None:
        success = exit_code == 0
        self.append_log(f"=== Finished with exit code {exit_code} ===")
        self.status_label.setText("Done" if success else "Failed")
        self.create_btn.setEnabled(True)
        self.fsr_dll_btn.setEnabled(True)
        self.launch_opts_btn.setEnabled(True)
        self.process = None
        if not success:
            QMessageBox.warning(self, APP_NAME, f"Task failed (exit code {exit_code}). Check the log.")

    def on_error(self, _error: QProcess.ProcessError) -> None:
        self.append_log("=== Failed to start backend process ===")
        self.status_label.setText("Error")
        self.create_btn.setEnabled(True)
        self.fsr_dll_btn.setEnabled(True)
        self.launch_opts_btn.setEnabled(True)
        self.process = None
        QMessageBox.critical(self, APP_NAME, "Could not start backend script.")


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("SteamToolsCachyOS")
    app.setApplicationDisplayName(APP_NAME)
    app.setDesktopFileName("SteamToolsCachyOS")
    _ver = steamtools_update.read_local_version_string()
    if _ver:
        app.setApplicationVersion(_ver)

    icon = build_app_icon()
    if not icon.isNull():
        app.setWindowIcon(icon)

    window = MainWindow()
    if not icon.isNull():
        window.setWindowIcon(icon)
    window.show()
    # Backup if the first showEvent path never schedules the check (some compositors / focus edge cases).
    QTimer.singleShot(2500, window._deferred_automatic_update_check)
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
