#!/usr/bin/env python3
import os
import sys
from pathlib import Path

from PySide6.QtCore import QProcess, Qt, QTimer, Signal
from PySide6.QtGui import QDragEnterEvent, QDragLeaveEvent, QDropEvent, QIcon, QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QFileDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from dll_ffx_versions import analyze_dll
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


class DllDropZone(QLabel):
    """Accepts drag-and-drop of a DLL file (or any file); first path wins."""

    pathDropped = Signal(str)

    def __init__(self) -> None:
        super().__init__()
        self.setAcceptDrops(True)
        self.setAlignment(Qt.AlignCenter)
        self.setWordWrap(True)
        self.setMinimumHeight(88)
        self._rest_is_success = False
        self._style_normal = (
            "QLabel { border: 2px dashed #555; border-radius: 8px; padding: 14px; "
            "background-color: rgba(80, 80, 80, 0.15); color: #ccc; }"
        )
        self._style_active = (
            "QLabel { border: 2px dashed #4a9eff; border-radius: 8px; padding: 14px; "
            "background-color: rgba(74, 158, 255, 0.12); color: #e0e0e0; }"
        )
        self._style_success = (
            "QLabel { border: 2px dashed #43a047; border-radius: 8px; padding: 14px; "
            "background-color: rgba(67, 160, 71, 0.22); color: #c8e6c9; }"
        )
        self._apply_rest_style()
        self.setText("Drop amdxcffx64.dll here\n(or type the path / use Browse)")

    def mark_drop_success(self) -> None:
        """Green highlight only after a successful drag-and-drop."""
        self._rest_is_success = True
        self.setStyleSheet(self._style_success)

    def clear_drop_success(self) -> None:
        """Reset to neutral (e.g. after Browse or typing)."""
        self._rest_is_success = False
        self._apply_rest_style()

    def _apply_rest_style(self) -> None:
        self.setStyleSheet(self._style_success if self._rest_is_success else self._style_normal)

    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            self.setStyleSheet(self._style_active)
        else:
            event.ignore()

    def dragMoveEvent(self, event: QDragEnterEvent) -> None:
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragLeaveEvent(self, event: QDragLeaveEvent) -> None:
        self._apply_rest_style()

    def dropEvent(self, event: QDropEvent) -> None:
        urls = event.mimeData().urls()
        if not urls:
            event.ignore()
            self._apply_rest_style()
            return
        path = urls[0].toLocalFile()
        if not path:
            event.ignore()
            self._apply_rest_style()
            return
        p = Path(path)
        if not p.is_file():
            QMessageBox.warning(None, APP_NAME, f"Not a file:\n{path}")
            event.ignore()
            self._apply_rest_style()
            return
        self.pathDropped.emit(str(p.resolve()))
        event.acceptProposedAction()


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.resize(860, 560)
        self.process: QProcess | None = None
        self._launch_options_manager_ref: object | None = None

        root = QWidget(self)
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(10)

        title = QLabel("Symlink-Steam")
        title.setStyleSheet("font-size: 18px; font-weight: 600;")
        layout.addWidget(title)

        desc = QLabel("Run tasks separately: create game folders/links, then update FSR DLL when needed.")
        desc.setStyleSheet("color: #b8b8b8;")
        layout.addWidget(desc)

        self.drop_zone = DllDropZone()
        self.drop_zone.pathDropped.connect(self.on_dll_dropped)
        layout.addWidget(self.drop_zone)

        row = QHBoxLayout()
        row.setSpacing(8)
        self.dll_input = QLineEdit()
        self.dll_input.setPlaceholderText("/path/to/amdxcffx64.dll (optional)")
        self.dll_input.textChanged.connect(self._on_dll_path_edited)
        row.addWidget(self.dll_input, stretch=1)

        self.browse_btn = QPushButton("Browse...")
        self.browse_btn.clicked.connect(self.choose_dll)
        row.addWidget(self.browse_btn)
        layout.addLayout(row)

        ffx_box = QGroupBox("Detected FFX versions (heuristic)")
        ffx_layout = QVBoxLayout()
        self._lbl_framegen = QLabel("Frame Generation (MFG): —")
        self._lbl_ml = QLabel("ML / MLFI: —")
        self._lbl_fsr = QLabel("FSR: —")
        self._lbl_generation = QLabel("Estimated generation: —")
        self._lbl_generation.setWordWrap(True)
        ffx_layout.addWidget(self._lbl_framegen)
        ffx_layout.addWidget(self._lbl_ml)
        ffx_layout.addWidget(self._lbl_fsr)
        ffx_layout.addWidget(self._lbl_generation)
        ffx_hint = QLabel(
            "Parsed from symbol context in the DLL (same logic as sniff-dll-version.py). "
            "Not the same as Windows FileVersion."
        )
        ffx_hint.setStyleSheet("color: #888; font-size: 11px;")
        ffx_hint.setWordWrap(True)
        ffx_layout.addWidget(ffx_hint)
        ffx_box.setLayout(ffx_layout)
        layout.addWidget(ffx_box)

        self._dll_version_timer = QTimer(self)
        self._dll_version_timer.setSingleShot(True)
        self._dll_version_timer.setInterval(400)
        self._dll_version_timer.timeout.connect(self._refresh_ffx_versions)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        self.create_btn = QPushButton("Create Symlink Game Folders")
        self.create_btn.clicked.connect(self.start_create_folders)
        self.create_btn.setDefault(True)
        actions.addWidget(self.create_btn)

        self.update_btn = QPushButton("Update FSR DLL")
        self.update_btn.clicked.connect(self.start_update_dll)
        actions.addWidget(self.update_btn)

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
        self._set_ffx_version_placeholders()

    def _set_ffx_version_placeholders(self) -> None:
        self._lbl_framegen.setText("Frame Generation (MFG): —")
        self._lbl_ml.setText("ML / MLFI: —")
        self._lbl_fsr.setText("FSR: —")
        self._lbl_generation.setText("Estimated generation: —")
        self._lbl_generation.setToolTip("")

    def _refresh_ffx_versions(self) -> None:
        raw = self.dll_input.text().strip()
        p = Path(raw).expanduser()
        if not raw or not p.is_file():
            self._set_ffx_version_placeholders()
            return
        try:
            r = analyze_dll(p)
        except Exception as e:
            self._lbl_framegen.setText(f"Frame Generation (MFG): (error: {e})")
            self._lbl_ml.setText("ML / MLFI: —")
            self._lbl_fsr.setText("FSR: —")
            self._lbl_generation.setText("Estimated generation: —")
            self._lbl_generation.setToolTip("")
            return
        if r.get("_error"):
            err = r["_error"]
            self._lbl_framegen.setText(f"Frame Generation (MFG): (read error: {err})")
            self._lbl_ml.setText("ML / MLFI: —")
            self._lbl_fsr.setText("FSR: —")
            self._lbl_generation.setText("Estimated generation: —")
            self._lbl_generation.setToolTip("")
            return
        self._lbl_framegen.setText(f"Frame Generation (MFG): {r.get('framegen') or '—'}")
        self._lbl_ml.setText(f"ML / MLFI: {r.get('ml') or '—'}")
        self._lbl_fsr.setText(f"FSR: {r.get('fsr') or '—'}")
        gen = r.get("generation")
        if gen:
            nums = (r.get("generation_numbers") or "").strip()
            self._lbl_generation.setText(
                f"Estimated generation: {gen} — {nums}" if nums else f"Estimated generation: {gen}"
            )
            detail = r.get("generation_detail") or ""
            if nums:
                detail = f"{detail}\n\nStack numbers: {nums}" if detail else f"Stack numbers: {nums}"
            self._lbl_generation.setToolTip(detail)
        else:
            self._lbl_generation.setText("Estimated generation: unknown")
            self._lbl_generation.setToolTip(
                "Could not infer 3.x vs 4.x from binary markers (see sniff-dll-version.py logic)."
            )

    def _on_dll_path_edited(self, _text: str) -> None:
        self.drop_zone.clear_drop_success()
        self._dll_version_timer.start()

    def on_dll_dropped(self, path: str) -> None:
        self.dll_input.blockSignals(True)
        self.dll_input.setText(path)
        self.dll_input.blockSignals(False)
        self.drop_zone.mark_drop_success()
        self._dll_version_timer.stop()
        self._refresh_ffx_versions()

    def validate_backend(self) -> None:
        if not BACKEND_SCRIPT.exists():
            QMessageBox.critical(self, APP_NAME, f"Backend script not found:\n{BACKEND_SCRIPT}")
            self.create_btn.setEnabled(False)
            self.update_btn.setEnabled(False)
            self.drop_zone.setEnabled(False)
        elif not os.access(BACKEND_SCRIPT, os.X_OK):
            QMessageBox.critical(self, APP_NAME, f"Backend script is not executable:\n{BACKEND_SCRIPT}")
            self.create_btn.setEnabled(False)
            self.update_btn.setEnabled(False)
            self.drop_zone.setEnabled(False)

    def _open_launch_options(self) -> None:
        open_launch_options_manager(self, APP_NAME)

    def choose_dll(self) -> None:
        start_dir = str(Path(self.dll_input.text()).expanduser().parent) if self.dll_input.text().strip() else str(Path.home())
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Select amdxcffx64.dll",
            start_dir,
            "DLL Files (*.dll);;All Files (*)",
        )
        if file_path:
            self.dll_input.blockSignals(True)
            self.dll_input.setText(file_path)
            self.dll_input.blockSignals(False)
            self.drop_zone.clear_drop_success()
            self._dll_version_timer.stop()
            self._refresh_ffx_versions()

    def append_log(self, text: str) -> None:
        text = text.rstrip()
        if text:
            self.log.append(text)

    def start_create_folders(self) -> None:
        self.start_process(mode="folders", require_dll=False)

    def start_update_dll(self) -> None:
        self.start_process(mode="dll", require_dll=True)

    def start_process(self, mode: str, require_dll: bool) -> None:
        dll_path = self.dll_input.text().strip()
        if require_dll:
            if not dll_path:
                QMessageBox.warning(self, APP_NAME, "Select amdxcffx64.dll first.")
                return
            if not Path(dll_path).expanduser().is_file():
                QMessageBox.warning(self, APP_NAME, f"DLL not found:\n{dll_path}")
                return

        if self.process is not None:
            QMessageBox.information(self, APP_NAME, "Another task is already running.")
            return

        self.process = QProcess(self)
        self.process.setProgram(str(BACKEND_SCRIPT))
        args = [f"--mode={mode}"]
        if mode == "dll" and dll_path:
            args.append(f"--amd-dll={dll_path}")
        self.process.setArguments(args)
        self.process.readyReadStandardOutput.connect(self.read_stdout)
        self.process.readyReadStandardError.connect(self.read_stderr)
        self.process.finished.connect(self.on_finished)
        self.process.errorOccurred.connect(self.on_error)

        self.create_btn.setEnabled(False)
        self.update_btn.setEnabled(False)
        self.browse_btn.setEnabled(False)
        self.drop_zone.setEnabled(False)
        self._dll_version_timer.stop()
        self.status_label.setText(f"Running: {mode}")
        self.append_log("")
        if mode == "folders":
            self.append_log("=== Starting: Create Symlink Game Folders ===")
        else:
            self.append_log("=== Starting: Update FSR DLL ===")

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
        self.update_btn.setEnabled(True)
        self.browse_btn.setEnabled(True)
        self.drop_zone.setEnabled(True)
        self.process = None
        self._refresh_ffx_versions()
        if not success:
            QMessageBox.warning(self, APP_NAME, f"Task failed (exit code {exit_code}). Check the log.")

    def on_error(self, _error: QProcess.ProcessError) -> None:
        self.append_log("=== Failed to start backend process ===")
        self.status_label.setText("Error")
        self.create_btn.setEnabled(True)
        self.update_btn.setEnabled(True)
        self.browse_btn.setEnabled(True)
        self.drop_zone.setEnabled(True)
        self.process = None
        self._refresh_ffx_versions()
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
