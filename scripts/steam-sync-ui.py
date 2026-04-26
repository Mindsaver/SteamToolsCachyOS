#!/usr/bin/env python3
import os
import sys
from pathlib import Path

from PySide6.QtCore import QProcess, Qt
from PySide6.QtGui import QIcon, QPixmap
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

from fsr_dll_window import open_fsr_dll_window
from launch_options_window import open_launch_options_manager


APP_NAME = "Symlink-Steam"
ICON_FILENAME = "symlink-steam-logo.png"
BACKEND_SCRIPT = Path(__file__).resolve().parent / "steam-game-symlinks.sh"
# Previously used for saved DLL path; remove so nothing is left behind.
_LEGACY_CONFIG = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "steam-game-symlinks-ui.json"


def app_icon_path() -> Path | None:
    override = os.environ.get("SYMLINK_STEAM_ICON", "").strip()
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
        self.setWindowTitle(APP_NAME)
        self.resize(860, 560)
        self.process: QProcess | None = None
        self._launch_options_manager_ref: object | None = None
        self._fsr_dll_window_ref: object | None = None

        root = QWidget(self)
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(10)

        title = QLabel("Symlink-Steam")
        title.setStyleSheet("font-size: 18px; font-weight: 600;")
        layout.addWidget(title)

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
    app.setApplicationName("Symlink-Steam")
    app.setApplicationDisplayName(APP_NAME)
    app.setDesktopFileName("Symlink-Steam")

    icon = build_app_icon()
    if not icon.isNull():
        app.setWindowIcon(icon)

    window = MainWindow()
    if not icon.isNull():
        window.setWindowIcon(icon)
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
