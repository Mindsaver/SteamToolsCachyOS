"""Tests for launch_options_compose."""
from __future__ import annotations

import sys
from pathlib import Path

import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import launch_options_compose as c  # noqa: E402


class ParseSerializeTests(unittest.TestCase):
    def test_empty_roundtrip(self) -> None:
        m, w = c.parse_launch_options("")
        self.assertEqual(c.serialize_launch_options(m), c.COMMAND_TOKEN)
        self.assertFalse(w)

    def test_proton_log_mangohud(self) -> None:
        s = "PROTON_LOG=1 mangohud %command%"
        m, _ = c.parse_launch_options(s)
        self.assertEqual(m.env.get("PROTON_LOG"), "1")
        self.assertTrue(m.mangohud)
        self.assertEqual(c.serialize_launch_options(m), s)

    def test_suffix_vulkan(self) -> None:
        s = "%command% -vulkan"
        m, _ = c.parse_launch_options(s)
        self.assertIn("-vulkan", m.suffix_tokens)
        self.assertEqual(c.serialize_launch_options(m), s)

    def test_gamescope_fullscreen(self) -> None:
        s = "gamescope -f -- %command%"
        m, _ = c.parse_launch_options(s)
        self.assertIsNotNone(m.gamescope)
        assert m.gamescope is not None
        self.assertTrue(m.gamescope.fullscreen)
        out = c.serialize_launch_options(m)
        self.assertIn("gamescope", out)
        self.assertIn("-f", out)
        self.assertIn("%command%", out)

    def test_merge_snippet_empty(self) -> None:
        out = c.merge_snippet_prefix("", "PROTON_LOG=1")
        self.assertEqual(out, "PROTON_LOG=1 %command%")

    def test_merge_snippet_existing(self) -> None:
        out = c.merge_snippet_prefix("mangohud %command%", "PROTON_LOG=1")
        self.assertTrue(out.startswith("PROTON_LOG=1 mangohud"))
        self.assertIn("%command%", out)

    def test_no_command_warning(self) -> None:
        m, w = c.parse_launch_options("PROTON_LOG=1")
        self.assertEqual(m.env.get("PROTON_LOG"), "1")
        self.assertTrue(any("No %command%" in x for x in w))

    def test_disable_mesa_anti_lag_and_game_performance(self) -> None:
        s = "DISABLE_LAYER_MESA_ANTI_LAG=1 game-performance %command%"
        m, _ = c.parse_launch_options(s)
        self.assertEqual(m.env.get("DISABLE_LAYER_MESA_ANTI_LAG"), "1")
        self.assertTrue(m.game_performance)
        self.assertFalse(m.unknown_prefix_tokens)
        out = c.serialize_launch_options(m)
        self.assertIn("DISABLE_LAYER_MESA_ANTI_LAG=1", out)
        self.assertIn("game-performance", out)
        self.assertIn("%command%", out)


class GpuVendorTests(unittest.TestCase):
    def test_detect_runs(self) -> None:
        import gpu_vendor_detect as g

        info = g.detect_gpu_vendors()
        self.assertIsInstance(info.has_amd, bool)
        self.assertIsInstance(info.summary_line(), str)

    def test_primary_hint_intel_then_amd(self) -> None:
        import gpu_vendor_detect as g

        info = g.GpuVendorInfo(
            has_amd=True,
            has_nvidia=True,
            has_intel=True,
            raw_vendors=frozenset({0x8086, 0x1002, 0x10DE}),
            card_vendors_ordered=(0x8086, 0x1002),
        )
        self.assertEqual(info.primary_discrete_hint, "amd")

    def test_primary_hint_dual_vendor_no_order_prefers_amd(self) -> None:
        import gpu_vendor_detect as g

        info = g.GpuVendorInfo(
            has_amd=True,
            has_nvidia=True,
            has_intel=False,
            raw_vendors=frozenset({0x1002, 0x10DE}),
            card_vendors_ordered=(),
        )
        self.assertEqual(info.primary_discrete_hint, "amd")


if __name__ == "__main__":
    unittest.main()
