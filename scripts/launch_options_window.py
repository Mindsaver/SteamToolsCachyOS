"""Steam Launch Options manager: game list, single-game edit, batch preview/apply."""
from __future__ import annotations

import copy
import webbrowser
from pathlib import Path

from PySide6.QtCore import QItemSelectionModel, QSettings, Qt, QTimer, QUrl, Signal
from PySide6.QtGui import QAction, QCloseEvent, QDesktopServices, QShowEvent
from PySide6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QCheckBox,
    QComboBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QProgressDialog,
    QPushButton,
    QSplitter,
    QStackedWidget,
    QStatusBar,
    QTabWidget,
    QTableWidget,
    QTableWidgetItem,
    QToolBar,
    QVBoxLayout,
    QWidget,
)

import steam_launch_options_core as core


class LaunchOptionsWindow(QMainWindow):
    """Secondary window: library games table + single/batch launch option editing."""

    closed = Signal()

    def __init__(self, steam_install: Path, app_display_name: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._steam = steam_install
        self._app_name = app_display_name
        self.setWindowTitle("Game launch options")
        self.resize(1100, 640)
        self.setMinimumSize(880, 480)

        self._vdf_root: dict = {}
        self._games: list[core.InstalledGame] = []
        self._account_id = ""
        self._filter_heuristic = True
        self._detail_appid: int | None = None
        self._detail_baseline = ""
        self._batch_preview_rows: list[tuple[int, str, str, str]] = []
        self._batch_preview_valid = False
        self._batch_op_index = 0

        central = QWidget()
        self.setCentralWidget(central)
        outer = QVBoxLayout(central)
        outer.setContentsMargins(8, 8, 8, 8)

        tb = QToolBar()
        tb.setMovable(False)
        self.addToolBar(tb)
        act_refresh = QAction("Refresh list", self)
        act_refresh.setToolTip("Reload games and launch options from disk")
        act_refresh.triggered.connect(self._reload_all)
        tb.addAction(act_refresh)
        tb.addSeparator()
        act_all = QAction("Select all", self)
        act_all.setToolTip("Select every game shown in the list (respects search filter)")
        act_all.triggered.connect(self._select_all_visible)
        tb.addAction(act_all)
        act_none = QAction("Clear selection", self)
        act_none.setToolTip("Unselect all games")
        act_none.triggered.connect(self._select_none)
        tb.addAction(act_none)
        tb.addSeparator()
        act_ud = QAction("Open Steam folder…", self)
        act_ud.setToolTip("Opens your Steam userdata folder in the file manager")
        act_ud.triggered.connect(self._open_userdata)
        tb.addAction(act_ud)
        act_restore = QAction("Undo last save…", self)
        act_restore.setToolTip("Restore the newest backup of your Steam config file")
        act_restore.triggered.connect(self._restore_backup)
        tb.addAction(act_restore)
        tb.addSeparator()
        act_help = QAction("What is this?", self)
        act_help.setToolTip("Open Steam’s help page about launch options")
        act_help.triggered.connect(self._open_help)
        tb.addAction(act_help)

        top = QHBoxLayout()
        acc_lbl = QLabel("Profile")
        acc_lbl.setToolTip("Your Steam login — pick the one you play on")
        top.addWidget(acc_lbl)
        self._account_combo = QComboBox()
        self._account_combo.setMinimumWidth(160)
        self._account_combo.currentTextChanged.connect(self._on_account_changed)
        top.addWidget(self._account_combo)
        self._chk_tools = QCheckBox("Show tools & runtimes (Proton, etc.)")
        self._chk_tools.setToolTip("Off by default — turn on only if you need those entries")
        self._chk_tools.toggled.connect(self._on_filter_toggled)
        top.addWidget(self._chk_tools)
        top.addStretch(1)
        top.addWidget(QLabel("Search"))
        self._filter_edit = QLineEdit()
        self._filter_edit.setPlaceholderText("Type part of a game name…")
        self._filter_edit.textChanged.connect(self._on_filter_text_changed)
        top.addWidget(self._filter_edit, stretch=1)
        outer.addLayout(top)

        self._tip_frame = QWidget()
        tip_l = QVBoxLayout(self._tip_frame)
        tip_l.setContentsMargins(0, 0, 0, 4)
        tip_text = QLabel(
            "<b>How it works:</b> click <i>one</i> game to type extra launch text on the right. "
            "To change <i>several</i> games the same way, hold <b>Ctrl</b> (or <b>Shift</b>) and click them, "
            "then open the <b>Change many</b> tab."
        )
        tip_text.setWordWrap(True)
        tip_text.setTextFormat(Qt.TextFormat.RichText)
        tip_text.setStyleSheet(
            "background-color: rgba(74, 158, 255, 0.12); color: #e8e8e8; padding: 10px 12px; "
            "border-radius: 8px; border: 1px solid rgba(74, 158, 255, 0.35);"
        )
        tip_row = QHBoxLayout()
        tip_row.addWidget(tip_text, stretch=1)
        got_it = QPushButton("Got it, hide this")
        got_it.clicked.connect(self._dismiss_intro_tip)
        tip_row.addWidget(got_it, alignment=Qt.AlignmentFlag.AlignTop)
        tip_l.addLayout(tip_row)
        outer.addWidget(self._tip_frame)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        outer.addWidget(splitter, stretch=1)

        self._table = QTableWidget(0, 3)
        self._table.setHorizontalHeaderLabels(["ID", "Game", "What Steam has now"])
        self._table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self._table.setSelectionMode(QAbstractItemView.SelectionMode.ExtendedSelection)
        self._table.setAlternatingRowColors(True)
        hh = self._table.horizontalHeader()
        hh.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        hh.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        hh.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self._table.itemSelectionChanged.connect(self._on_table_selection_changed)
        splitter.addWidget(self._table)

        right = QTabWidget()
        self._tabs = right

        # --- Single game tab ---
        single = QWidget()
        sv = QVBoxLayout(single)
        self._single_title = QLabel("Click a game in the list (just one).")
        self._single_title.setStyleSheet("font-weight: 600;")
        sv.addWidget(self._single_title)
        self._single_hint = QLabel(
            'Usually leave this empty. If you know what you are doing, examples look like '
            '"MANGOHUD=1 %command%" or "PROTON_USE_WINED3D=1 %command%".'
        )
        self._single_hint.setWordWrap(True)
        self._single_hint.setStyleSheet("color: #aaa; font-size: 12px;")
        sv.addWidget(self._single_hint)
        self._single_editor = QPlainTextEdit()
        self._single_editor.setPlaceholderText("Optional text Steam adds when starting this game…")
        self._single_editor.textChanged.connect(self._on_single_text_changed)
        sv.addWidget(self._single_editor, stretch=1)
        self._single_count = QLabel("0 characters")
        self._single_count.setStyleSheet("color: #888; font-size: 11px;")
        sv.addWidget(self._single_count)
        row = QHBoxLayout()
        self._single_revert = QPushButton("Put back original text")
        self._single_revert.clicked.connect(self._single_revert_clicked)
        self._single_save = QPushButton("Save for this game")
        self._single_save.clicked.connect(self._single_save_clicked)
        row.addWidget(self._single_revert)
        row.addWidget(self._single_save)
        row.addStretch(1)
        sv.addLayout(row)
        right.addTab(single, "One game")

        # --- Batch tab ---
        batch = QWidget()
        bv = QVBoxLayout(batch)
        self._batch_info = QLabel("Select several games in the list (Ctrl+click), pick what to do, then peek and save.")
        self._batch_info.setWordWrap(True)
        bv.addWidget(self._batch_info)

        op_row = QHBoxLayout()
        op_row.addWidget(QLabel("Do this to all selected games:"))
        self._batch_op = QComboBox()
        self._batch_op.addItems(
            [
                "Replace text completely",
                "Add text at the start",
                "Add text at the end",
                "Find & replace words",
                "Remove all extra text",
            ]
        )
        self._batch_op.currentIndexChanged.connect(self._on_batch_op_changed)
        op_row.addWidget(self._batch_op, stretch=1)
        bv.addLayout(op_row)

        self._batch_stack = QStackedWidget()
        self._batch_set_text = QPlainTextEdit()
        self._batch_set_text.setMaximumHeight(88)
        w_set = QWidget()
        ls = QVBoxLayout(w_set)
        ls.addWidget(QLabel("New text (replaces everything for each selected game):"))
        ls.addWidget(self._batch_set_text)
        self._batch_stack.addWidget(w_set)

        self._batch_prefix = QLineEdit()
        w_pre = QWidget()
        lp = QVBoxLayout(w_pre)
        lp.addWidget(QLabel("This will be added in front of what each game already has:"))
        lp.addWidget(self._batch_prefix)
        self._batch_stack.addWidget(w_pre)

        self._batch_suffix = QLineEdit()
        w_suf = QWidget()
        lsu = QVBoxLayout(w_suf)
        lsu.addWidget(QLabel("This will be added after what each game already has:"))
        lsu.addWidget(self._batch_suffix)
        self._batch_stack.addWidget(w_suf)

        self._batch_find = QLineEdit()
        self._batch_replace = QLineEdit()
        w_rep = QWidget()
        lr = QFormLayout(w_rep)
        lr.addRow("Find this:", self._batch_find)
        lr.addRow("Swap it for:", self._batch_replace)
        self._batch_stack.addWidget(w_rep)

        w_clear = QWidget()
        lcl = QVBoxLayout(w_clear)
        lcl.addWidget(QLabel("Clears the extra text for every selected game (Steam default)."))
        self._batch_stack.addWidget(w_clear)

        bf = QGroupBox("Details")
        bfv = QVBoxLayout(bf)
        bfv.addWidget(self._batch_stack)
        bv.addWidget(bf)
        self._batch_set_text.textChanged.connect(self._invalidate_batch_preview)
        self._batch_prefix.textChanged.connect(self._invalidate_batch_preview)
        self._batch_suffix.textChanged.connect(self._invalidate_batch_preview)
        self._batch_find.textChanged.connect(self._invalidate_batch_preview)
        self._batch_replace.textChanged.connect(self._invalidate_batch_preview)

        btn_row = QHBoxLayout()
        self._batch_preview_btn = QPushButton("See what will change")
        self._batch_preview_btn.setToolTip("Shows before/after for each game — nothing is saved yet")
        self._batch_preview_btn.clicked.connect(self._batch_preview_clicked)
        self._batch_apply_btn = QPushButton("Save for all selected games")
        self._batch_apply_btn.setToolTip("Writes after you have clicked “See what will change”")
        self._batch_apply_btn.setEnabled(False)
        self._batch_apply_btn.clicked.connect(self._batch_apply_clicked)
        btn_row.addWidget(self._batch_preview_btn)
        btn_row.addWidget(self._batch_apply_btn)
        btn_row.addStretch(1)
        bv.addLayout(btn_row)

        self._batch_preview_table = QTableWidget(0, 4)
        self._batch_preview_table.setHorizontalHeaderLabels(["ID", "Game", "Before", "After"])
        self._batch_preview_table.horizontalHeader().setStretchLastSection(True)
        bv.addWidget(self._batch_preview_table, stretch=1)

        self._batch_report = QPlainTextEdit()
        self._batch_report.setReadOnly(True)
        self._batch_report.setMaximumHeight(120)
        self._batch_report.setPlaceholderText("After saving, a short report appears here…")
        bv.addWidget(self._batch_report)

        right.addTab(batch, "Change many")
        right.currentChanged.connect(self._on_tabs_changed)
        splitter.addWidget(right)
        splitter.setStretchFactor(0, 3)
        splitter.setStretchFactor(1, 2)

        sb = QStatusBar()
        self.setStatusBar(sb)
        self._status_path = QLabel("")
        self._status_steam = QLabel("")
        sb.addWidget(self._status_path, stretch=1)
        sb.addPermanentWidget(self._status_steam)

        self._steam_timer = QTimer(self)
        self._steam_timer.setInterval(3000)
        self._steam_timer.timeout.connect(self._update_steam_warning)
        self._steam_timer.start()

        self._reload_accounts()
        self._reload_all()
        self._on_batch_op_changed(0)
        self._update_steam_warning()
        self._update_window_dirty_title()
        if self._account_combo.count() == 0:
            QMessageBox.warning(
                self,
                self._app_name,
                "Steam hasn’t created a player folder yet.\n"
                "Open Steam, sign in once, then click Refresh list.",
            )
        settings = QSettings(self._app_name, "LaunchOptions")
        if settings.value("hideIntroTip", False, type=bool):
            self._tip_frame.setVisible(False)

    def _dismiss_intro_tip(self) -> None:
        self._tip_frame.setVisible(False)
        QSettings(self._app_name, "LaunchOptions").setValue("hideIntroTip", True)

    def closeEvent(self, event: QCloseEvent) -> None:
        if self._single_is_dirty():
            r = QMessageBox.question(
                self,
                self._app_name,
                "You changed the text for this game but didn’t save. What would you like to do?",
                QMessageBox.StandardButton.Save | QMessageBox.StandardButton.Discard | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Save,
            )
            if r == QMessageBox.StandardButton.Cancel:
                event.ignore()
                return
            if r == QMessageBox.StandardButton.Save:
                self._single_save_clicked()
        self.closed.emit()
        super().closeEvent(event)

    def _lc_path(self) -> Path:
        return core.localconfig_path(self._steam, self._account_id)

    def _reload_accounts(self) -> None:
        self._account_combo.blockSignals(True)
        self._account_combo.clear()
        ids = core.list_userdata_accounts(self._steam)
        for aid in ids:
            self._account_combo.addItem(aid)
        self._account_combo.blockSignals(False)
        if ids and not self._account_id:
            self._account_id = ids[0]
            self._account_combo.setCurrentText(self._account_id)
        elif not ids:
            self._account_id = ""

    def _on_account_changed(self, text: str) -> None:
        self._account_id = text.strip()
        self._load_vdf_and_refresh_table()

    def _on_filter_toggled(self, checked: bool) -> None:
        self._filter_heuristic = not checked
        self._reload_games_only()

    def _reload_games_only(self) -> None:
        self._games = core.iter_installed_games(self._steam, filter_heuristic=self._filter_heuristic)
        self._populate_table_preserve_selection()

    def _reload_all(self) -> None:
        self._reload_accounts()
        if not self._account_id and self._account_combo.count() > 0:
            self._account_id = self._account_combo.currentText()
        self._reload_games_only()
        self._load_vdf_and_refresh_table()

    def _count_selected_rows(self) -> int:
        n = 0
        for idx in self._table.selectionModel().selectedRows():
            if not self._table.isRowHidden(idx.row()):
                n += 1
        return n

    def _load_vdf_and_refresh_table(self) -> None:
        path = self._lc_path()
        self._status_path.setText(f"Config: {path}" if self._account_id else "No Steam userdata accounts found.")
        try:
            if self._account_id:
                self._vdf_root = core.load_localconfig_or_new(path)
            else:
                self._vdf_root = core.empty_localconfig_template()
        except (OSError, ValueError) as e:
            QMessageBox.warning(self, self._app_name, f"Could not read localconfig:\n{e}")
            self._vdf_root = core.empty_localconfig_template()
        self._populate_table_preserve_selection()
        self._invalidate_batch_preview()
        self._refresh_single_from_selection()

    def _collect_selected_appids(self) -> set[int]:
        out: set[int] = set()
        for idx in self._table.selectionModel().selectedRows():
            r = idx.row()
            if self._table.isRowHidden(r):
                continue
            it = self._table.item(r, 0)
            if it:
                try:
                    out.add(int(it.text()))
                except ValueError:
                    pass
        return out

    def _populate_table_preserve_selection(self) -> None:
        selected = self._collect_selected_appids()
        self._populate_table(selected)

    def _populate_table(self, selected_appids: set[int] | None = None) -> None:
        if selected_appids is None:
            selected_appids = set()
        self._table.blockSignals(True)
        self._table.setSortingEnabled(False)
        self._table.setRowCount(0)
        for g in self._games:
            lo = core.get_launch_options(self._vdf_root, g.appid)
            row = self._table.rowCount()
            self._table.insertRow(row)
            id_item = QTableWidgetItem(str(g.appid))
            id_item.setFlags(id_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self._table.setItem(row, 0, id_item)
            name_item = QTableWidgetItem(g.name)
            name_item.setFlags(name_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self._table.setItem(row, 1, name_item)
            lo_display = lo if len(lo) <= 120 else lo[:117] + "…"
            lo_item = QTableWidgetItem(lo_display)
            lo_item.setFlags(lo_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            lo_item.setToolTip(lo.replace("\t", " ") if lo else "(empty)")
            lo_item.setData(Qt.ItemDataRole.UserRole, lo)
            self._table.setItem(row, 2, lo_item)
        self._table.setSortingEnabled(True)
        self._table.sortByColumn(1, Qt.SortOrder.AscendingOrder)
        self._table.blockSignals(False)
        self._apply_row_filter()
        self._restore_selection(selected_appids)

    def _restore_selection(self, appids: set[int]) -> None:
        if not appids:
            return
        self._table.clearSelection()
        flags = QItemSelectionModel.SelectionFlag.Select | QItemSelectionModel.SelectionFlag.Rows
        sm = self._table.selectionModel()
        for r in range(self._table.rowCount()):
            it = self._table.item(r, 0)
            if it and int(it.text()) in appids:
                sm.select(self._table.model().index(r, 0), flags)

    def _on_filter_text_changed(self, _t: str) -> None:
        self._apply_row_filter()
        self._invalidate_batch_preview()
        self._update_batch_info()

    def _apply_row_filter(self) -> None:
        q = self._filter_edit.text().strip().lower()
        for r in range(self._table.rowCount()):
            if not q:
                self._table.setRowHidden(r, False)
                continue
            id_txt = self._table.item(r, 0).text().lower() if self._table.item(r, 0) else ""
            name = self._table.item(r, 1).text().lower() if self._table.item(r, 1) else ""
            self._table.setRowHidden(r, q not in id_txt and q not in name)

    def _selected_appid_from_table(self) -> int | None:
        rows = [idx for idx in self._table.selectionModel().selectedRows() if not self._table.isRowHidden(idx.row())]
        if len(rows) != 1:
            return None
        r = rows[0].row()
        it = self._table.item(r, 0)
        if not it:
            return None
        try:
            return int(it.text())
        except ValueError:
            return None

    def _on_table_selection_changed(self) -> None:
        if self._single_is_dirty():
            r = QMessageBox.question(
                self,
                self._app_name,
                "Save your edits for this game before picking another?",
                QMessageBox.StandardButton.Save | QMessageBox.StandardButton.Discard | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Save,
            )
            if r == QMessageBox.StandardButton.Cancel:
                self._table.blockSignals(True)
                self._select_row_for_appid(self._detail_appid)
                self._table.blockSignals(False)
                return
            if r == QMessageBox.StandardButton.Save:
                self._single_save_clicked()
            elif r == QMessageBox.StandardButton.Discard:
                self._single_revert_clicked()
        self._refresh_single_from_selection()
        self._invalidate_batch_preview()
        self._update_batch_info()

    def _select_row_for_appid(self, appid: int | None) -> None:
        if appid is None:
            return
        for r in range(self._table.rowCount()):
            it = self._table.item(r, 0)
            if it and it.text() == str(appid):
                self._table.selectRow(r)
                return

    def _refresh_single_from_selection(self) -> None:
        n_sel = self._count_selected_rows()
        aid = self._selected_appid_from_table()
        self._detail_appid = aid
        self._single_hint.setVisible(True)
        if n_sel == 0:
            self._single_title.setText("Click one game in the list.")
            self._single_editor.blockSignals(True)
            self._single_editor.clear()
            self._single_editor.setReadOnly(True)
            self._single_editor.blockSignals(False)
            self._detail_baseline = ""
            self._single_revert.setEnabled(False)
            self._single_save.setEnabled(False)
            self._on_single_text_changed()
            self._update_window_dirty_title()
            return
        if n_sel > 1:
            self._single_title.setText(
                f"{n_sel} games selected — open the “Change many” tab to edit them together,\n"
                "or click just one game here if you only want to change a single title."
            )
            self._single_hint.setVisible(False)
            self._single_editor.blockSignals(True)
            self._single_editor.clear()
            self._single_editor.setReadOnly(True)
            self._single_editor.blockSignals(False)
            self._detail_appid = None
            self._detail_baseline = ""
            self._single_revert.setEnabled(False)
            self._single_save.setEnabled(False)
            self._on_single_text_changed()
            self._update_window_dirty_title()
            return
        name = ""
        for r in range(self._table.rowCount()):
            it = self._table.item(r, 0)
            if it and it.text() == str(aid):
                n = self._table.item(r, 1)
                name = n.text() if n else ""
                break
        text = core.get_launch_options(self._vdf_root, aid) if aid is not None else ""
        self._single_title.setText(f"Editing: {name}")
        self._detail_baseline = text
        self._single_editor.blockSignals(True)
        self._single_editor.setPlainText(text)
        self._single_editor.setReadOnly(False)
        self._single_editor.blockSignals(False)
        self._single_revert.setEnabled(True)
        self._single_save.setEnabled(bool(aid) and bool(self._account_id))
        self._on_single_text_changed()
        self._update_window_dirty_title()

    def _single_is_dirty(self) -> bool:
        if self._detail_appid is None:
            return False
        return self._single_editor.toPlainText() != self._detail_baseline

    def _on_single_text_changed(self) -> None:
        n = len(self._single_editor.toPlainText())
        self._single_count.setText(f"{n} characters")
        self._update_window_dirty_title()

    def _update_window_dirty_title(self) -> None:
        base = "Game launch options"
        if self._single_is_dirty():
            self.setWindowTitle(f"{base} — not saved yet")
        else:
            self.setWindowTitle(base)

    def _single_revert_clicked(self) -> None:
        self._single_editor.blockSignals(True)
        self._single_editor.setPlainText(self._detail_baseline)
        self._single_editor.blockSignals(False)
        self._on_single_text_changed()

    def _confirm_steam_running(self) -> bool:
        if not core.is_steam_process_running():
            return True
        r = QMessageBox.warning(
            self,
            self._app_name,
            "Steam is open right now. Saving might still work, but closing Steam first is the "
            "safest way to avoid surprises.\n\nSave anyway?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        return r == QMessageBox.StandardButton.Yes

    def _single_save_clicked(self) -> None:
        if self._detail_appid is None or not self._account_id:
            return
        if not self._confirm_steam_running():
            return
        path = self._lc_path()
        try:
            core.set_launch_options(self._vdf_root, self._detail_appid, self._single_editor.toPlainText())
            bak = core.save_localconfig(path, self._vdf_root, do_backup=True)
            self._detail_baseline = self._single_editor.toPlainText()
            self._update_row_launch_display(self._detail_appid, self._detail_baseline)
            self._update_window_dirty_title()
            msg = "Saved."
            if bak:
                msg += f"\nBackup: {bak}"
            self.statusBar().showMessage(msg, 8000)
        except OSError as e:
            QMessageBox.critical(self, self._app_name, f"Save failed:\n{e}")

    def _update_row_launch_display(self, appid: int, lo: str) -> None:
        for r in range(self._table.rowCount()):
            it = self._table.item(r, 0)
            if it and it.text() == str(appid):
                lo_item = self._table.item(r, 2)
                if lo_item:
                    disp = lo if len(lo) <= 120 else lo[:117] + "…"
                    lo_item.setText(disp)
                    lo_item.setToolTip(lo.replace("\t", " ") if lo else "(empty)")
                    lo_item.setData(Qt.ItemDataRole.UserRole, lo)
                break

    def _selected_appids_for_batch(self) -> list[int]:
        return sorted(self._collect_selected_appids())

    def _game_name(self, appid: int) -> str:
        for g in self._games:
            if g.appid == appid:
                return g.name
        return str(appid)

    def _select_all_visible(self) -> None:
        self._table.clearSelection()
        flags = QItemSelectionModel.SelectionFlag.Select | QItemSelectionModel.SelectionFlag.Rows
        sm = self._table.selectionModel()
        for r in range(self._table.rowCount()):
            if self._table.isRowHidden(r):
                continue
            sm.select(self._table.model().index(r, 0), flags)
        self._invalidate_batch_preview()
        self._update_batch_info()

    def _select_none(self) -> None:
        self._table.clearSelection()
        self._invalidate_batch_preview()
        self._update_batch_info()

    def _open_userdata(self) -> None:
        root = core.userdata_root(self._steam)
        if root.is_dir():
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(root.resolve())))
        else:
            QMessageBox.information(self, self._app_name, f"Not found:\n{root}")

    def _restore_backup(self) -> None:
        if not self._account_id:
            QMessageBox.information(self, self._app_name, "Select a Steam account first.")
            return
        path = self._lc_path()
        bak = core.latest_backup(path)
        if not bak or not bak.is_file():
            QMessageBox.information(self, self._app_name, "No backup file found next to localconfig.vdf.")
            return
        if QMessageBox.question(self, self._app_name, f"Replace current localconfig with:\n{bak}?") != QMessageBox.StandardButton.Yes:
            return
        try:
            core.restore_from_backup(path, bak)
            self._load_vdf_and_refresh_table()
            self.statusBar().showMessage(f"Restored from {bak.name}", 8000)
        except OSError as e:
            QMessageBox.critical(self, self._app_name, str(e))

    def _open_help(self) -> None:
        webbrowser.open("https://help.steampowered.com/en/faqs/view/7D01-D-2F22-EA8F")

    def _update_steam_warning(self) -> None:
        if core.is_steam_process_running():
            self._status_steam.setText("Steam is open — closing it before saving is safest")
            self._status_steam.setStyleSheet("color: #ffb74d;")
        else:
            self._status_steam.setText("Steam looks closed — good time to save")
            self._status_steam.setStyleSheet("color: #81c784;")

    def _on_batch_op_changed(self, index: int) -> None:
        self._batch_op_index = index
        self._batch_stack.setCurrentIndex(index)
        self._invalidate_batch_preview()

    def _invalidate_batch_preview(self) -> None:
        self._batch_preview_valid = False
        self._batch_apply_btn.setEnabled(False)
        self._batch_preview_table.setRowCount(0)

    def _update_batch_info(self) -> None:
        n = len(self._selected_appids_for_batch())
        if n == 0:
            self._batch_info.setText(
                "Select games in the list with Ctrl+click (or Shift+click a range), then pick an action below."
            )
        elif n == 1:
            self._batch_info.setText(
                "Only one game is selected. That’s fine — you can still use this tab — "
                "or use “One game” for a simpler view."
            )
        else:
            self._batch_info.setText(
                f"{n} games selected. Choose what to do, tap “See what will change”, then “Save for all selected games”."
            )

    def _batch_op_name(self) -> str:
        names = ["set", "prefix", "suffix", "replace", "clear"]
        return names[self._batch_op.currentIndex()]

    def _batch_preview_clicked(self) -> None:
        if not self._account_id:
            QMessageBox.warning(self, self._app_name, "Pick your Steam profile in the menu at the top first.")
            return
        ids = self._selected_appids_for_batch()
        self._update_batch_info()
        if not ids:
            QMessageBox.information(
                self,
                self._app_name,
                "Select one or more games in the list first.\n"
                "Tip: hold Ctrl and click each game (or Shift+click two rows to select a range).",
            )
            return
        op = self._batch_op_name()
        if op == "replace" and not self._batch_find.text():
            QMessageBox.warning(self, self._app_name, "Please type something in “Find this”.")
            return
        rows: list[tuple[int, str, str, str]] = []
        for aid in ids:
            cur = core.get_launch_options(self._vdf_root, aid)
            new = core.transform_launch_options(
                cur,
                op,
                set_value=self._batch_set_text.toPlainText(),
                prefix=self._batch_prefix.text(),
                suffix=self._batch_suffix.text(),
                find=self._batch_find.text(),
                replace_with=self._batch_replace.text(),
            )
            rows.append((aid, self._game_name(aid), cur, new))
        self._batch_preview_rows = rows
        self._batch_preview_table.setRowCount(0)
        for aid, name, before, after in rows:
            r = self._batch_preview_table.rowCount()
            self._batch_preview_table.insertRow(r)
            for c, txt in enumerate([str(aid), name, before, after]):
                cell = QTableWidgetItem(txt if len(txt) < 500 else txt[:497] + "…")
                cell.setToolTip(txt)
                self._batch_preview_table.setItem(r, c, cell)
        self._batch_preview_valid = True
        self._batch_apply_btn.setEnabled(True)
        self.statusBar().showMessage(f"Preview ready — {len(rows)} game(s). Nothing saved yet.", 5000)

    def _batch_apply_clicked(self) -> None:
        if not self._account_id:
            return
        if not self._batch_preview_valid or not self._batch_preview_rows:
            QMessageBox.information(
                self,
                self._app_name,
                "Tap “See what will change” first so you can double-check, then save.",
            )
            return
        if not self._confirm_steam_running():
            return
        path = self._lc_path()
        n = len(self._batch_preview_rows)
        prog = QProgressDialog("Writing launch options…", "Cancel", 0, n, self)
        prog.setWindowModality(Qt.WindowModality.WindowModal)
        prog.setMinimumDuration(400)
        lines: list[str] = []
        snap = copy.deepcopy(self._vdf_root)
        try:
            for i, (aid, name, _before, after) in enumerate(self._batch_preview_rows):
                if prog.wasCanceled():
                    self._batch_report.setPlainText("Canceled; no changes were written.")
                    self._invalidate_batch_preview()
                    return
                try:
                    core.set_launch_options(snap, aid, after)
                    lines.append(f"OK  {aid}  {name}")
                except Exception as e:
                    lines.append(f"ERR {aid}  {name}: {e}")
                prog.setValue(i + 1)
                QApplication.processEvents()
            bak = core.save_localconfig(path, snap, do_backup=True)
            self._vdf_root = snap
            lines.append(f"Wrote {path}")
            if bak:
                lines.append(f"Backup: {bak}")
        except OSError as e:
            QMessageBox.critical(self, self._app_name, f"Batch save failed:\n{e}")
            return
        self._batch_report.setPlainText("\n".join(lines))
        self._load_vdf_and_refresh_table()
        self._invalidate_batch_preview()
        self.statusBar().showMessage("All set — changes saved.", 8000)

    def showEvent(self, ev: QShowEvent) -> None:
        super().showEvent(ev)
        self._update_batch_info()

    def _on_tabs_changed(self, _index: int) -> None:
        self._invalidate_batch_preview()
        self._update_batch_info()


def open_launch_options_manager(parent: QWidget, app_display_name: str) -> None:
    steam = core.resolve_steam_install()
    if steam is None:
        QMessageBox.warning(
            parent,
            app_display_name,
            "Could not find Steam on this PC (looking for libraryfolders.vdf).\n"
            "If Steam lives somewhere unusual, set the environment variable STEAM_CLIENT to that folder.",
        )
        return
    existing = getattr(parent, "_launch_options_manager_ref", None)
    if isinstance(existing, LaunchOptionsWindow) and existing.isVisible():
        existing.raise_()
        existing.activateWindow()
        return
    win = LaunchOptionsWindow(steam, app_display_name, parent)
    setattr(parent, "_launch_options_manager_ref", win)
    win.show()
