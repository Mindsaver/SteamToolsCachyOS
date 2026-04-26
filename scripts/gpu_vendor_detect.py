"""Detect GPU vendors from Linux sysfs (DRM) with optional lspci fallback."""
from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

# PCI vendor IDs (lower 16 bits; sysfs may show 0x10de or 10de)
NVIDIA_VENDOR = 0x10DE
AMD_VENDORS = frozenset({0x1002, 0x1022})
INTEL_VENDOR = 0x8086


def _parse_vendor_hex(text: str) -> int | None:
    t = text.strip().lower().replace("0x", "")
    if not t:
        return None
    try:
        return int(t, 16)
    except ValueError:
        return None


def _card_sort_key(entry: Path) -> tuple[int, str]:
    m = re.match(r"^card(\d+)$", entry.name)
    return (int(m.group(1)), entry.name) if m else (9999, entry.name)


def _vendors_from_sysfs_ordered() -> tuple[list[int], set[int]]:
    """PCI vendor per DRM card in card0, card1, … order (matches typical iGPU-then-dGPU layout)."""
    ordered: list[int] = []
    found: set[int] = set()
    try:
        drm = Path("/sys/class/drm")
        if not drm.is_dir():
            return ordered, found
        entries = [e for e in drm.iterdir() if e.is_dir() and re.match(r"^card\d+$", e.name)]
        for entry in sorted(entries, key=_card_sort_key):
            vendor_path = entry / "device" / "vendor"
            if not vendor_path.is_file():
                continue
            try:
                vid = _parse_vendor_hex(vendor_path.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                continue
            if vid is not None:
                ordered.append(vid)
                found.add(vid)
    except OSError:
        return ordered, found
    return ordered, found


def _vendors_from_sysfs() -> set[int]:
    _ord, s = _vendors_from_sysfs_ordered()
    return s


_lspci_vendor_re = re.compile(r"\[([0-9a-fA-F]{4}):[0-9a-fA-F]{4}\]")


def _vendors_from_lspci() -> set[int]:
    out: set[int] = set()
    try:
        r = subprocess.run(
            ["lspci", "-nn"],
            capture_output=True,
            text=True,
            timeout=6,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return out
    if r.returncode != 0 or not r.stdout:
        return out
    for line in r.stdout.splitlines():
        if "VGA" not in line and "3D controller" not in line and "Display controller" not in line:
            continue
        for m in _lspci_vendor_re.finditer(line):
            try:
                out.add(int(m.group(1), 16))
            except ValueError:
                pass
    return out


@dataclass(frozen=True)
class GpuVendorInfo:
    has_amd: bool
    has_nvidia: bool
    has_intel: bool
    raw_vendors: frozenset[int]
    """DRM card0, card1, … PCI vendor IDs (order matters for laptop iGPU + dGPU)."""
    card_vendors_ordered: tuple[int, ...] = ()

    @property
    def hybrid(self) -> bool:
        return (self.has_intel and self.has_nvidia) or (self.has_intel and self.has_amd) or (
            self.has_amd and self.has_nvidia
        )

    @property
    def primary_discrete_hint(self) -> str:
        """Which vendor tab to open first: amd, nvidia, intel, or unknown."""
        # Prefer first non-Intel DRM card (usually dGPU after iGPU on hybrids).
        for vid in self.card_vendors_ordered:
            if vid == INTEL_VENDOR:
                continue
            if vid in AMD_VENDORS:
                return "amd"
            if vid == NVIDIA_VENDOR:
                return "nvidia"
        if self.card_vendors_ordered:
            return "intel"
        # No sysfs order (e.g. lspci-only): avoid wrongly preferring NVIDIA when both exist.
        if self.has_amd and self.has_nvidia:
            return "amd"
        if self.has_nvidia and not self.has_amd:
            return "nvidia"
        if self.has_amd and not self.has_nvidia:
            return "amd"
        if self.has_intel:
            return "intel"
        return "unknown"

    def summary_line(self) -> str:
        if not self.raw_vendors:
            return "GPU: not detected (no DRM PCI vendor info)."
        parts: list[str] = []
        if self.has_amd:
            parts.append("AMD")
        if self.has_nvidia:
            parts.append("NVIDIA")
        if self.has_intel:
            parts.append("Intel")
        base = "GPU detected: " + ", ".join(parts) if parts else "GPU: unknown vendor IDs"
        if self.hybrid:
            base += " — hybrid system (integrated + discrete). dGPU options may need DRI_PRIME=1 on some setups."
        return base


def detect_gpu_vendors() -> GpuVendorInfo:
    ordered, vendors = _vendors_from_sysfs_ordered()
    card_order = tuple(ordered)
    if not vendors:
        vendors = _vendors_from_lspci()
        card_order = ()
    has_amd = any(v in AMD_VENDORS for v in vendors)
    has_nvidia = NVIDIA_VENDOR in vendors
    has_intel = INTEL_VENDOR in vendors
    return GpuVendorInfo(
        has_amd=has_amd,
        has_nvidia=has_nvidia,
        has_intel=has_intel,
        raw_vendors=frozenset(vendors),
        card_vendors_ordered=card_order,
    )
