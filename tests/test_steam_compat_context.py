"""Tests for steam_compat_context."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import steam_compat_context as s  # noqa: E402


class ClassifyTests(unittest.TestCase):
    def test_inherits(self) -> None:
        self.assertEqual(
            s.classify_compat_source("Proton", None),
            s.CompatSource.INHERITS_DEFAULT,
        )

    def test_explicit_same(self) -> None:
        self.assertEqual(
            s.classify_compat_source("Proton", "Proton"),
            s.CompatSource.EXPLICIT_SAME_AS_DEFAULT,
        )

    def test_override(self) -> None:
        self.assertEqual(
            s.classify_compat_source("Proton Experimental", "Proton GE"),
            s.CompatSource.PER_GAME_OVERRIDE,
        )

    def test_override_no_default(self) -> None:
        self.assertEqual(
            s.classify_compat_source(None, "Proton GE"),
            s.CompatSource.PER_GAME_OVERRIDE,
        )


class TableCellTests(unittest.TestCase):
    def test_per_game_inherits_tooltip(self) -> None:
        txt, tip = s.table_per_game_cell("A", None, read_error=None)
        self.assertEqual(txt, "inherits")
        self.assertIn("default", tip.lower())

    def test_per_game_explicit_same(self) -> None:
        txt, tip = s.table_per_game_cell("X", "X", read_error=None)
        self.assertEqual(txt, "X")
        self.assertIn("explicit", tip.lower())

    def test_read_error_cells(self) -> None:
        d, _ = s.table_default_cell("P", read_error="boom")
        self.assertEqual(d, "—")
        p, pt = s.table_per_game_cell("P", "P", read_error="boom")
        self.assertEqual(p, "—")
        self.assertIn("boom", pt)


class MappingParseTests(unittest.TestCase):
    def test_get_names(self) -> None:
        m = {
            "0": {"name": "DefaultTool"},
            "123": {"name": "GameTool"},
        }
        self.assertEqual(s.get_default_tool_name(m), "DefaultTool")
        self.assertEqual(s.get_app_compat_entry_name(m, 123), "GameTool")
        self.assertIsNone(s.get_app_compat_entry_name(m, 999))


class LoadConfigTests(unittest.TestCase):
    def test_missing_file(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            steam = Path(td)
            (steam / "config").mkdir(parents=True)
            res = s.load_compat_tool_mapping(steam)
            self.assertIsNotNone(res.read_error)

    def test_loads_mapping_from_vdf(self) -> None:
        vdf_text = r'''
"InstallConfigStore"
{
    "Software"
    {
        "Valve"
        {
            "Steam"
            {
                "CompatToolMapping"
                {
                    "0"
                    {
                        "name"        "ProtonDefault"
                    }
                    "42"
                    {
                        "name"        "ProtonPerGame"
                    }
                }
            }
        }
    }
}
'''
        with tempfile.TemporaryDirectory() as td:
            steam = Path(td)
            cfg = steam / "config"
            cfg.mkdir(parents=True)
            (cfg / "config.vdf").write_text(vdf_text, encoding="utf-8")
            res = s.load_compat_tool_mapping(steam)
            self.assertIsNone(res.read_error)
            self.assertEqual(s.get_default_tool_name(res.entries), "ProtonDefault")
            self.assertEqual(s.get_app_compat_entry_name(res.entries, 42), "ProtonPerGame")


class UserSettingsHeuristicTests(unittest.TestCase):
    def test_none_without_file(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            self.assertIsNone(s.user_settings_global_note(Path(td)))

    def test_active_proton_line(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "user_settings.py").write_text(
                "# c\nuser_settings = {\n    'PROTON_LOG': '1',\n}\n",
                encoding="utf-8",
            )
            note = s.user_settings_global_note(d)
            self.assertIsNotNone(note)
            self.assertIn("user_settings", note.lower())

    def test_sample_only_no_note(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            body = "# x\nuser_settings = {}\n"
            (d / "user_settings.sample.py").write_text(body, encoding="utf-8")
            (d / "user_settings.py").write_text(body, encoding="utf-8")
            self.assertIsNone(s.user_settings_global_note(d))

    def test_env_overrides_parse(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "user_settings.py").write_text(
                "user_settings = {\n"
                "    'PROTON_LOG': '1',\n"
                "    'DXVK_HUD': 'fps',\n"
                "}\n",
                encoding="utf-8",
            )
            got = s.user_settings_env_overrides(d)
            self.assertEqual(got.get("PROTON_LOG"), "1")
            self.assertEqual(got.get("DXVK_HUD"), "fps")


class ResolveToolDirTests(unittest.TestCase):
    def test_direct_folder_name(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            steam = Path(td)
            tool = steam / "compatibilitytools.d" / "MyProton"
            tool.mkdir(parents=True)
            (tool / "compatibilitytool.vdf").write_text(
                '"compat_tools"\n{\n}\n',
                encoding="utf-8",
            )
            found = s.resolve_tool_install_dir(steam, "MyProton")
            self.assertEqual(found, tool)


class DetailHtmlTests(unittest.TestCase):
    def test_detail_includes_effective(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            steam = Path(td)
            m = {"0": {"name": "A"}, "1": {"name": "B"}}
            html = s.format_compat_detail_html(steam, m, 1, read_error=None)
            self.assertIn("B", html)
            self.assertIn("override", html.lower())
            self.assertIn("tool source", html.lower())


if __name__ == "__main__":
    unittest.main()
