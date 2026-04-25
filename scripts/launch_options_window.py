"""Steam Launch Options manager: game list, single-game edit, batch preview/apply."""
from __future__ import annotations

import copy
import webbrowser
from pathlib import Path

from PySide6.QtCore import Qt, QTimer, QUrl, Signal
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
        self.setWindowTitle("Launch Options")
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
        act_refresh = QAction("Refresh", self)
        act_refresh.triggered.connect(self._reload_all)
        tb.addAction(act_refresh)
        tb.addSeparator()
        act_all = QAction("Select all (visible)", self)
        act_all.triggered.connect(self._select_all_visible)
        tb.addAction(act_all)
        act_none = QAction("Select none", self)
        act_none.triggered.connect(self._select_none)
        tb.addAction(act_none)
        tb.addSeparator()
        act_ud = QAction("Open userdata…", self)
        act_ud.triggered.connect(self._open_userdata)
        tb.addAction(act_ud)
        act_restore = QAction("Restore latest backup…", self)
        act_restore.triggered.connect(self._restore_backup)
        tb.addAction(act_restore)
        tb.addSeparator()
        act_help = QAction("Steam launch options (help)", self)
        act_help.triggered.connect(self._open_help)
        tb.addAction(act_help)

        top = QHBoxLayout()
        top.addWidget(QLabel("Steam account:"))
        self._account_combo = QComboBox()
        self._account_combo.setMinimumWidth(160)
        self._account_combo.currentTextChanged.connect(self._on_account_changed)
        top.addWidget(self._account_combo)
        self._chk_tools = QCheckBox("Show Proton / runtimes / redistributables")
        self._chk_tools.toggled.connect(self._on_filter_toggled)
        top.addWidget(self._chk_tools)
        top.addStretch(1)
        top.addWidget(QLabel("Filter:"))
        self._filter_edit = QLineEdit()
        self._filter_edit.setPlaceholderText("Name or AppID…")
        self._filter_edit.textChanged.connect(self._apply_row_filter)
        top.addWidget(self._filter_edit, stretch=1)
        outer.addLayout(top)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        outer.addWidget(splitter, stretch=1)

        self._table = QTableWidget(0, 4)
        self._table.setHorizontalHeaderLabels(["Use", "AppID", "Game", "Current launch options"])
        self._table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self._table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self._table.setAlternatingRowColors(True)
        hh = self._table.horizontalHeader()
        hh.setSectionResizeMode(0, QHeaderView.ResizeMode.Fixed)
        self._table.setColumnWidth(0, 44)
        hh.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        hh.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        hh.setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        self._table.itemSelectionChanged.connect(self._on_table_selection_changed)
        self._table.itemChanged.connect(self._on_table_item_changed)
        splitter.addWidget(self._table)

        right = QTabWidget()
        self._tabs = right

        # --- Single game tab ---
        single = QWidget()
        sv = QVBoxLayout(single)
        self._single_title = QLabel("Select a game from the list.")
        self._single_title.setStyleSheet("font-weight: 600;")
        sv.addWidget(self._single_title)
        self._single_editor = QPlainTextEdit()
        self._single_editor.setPlaceholderText("Launch options for this title…")
        self._single_editor.textChanged.connect(self._on_single_text_changed)
        sv.addWidget(self._single_editor, stretch=1)
        self._single_count = QLabel("0 characters")
        self._single_count.setStyleSheet("color: #888; font-size: 11px;")
        sv.addWidget(self._single_count)
        row = QHBoxLayout()
        self._single_revert = QPushButton("Revert")
        self._single_revert.clicked.connect(self._single_revert_clicked)
        self._single_save = QPushButton("Save this game")
        self._single_save.clicked.connect(self._single_save_clicked)
        row.addWidget(self._single_revert)
        row.addWidget(self._single_save)
        row.addStretch(1)
        sv.addLayout(row)
        right.addTab(single, "Current game")

        # --- Batch tab ---
        batch = QWidget()
        bv = QVBoxLayout(batch)
        self._batch_info = QLabel("Check games in the table, choose an operation, then Preview.")
        self._batch_info.setWordWrap(True)
        bv.addWidget(self._batch_info)

        op_row = QHBoxLayout()
        op_row.addWidget(QLabel("Operation:"))
        self._batch_op = QComboBox()
        self._batch_op.addItems(
            [
                "Set entire string",
                "Prefix",
                "Suffix",
                "Find and replace",
                "Clear",
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
        ls.addWidget(QLabel("New launch options string:"))
        ls.addWidget(self._batch_set_text)
        self._batch_stack.addWidget(w_set)

        self._batch_prefix = QLineEdit()
        w_pre = QWidget()
        lp = QVBoxLayout(w_pre)
        lp.addWidget(QLabel("Text to prepend to the current value:"))
        lp.addWidget(self._batch_prefix)
        self._batch_stack.addWidget(w_pre)

        self._batch_suffix = QLineEdit()
        w_suf = QWidget()
        lsu = QVBoxLayout(w_suf)
        lsu.addWidget(QLabel("Text to append to the current value:"))
        lsu.addWidget(self._batch_suffix)
        self._batch_stack.addWidget(w_suf)

        self._batch_find = QLineEdit()
        self._batch_replace = QLineEdit()
        w_rep = QWidget()
        lr = QFormLayout(w_rep)
        lr.addRow("Find:", self._batch_find)
        lr.addRow("Replace with:", self._batch_replace)
        self._batch_stack.addWidget(w_rep)

        w_clear = QWidget()
        lcl = QVBoxLayout(w_clear)
        lcl.addWidget(QLabel("Clears launch options for all selected games."))
        self._batch_stack.addWidget(w_clear)

        bf = QGroupBox("Parameters")
        bfv = QVBoxLayout(bf)
        bfv.addWidget(self._batch_stack)
        bv.addWidget(bf)
        self._batch_set_text.textChanged.connect(self._invalidate_batch_preview)
        self._batch_prefix.textChanged.connect(self._invalidate_batch_preview)
        self._batch_suffix.textChanged.connect(self._invalidate_batch_preview)
        self._batch_find.textChanged.connect(self._invalidate_batch_preview)
        self._batch_replace.textChanged.connect(self._invalidate_batch_preview)

        btn_row = QHBoxLayout()
        self._batch_preview_btn = QPushButton("Preview")
        self._batch_preview_btn.clicked.connect(self._batch_preview_clicked)
        self._batch_apply_btn = QPushButton("Apply to selected games")
        self._batch_apply_btn.setEnabled(False)
        self._batch_apply_btn.clicked.connect(self._batch_apply_clicked)
        btn_row.addWidget(self._batch_preview_btn)
        btn_row.addWidget(self._batch_apply_btn)
        btn_row.addStretch(1)
        bv.addLayout(btn_row)

        self._batch_preview_table = QTableWidget(0, 4)
        self._batch_preview_table.setHorizontalHeaderLabels(["AppID", "Game", "Before", "After"])
        self._batch_preview_table.horizontalHeader().setStretchLastSection(True)
        bv.addWidget(self._batch_preview_table, stretch=1)

        self._batch_report = QPlainTextEdit()
        self._batch_report.setReadOnly(True)
        self._batch_report.setMaximumHeight(120)
        self._batch_report.setPlaceholderText("Apply results…")
        bv.addWidget(self._batch_report)

        right.addTab(batch, "Batch")
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
                "No numeric user folders were found under Steam userdata.\n"
                "Sign in to Steam at least once, then click Refresh.",
            )

    def closeEvent(self, event: QCloseEvent) -> None:
        if self._single_is_dirty():
            r = QMessageBox.question(
                self,
                self._app_name,
                "You have unsaved launch options for the current game. Close anyway?",
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
        self._populate_table_preserve_checks()

    def _reload_all(self) -> None:
        self._reload_accounts()
        if not self._account_id and self._account_combo.count() > 0:
            self._account_id = self._account_combo.currentText()
        self._reload_games_only()
        self._load_vdf_and_refresh_table()

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
        self._populate_table_preserve_checks()
        self._invalidate_batch_preview()
        self._refresh_single_from_selection()

    def _populate_table_preserve_checks(self) -> None:
        checked: set[int] = set()
        for r in range(self._table.rowCount()):
            it = self._table.item(r, 0)
            if it and it.checkState() == Qt.CheckState.Checked:
                aid = self._table.item(r, 1)
                if aid:
                    try:
                        checked.add(int(aid.text()))
                    except ValueError:
                        pass
        self._populate_table(checked)

    def _populate_table(self, checked_appids: set[int] | None = None) -> None:
        if checked_appids is None:
            checked_appids = set()
        self._table.blockSignals(True)
        self._table.setSortingEnabled(False)
        self._table.setRowCount(0)
        for g in self._games:
            lo = core.get_launch_options(self._vdf_root, g.appid)
            row = self._table.rowCount()
            self._table.insertRow(row)
            use = QTableWidgetItem("")
            use.setFlags(use.flags() | Qt.ItemFlag.ItemIsUserCheckable)
            use.setCheckState(
                Qt.CheckState.Checked if g.appid in checked_appids else Qt.CheckState.Unchecked
            )
            self._table.setItem(row, 0, use)
            id_item = QTableWidgetItem(str(g.appid))
            id_item.setFlags(id_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self._table.setItem(row, 1, id_item)
            name_item = QTableWidgetItem(g.name)
            name_item.setFlags(name_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self._table.setItem(row, 2, name_item)
            lo_display = lo if len(lo) <= 120 else lo[:117] + "…"
            lo_item = QTableWidgetItem(lo_display)
            lo_item.setFlags(lo_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            lo_item.setToolTip(lo.replace("\t", " ") if lo else "(empty)")
            lo_item.setData(Qt.ItemDataRole.UserRole, lo)
            self._table.setItem(row, 3, lo_item)
        self._table.setSortingEnabled(True)
        self._table.sortByColumn(2, Qt.SortOrder.AscendingOrder)
        self._table.blockSignals(False)
        self._apply_row_filter()

    def _apply_row_filter(self) -> None:
        q = self._filter_edit.text().strip().lower()
        for r in range(self._table.rowCount()):
            if not q:
                self._table.setRowHidden(r, False)
                continue
            id_txt = self._table.item(r, 1).text().lower() if self._table.item(r, 1) else ""
            name = self._table.item(r, 2).text().lower() if self._table.item(r, 2) else ""
            self._table.setRowHidden(r, q not in id_txt and q not in name)

    def _selected_appid_from_table(self) -> int | None:
        rows = self._table.selectionModel().selectedRows()
        if len(rows) != 1:
            return None
        r = rows[0].row()
        it = self._table.item(r, 1)
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
                "Save changes to the current game before switching?",
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
        self._refresh_single_from_selection()

    def _select_row_for_appid(self, appid: int | None) -> None:
        if appid is None:
            return
        for r in range(self._table.rowCount()):
            it = self._table.item(r, 1)
            if it and it.text() == str(appid):
                self._table.selectRow(r)
                return

    def _refresh_single_from_selection(self) -> None:
        aid = self._selected_appid_from_table()
        self._detail_appid = aid
        if aid is None:
            self._single_title.setText("Select a game from the list.")
            self._single_editor.blockSignals(True)
            self._single_editor.clear()
            self._single_editor.blockSignals(False)
            self._detail_baseline = ""
            self._single_revert.setEnabled(False)
            self._single_save.setEnabled(False)
            self._on_single_text_changed()
            self._update_window_dirty_title()
            return
        name = ""
        for r in range(self._table.rowCount()):
            it = self._table.item(r, 1)
            if it and it.text() == str(aid):
                n = self._table.item(r, 2)
                name = n.text() if n else ""
                break
        text = core.get_launch_options(self._vdf_root, aid)
        self._single_title.setText(f"{name}  (AppID {aid})")
        self._detail_baseline = text
        self._single_editor.blockSignals(True)
        self._single_editor.setPlainText(text)
        self._single_editor.blockSignals(False)
        self._single_revert.setEnabled(True)
        self._single_save.setEnabled(True)
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
        base = "Launch Options"
        if self._single_is_dirty():
            self.setWindowTitle(f"{base} — Unsaved changes")
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
            "Steam appears to be running. Writing localconfig.vdf while Steam is open can be "
            "overwritten or cause conflicts.\n\nContinue anyway?",
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
            msg = "Saved launch options."
            if bak:
                msg += f"\nBackup: {bak}"
            self.statusBar().showMessage(msg, 8000)
        except OSError as e:
            QMessageBox.critical(self, self._app_name, f"Save failed:\n{e}")

    def _update_row_launch_display(self, appid: int, lo: str) -> None:
        for r in range(self._table.rowCount()):
            it = self._table.item(r, 1)
            if it and it.text() == str(appid):
                lo_item = self._table.item(r, 3)
                if lo_item:
                    disp = lo if len(lo) <= 120 else lo[:117] + "…"
                    lo_item.setText(disp)
                    lo_item.setToolTip(lo.replace("\t", " ") if lo else "(empty)")
                    lo_item.setData(Qt.ItemDataRole.UserRole, lo)
                break

    def _checked_appids(self) -> list[int]:
        out: list[int] = []
        for r in range(self._table.rowCount()):
            if self._table.isRowHidden(r):
                continue
            use = self._table.item(r, 0)
            if use and use.checkState() == Qt.CheckState.Checked:
                it = self._table.item(r, 1)
                if it:
                    try:
                        out.append(int(it.text()))
                    except ValueError:
                        pass
        return sorted(set(out))

    def _game_name(self, appid: int) -> str:
        for g in self._games:
            if g.appid == appid:
                return g.name
        return str(appid)

    def _select_all_visible(self) -> None:
        for r in range(self._table.rowCount()):
            if self._table.isRowHidden(r):
                continue
            it = self._table.item(r, 0)
            if it:
                it.setCheckState(Qt.CheckState.Checked)
        self._invalidate_batch_preview()
        self._update_batch_info()

    def _select_none(self) -> None:
        for r in range(self._table.rowCount()):
            it = self._table.item(r, 0)
            if it:
                it.setCheckState(Qt.CheckState.Unchecked)
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
            self._status_steam.setText("Steam: running (close before editing for safest results)")
            self._status_steam.setStyleSheet("color: #ffb74d;")
        else:
            self._status_steam.setText("Steam: not detected as running")
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
        n = len(self._checked_appids())
        self._batch_info.setText(
            f"{n} game(s) checked for batch. Choose an operation, Preview, then Apply."
        )

    def _batch_op_name(self) -> str:
        names = ["set", "prefix", "suffix", "replace", "clear"]
        return names[self._batch_op.currentIndex()]

    def _batch_preview_clicked(self) -> None:
        if not self._account_id:
            QMessageBox.warning(self, self._app_name, "Select a Steam account (userdata folder) first.")
            return
        ids = self._checked_appids()
        self._update_batch_info()
        if not ids:
            QMessageBox.information(self, self._app_name, "Check at least one game in the table.")
            return
        op = self._batch_op_name()
        if op == "replace" and not self._batch_find.text():
            QMessageBox.warning(self, self._app_name, "Find text cannot be empty for find/replace.")
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
        self.statusBar().showMessage(f"Preview ready for {len(rows)} game(s).", 5000)

    def _batch_apply_clicked(self) -> None:
        if not self._account_id:
            return
        if not self._batch_preview_valid or not self._batch_preview_rows:
            QMessageBox.information(self, self._app_name, "Run Preview first.")
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
        self.statusBar().showMessage("Batch apply finished.", 8000)

    def showEvent(self, ev: QShowEvent) -> None:
        super().showEvent(ev)
        self._update_batch_info()

    def _on_table_item_changed(self, item: QTableWidgetItem) -> None:
        if item.column() == 0:
            self._invalidate_batch_preview()
            self._update_batch_info()


def open_launch_options_manager(parent: QWidget, app_display_name: str) -> None:
    steam = core.resolve_steam_install()
    if steam is None:
        QMessageBox.warning(
            parent,
            app_display_name,
            "Could not find a Steam installation (libraryfolders.vdf).\n"
            "Set STEAM_CLIENT to your Steam root if it is non-standard.",
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
