"""Structured launch-options controls (checkboxes, gamescope, game flags)."""
from __future__ import annotations

from collections.abc import Callable

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QFormLayout,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QScrollArea,
    QSpinBox,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

import launch_options_compose as compose
from gpu_vendor_detect import GpuVendorInfo

_PRESET_AMD = frozenset(
    {
        "mesa_anti_lag",
        "mesa_anti_lag_disable",
        "dri_prime",
        "proton_hide_apu",
        "proton_fsr4",
        "proton_fsr4_rdna3",
    }
)
_PRESET_NVIDIA = frozenset(
    {
        "proton_nvapi",
        "proton_ngx_updater",
        "proton_hide_nvidia",
        "proton_dlss_indicator",
        "proton_nvidia_libs",
    }
)
_OVERVIEW_IDS = frozenset(
    {
        "proton_log",
        "dxvk_hud_fps",
        "proton_wined3d",
        "proton_no_esync",
        "proton_no_fsync",
        "proton_no_d3d11",
        "vkbasalt",
    }
)


def _card_style() -> str:
    return (
        "QGroupBox { font-weight: 600; border: 1px solid rgba(120, 120, 120, 0.45); "
        "border-radius: 8px; margin-top: 10px; padding: 10px 8px 8px 8px; "
        "background-color: rgba(80, 80, 80, 0.2); }"
        "QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; color: #e0e0e0; }"
    )


def _subtitle(text: str) -> QLabel:
    lab = QLabel(text)
    lab.setWordWrap(True)
    lab.setStyleSheet("color: #aaa; font-size: 12px;")
    return lab


def _add_preset_rows(layout: QVBoxLayout, preset_ids: set[str], storage: dict[str, QCheckBox]) -> None:
    for meta, ekey, eval_on in compose.iter_env_presets():
        if meta.id not in preset_ids:
            continue
        row = QHBoxLayout()
        cb = QCheckBox(meta.label)
        cb.setTristate(True)
        tip = f"{meta.tooltip}\n({ekey}={eval_on})"
        if meta.risk == "experimental":
            tip += "\n\nExperimental — test per game."
        cb.setToolTip(tip)
        row.addWidget(cb, stretch=1)
        layout.addLayout(row)
        storage[meta.id] = cb


class StructuredLaunchPanel(QWidget):
    """Binds Qt controls to compose.LaunchOptionsModel."""

    def __init__(self, gpu: GpuVendorInfo, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._gpu = gpu
        self._preset_checks: dict[str, QCheckBox] = {}
        self._preset_base_label: dict[str, str] = {}
        self._preset_base_tip: dict[str, str] = {}
        self._global_env_overrides: dict[str, str] = {}
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(10)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.Shape.NoFrame)
        inner = QWidget()
        scroll.setWidget(inner)
        il = QVBoxLayout(inner)
        il.setSpacing(12)

        # --- Overview ---
        ov = QGroupBox("Diagnostics & common tools")
        ov.setStyleSheet(_card_style())
        ovl = QVBoxLayout(ov)
        ovl.addWidget(_subtitle("High-signal toggles most players need first (Valve + common Linux tools)."))
        self._mangohud = QCheckBox("MangoHud overlay")
        self._mangohud.setToolTip("Prefix mangohud — FPS / frametime overlay (mangohud %command%).")
        self._gamemode = QCheckBox("GameMode")
        self._gamemode.setToolTip("Prefix gamemode when installed (gamemode %command%).")
        self._game_performance = QCheckBox("game-performance")
        self._game_performance.setToolTip(
            "KDE / some distros ship this wrapper for performance / power profile (game-performance %command%)."
        )
        ovl.addWidget(self._mangohud)
        ovl.addWidget(self._gamemode)
        ovl.addWidget(self._game_performance)
        _add_preset_rows(ovl, _OVERVIEW_IDS, self._preset_checks)
        il.addWidget(ov)

        # --- Environment tabs (tier 3+ and vendor) ---
        env_tabs = QTabWidget()
        common_w = QWidget()
        cl = QVBoxLayout(common_w)
        cl.addWidget(_subtitle("Compatibility, Steam Deck, Wayland, Scopebuddy env flags, etc."))
        common_ids = {
            m.id
            for m, _k, _v in compose.iter_env_presets()
            if m.id not in _OVERVIEW_IDS and m.id not in _PRESET_AMD and m.id not in _PRESET_NVIDIA
        }
        _add_preset_rows(cl, common_ids, self._preset_checks)
        cl.addStretch(1)
        env_tabs.addTab(common_w, "Common")

        amd_w = QWidget()
        al = QVBoxLayout(amd_w)
        al.addWidget(_subtitle("AMD-focused options (still shown if no AMD GPU was detected)."))
        _add_preset_rows(al, _PRESET_AMD, self._preset_checks)
        al.addStretch(1)
        env_tabs.addTab(amd_w, "AMD")

        nv_w = QWidget()
        nl = QVBoxLayout(nv_w)
        nl.addWidget(_subtitle("NVIDIA-focused options (still shown if no NVIDIA GPU was detected)."))
        _add_preset_rows(nl, _PRESET_NVIDIA, self._preset_checks)
        nl.addStretch(1)
        env_tabs.addTab(nv_w, "NVIDIA")

        tab = self._gpu.primary_discrete_hint
        if tab == "nvidia":
            env_tabs.setCurrentIndex(2)
        elif tab == "amd":
            env_tabs.setCurrentIndex(1)
        else:
            env_tabs.setCurrentIndex(0)

        wrap = QGroupBox("Environment variables")
        wrap.setStyleSheet(_card_style())
        wl = QVBoxLayout(wrap)
        wl.addWidget(_subtitle(self._gpu.summary_line()))
        wl.addWidget(env_tabs)
        il.addWidget(wrap)

        # --- Gamescope ---
        gs = QGroupBox("Gamescope")
        gs.setStyleSheet(_card_style())
        gsl = QVBoxLayout(gs)
        gsl.addWidget(
            _subtitle("Session compositor wrapper. Cleared if every option below is off and FPS is default.")
        )
        self._gs_enable = QCheckBox("Enable Gamescope wrapper")
        self._gs_enable.setToolTip("Inserts gamescope … -- before %command%.")
        gsl.addWidget(self._gs_enable)
        gform = QFormLayout()
        self._gs_full = QCheckBox("Fullscreen (-f)")
        self._gs_hdr = QCheckBox("HDR (--hdr-enabled)")
        self._gs_vrr = QCheckBox("Adaptive sync / VRR (-O)")
        self._gs_fps = QSpinBox()
        self._gs_fps.setRange(0, 360)
        self._gs_fps.setSpecialValueText("off")
        self._gs_fps.setValue(0)
        self._gs_w = QSpinBox()
        self._gs_w.setRange(0, 7680)
        self._gs_h = QSpinBox()
        self._gs_h.setRange(0, 4320)
        gform.addRow(self._gs_full)
        gform.addRow(self._gs_hdr)
        gform.addRow(self._gs_vrr)
        gform.addRow("FPS cap (-r)", self._gs_fps)
        gform.addRow("Output width (-W)", self._gs_w)
        gform.addRow("Output height (-H)", self._gs_h)
        gsl.addLayout(gform)
        self._gs_enable.toggled.connect(self._update_gs_enabled)
        self._update_gs_enabled()
        il.addWidget(gs)

        # --- Game flags ---
        gf = QGroupBox("Game arguments (after %command%)")
        gf.setStyleSheet(_card_style())
        gfl = QVBoxLayout(gf)
        gfl.addWidget(_subtitle("Appended after Steam’s launch command — game-dependent."))
        grid = QGridLayout()
        self._suffix_checks: dict[str, QCheckBox] = {}
        for i, (flag, tip) in enumerate(compose.GAME_SUFFIX_FLAGS):
            cb = QCheckBox(flag)
            cb.setToolTip(tip)
            grid.addWidget(cb, i // 2, i % 2)
            self._suffix_checks[flag] = cb
        gfl.addLayout(grid)
        il.addWidget(gf)

        il.addStretch(1)
        outer.addWidget(scroll)

    def set_global_env_markers(self, env_overrides: dict[str, str]) -> None:
        """Annotate env checkboxes when global user_settings.py sets a related key."""
        self._global_env_overrides = dict(env_overrides)
        for pid, cb in self._preset_checks.items():
            if pid not in self._preset_base_label:
                self._preset_base_label[pid] = cb.text()
            if pid not in self._preset_base_tip:
                self._preset_base_tip[pid] = cb.toolTip()
            base_label = self._preset_base_label[pid]
            base_tip = self._preset_base_tip[pid]
            _meta, ekey, val_on = compose.PRESET_BY_ID[pid]
            gval = env_overrides.get(ekey)
            cb.setTristate(gval is not None)
            if gval is None:
                cb.setText(base_label)
                cb.setToolTip(base_tip)
                continue
            if gval == val_on:
                marker = " [global ON]"
                detail = f"Global user_settings.py sets {ekey}={gval}."
            else:
                marker = f" [global={gval}]"
                detail = (
                    f"Global user_settings.py sets {ekey}={gval} (this toggle expects {val_on}). "
                    "Local launch options can still override."
                )
            cb.setText(base_label + marker)
            cb.setToolTip(base_tip + "\n\n" + detail)

    def _update_gs_enabled(self) -> None:
        on = self._gs_enable.isChecked()
        for w in (
            self._gs_full,
            self._gs_hdr,
            self._gs_vrr,
            self._gs_fps,
            self._gs_w,
            self._gs_h,
        ):
            w.setEnabled(on)

    def populate_from_model(self, model: compose.LaunchOptionsModel) -> None:
        self._mangohud.blockSignals(True)
        self._gamemode.blockSignals(True)
        self._game_performance.blockSignals(True)
        for cb in self._preset_checks.values():
            cb.blockSignals(True)
        for cb in self._suffix_checks.values():
            cb.blockSignals(True)
        self._gs_enable.blockSignals(True)

        self._mangohud.setChecked(compose.mangohud_active(model))
        self._gamemode.setChecked(compose.gamemode_active(model))
        self._game_performance.setChecked(compose.game_performance_active(model))
        for pid, cb in self._preset_checks.items():
            _meta, ekey, val_on = compose.PRESET_BY_ID[pid]
            gval = self._global_env_overrides.get(ekey)
            local = model.env.get(ekey)
            off = compose.preset_env_off_value(ekey, val_on)
            if local == val_on:
                cb.setCheckState(Qt.CheckState.Checked)
            elif local is not None:
                if off is not None and local == off:
                    cb.setCheckState(Qt.CheckState.Unchecked)
                else:
                    cb.setCheckState(Qt.CheckState.Unchecked)
            else:
                if gval is not None:
                    cb.setCheckState(Qt.CheckState.PartiallyChecked)
                else:
                    cb.setCheckState(Qt.CheckState.Unchecked)
        for flag, cb in self._suffix_checks.items():
            cb.setChecked(compose.suffix_has(model, flag))

        gs = model.gamescope
        self._gs_enable.setChecked(gs is not None)
        if gs:
            self._gs_full.setChecked(gs.fullscreen)
            self._gs_hdr.setChecked(gs.hdr)
            self._gs_vrr.setChecked(gs.vrr)
            if gs.frame_limit is not None:
                self._gs_fps.setValue(max(30, gs.frame_limit))
            else:
                self._gs_fps.setValue(0)
            self._gs_w.setValue(gs.width or 0)
            self._gs_h.setValue(gs.height or 0)
        else:
            self._gs_full.setChecked(False)
            self._gs_hdr.setChecked(False)
            self._gs_vrr.setChecked(False)
            self._gs_fps.setValue(0)
            self._gs_w.setValue(0)
            self._gs_h.setValue(0)

        self._mangohud.blockSignals(False)
        self._gamemode.blockSignals(False)
        self._game_performance.blockSignals(False)
        for cb in self._preset_checks.values():
            cb.blockSignals(False)
        for cb in self._suffix_checks.values():
            cb.blockSignals(False)
        self._gs_enable.blockSignals(False)
        self._update_gs_enabled()

    def connect_changed(self, fn: Callable[[], None]) -> None:
        self._mangohud.toggled.connect(fn)
        self._gamemode.toggled.connect(fn)
        self._game_performance.toggled.connect(fn)
        for cb in self._preset_checks.values():
            cb.stateChanged.connect(lambda _v, fn=fn: fn())
        for cb in self._suffix_checks.values():
            cb.toggled.connect(fn)
        self._gs_enable.toggled.connect(fn)
        self._gs_full.toggled.connect(fn)
        self._gs_hdr.toggled.connect(fn)
        self._gs_vrr.toggled.connect(fn)
        self._gs_fps.valueChanged.connect(fn)
        self._gs_w.valueChanged.connect(fn)
        self._gs_h.valueChanged.connect(fn)

    def apply_to_model(self, model: compose.LaunchOptionsModel) -> None:
        compose.set_mangohud(model, self._mangohud.isChecked())
        compose.set_gamemode(model, self._gamemode.isChecked())
        compose.set_game_performance(model, self._game_performance.isChecked())
        for pid, cb in self._preset_checks.items():
            _meta, ekey, val_on = compose.PRESET_BY_ID[pid]
            state = cb.checkState()
            has_global = ekey in self._global_env_overrides
            if state == Qt.CheckState.PartiallyChecked and ekey in self._global_env_overrides:
                compose.set_preset_env(model, ekey, val_on, False)
                continue
            if state == Qt.CheckState.Checked:
                compose.set_preset_env(model, ekey, val_on, True)
                continue
            if not has_global:
                compose.set_preset_env(model, ekey, val_on, False)
                continue
            off = compose.preset_env_off_value(ekey, val_on)
            if off is None:
                compose.set_preset_env(model, ekey, val_on, False)
                continue
            model.env[ekey] = off
            if ekey not in model.env_order:
                model.env_order.append(ekey)
        for flag, cb in self._suffix_checks.items():
            compose.set_suffix_token(model, flag, cb.isChecked())

        if not self._gs_enable.isChecked():
            model.gamescope = None
        else:
            g = compose.ensure_gamescope(model)
            g.fullscreen = self._gs_full.isChecked()
            g.hdr = self._gs_hdr.isChecked()
            g.vrr = self._gs_vrr.isChecked()
            fps = self._gs_fps.value()
            g.frame_limit = fps if fps > 0 else None
            w, h = self._gs_w.value(), self._gs_h.value()
            g.width = w if w > 0 else None
            g.height = h if h > 0 else None
