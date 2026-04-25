"""
Heuristic FFX stack version detection from PE DLL bytes (amdxcffx64.dll, etc.).

Used by sniff-dll-version.py and steam-sync-ui.py (Symlink-Steam).
Adjust ROLE_KEYWORDS if AMD renames embedded symbol strings.
"""
from __future__ import annotations

import re
from pathlib import Path

SEMVER_RE = re.compile(
    rb"(?<![0-9.])([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(?:\.[0-9]{1,5})?)(?![0-9.])"
)

ROLE_KEYWORDS: dict[str, tuple[tuple[str, int], ...]] = {
    "fsr": (
        ("fsr4", 5),
        ("ffxfsr4", 5),
        ("ffxfsr", 3),
        ("superresolution", 2),
        ("upscale", 1),
    ),
    "ml": (
        ("ffxmlfi", 5),
        ("mlfipass", 4),
        ("mlfi", 3),
        ("dilatemv", 3),
        ("dilate", 1),
    ),
    "framegen": (
        ("framegeneration", 5),
        ("dispatchdescframegeneration", 4),
        ("framegen", 3),
        ("multiframe", 3),
        ("mfg", 2),
    ),
}

ROLE_LABEL = {
    "framegen": "Frame Generation (MFG / frame dispatch)",
    "ml": "ML / MLFI",
    "fsr": "FSR (FSR4 / upscale)",
}

ROLE_ORDER = ("framegen", "ml", "fsr")

# Rough “FSR era” for whole DLL (not the same as per-role semver heuristics).
# - 4.x: FSR4 primary stack (4.1.x appears in this amdxcffx64 build family).
# - 3.x: classic FSR3 + FSR2 fallback pair (3.1.1 + 2.3.2) seen in smaller 1.0.0.xxx DLLs.
_SEMVER_4_1 = re.compile(rb"(?<![0-9.])4\.1\.[0-9]+(?![0-9.])")
_SEMVER_4_0 = re.compile(rb"(?<![0-9.])4\.0\.[0-9]+(?![0-9.])")
_SEMVER_3_1 = re.compile(rb"(?<![0-9.])3\.1\.[0-9]+(?![0-9.])")
_SEMVER_2_3 = re.compile(rb"(?<![0-9.])2\.3\.[0-9]+(?![0-9.])")


def infer_fsr_generation(data: bytes) -> tuple[str | None, str | None, str | None]:
    """
    Return (short_label, detail, numbers_line).

    numbers_line is a short human-readable stack summary, e.g.
    "FSR3 3.1.1 · FSR2 2.3.2 · ML 4.0.0" or "FSR4 4.1.0 · 3.1.x 3.1.6".
    """
    has_41 = bool(_SEMVER_4_1.search(data))
    has_311 = b"3.1.1" in data
    has_232 = b"2.3.2" in data
    has_31x = bool(_SEMVER_3_1.search(data))
    has_23x = bool(_SEMVER_2_3.search(data))

    if has_41:
        return (
            "4.x",
            "FSR4-era build (4.1.x token present in binary).",
            _format_4x_stack_numbers(data),
        )
    if has_311 and has_232:
        return (
            "3.x",
            "FSR3-era build (3.1.1 + 2.3.2 fallback pair; no 4.1.x token).",
            _format_3x_stack_numbers(data),
        )
    if has_31x and has_23x and not has_41:
        return (
            "3.x",
            "Likely FSR3-era (3.1.x + 2.3.x tokens; no 4.1.x).",
            _format_3x_stack_numbers(data),
        )
    return (None, None, "")


def compact_context(data: bytes, off: int, radius: int = 140) -> str:
    lo, hi = max(0, off - radius), min(len(data), off + radius)
    return "".join(
        chr(b)
        for b in data[lo:hi].lower()
        if (48 <= b <= 57) or (97 <= b <= 122)
    )


def score_roles(compact: str) -> dict[str, int]:
    scores = {role: 0 for role in ROLE_KEYWORDS}
    for role, pairs in ROLE_KEYWORDS.items():
        for needle, w in pairs:
            if needle in compact:
                scores[role] += w
    return scores


def pick_role(scores: dict[str, int]) -> str | None:
    best = max(scores.values())
    if best <= 0:
        return None
    for role in ("fsr", "ml", "framegen"):
        if scores[role] == best:
            return role
    return None


def ffx_nearby(data: bytes, off: int, radius: int = 96) -> bool:
    lo = max(0, off - radius)
    hi = min(len(data), off + radius)
    window = data[lo:hi]
    compact = window.lower().replace(b".", b"").replace(b"\x00", b"")
    return b"ffx" in compact or b"fsr" in compact


def _first_ffx_adjacent_semver(data: bytes, pattern: re.Pattern[bytes]) -> str | None:
    m = pattern.search(data)
    while m:
        if ffx_nearby(data, m.start()):
            return m.group(0).decode("ascii")
        m = pattern.search(data, m.start() + 1)
    return None


def _semver_family_pick(data: bytes, pattern: re.Pattern[bytes]) -> str | None:
    """Prefer FFX-adjacent hit; otherwise first occurrence (for small 3.x DLLs)."""
    v = _first_ffx_adjacent_semver(data, pattern)
    if v:
        return v
    m = pattern.search(data)
    return m.group(0).decode("ascii") if m else None


def _format_4x_stack_numbers(data: bytes) -> str:
    parts: list[str] = []
    v41 = _semver_family_pick(data, _SEMVER_4_1)
    v31 = _semver_family_pick(data, _SEMVER_3_1)
    if v41:
        parts.append(f"FSR4 {v41}")
    if v31:
        parts.append(f"3.1.x {v31}")
    return " · ".join(parts)


def _format_3x_stack_numbers(data: bytes) -> str:
    parts: list[str] = []
    v31 = _semver_family_pick(data, _SEMVER_3_1)
    v23 = _semver_family_pick(data, _SEMVER_2_3)
    v40 = _semver_family_pick(data, _SEMVER_4_0)
    if v31:
        parts.append(f"FSR3 {v31}")
    if v23:
        parts.append(f"FSR2 {v23}")
    if v40:
        parts.append(f"ML {v40}")
    return " · ".join(parts)


def iter_semver_matches(data: bytes, max_scan: int = 400_000):
    for n, m in enumerate(SEMVER_RE.finditer(data), start=1):
        if n > max_scan:
            break
        yield m.start(), m.group(1).decode("ascii", errors="ignore")


def classify_ffx_roles(data: bytes, max_scan: int = 400_000):
    best: dict[str, tuple[int, int, str]] = {}
    unclassified_ffx: list[tuple[int, str, dict[str, int]]] = []

    for off, tok in iter_semver_matches(data, max_scan=max_scan):
        compact = compact_context(data, off)
        scores = score_roles(compact)
        role = pick_role(scores)
        if role is None:
            if max(scores.values()) == 0 and ffx_nearby(data, off):
                unclassified_ffx.append((off, tok, scores))
            continue
        sc = scores[role]
        prev = best.get(role)
        if prev is None or sc > prev[0] or (sc == prev[0] and off < prev[1]):
            best[role] = (sc, off, tok)

    return best, unclassified_ffx


def analyze_ffx_versions_from_bytes(data: bytes, max_scan: int = 400_000) -> dict[str, str | None]:
    """Return version strings for framegen, ml, fsr + generation labels."""
    best, _ = classify_ffx_roles(data, max_scan=max_scan)
    out: dict[str, str | None] = {role: (best[role][2] if role in best else None) for role in ROLE_ORDER}
    gen, gen_detail, gen_nums = infer_fsr_generation(data)
    out["generation"] = gen
    out["generation_detail"] = gen_detail
    out["generation_numbers"] = gen_nums or None
    return out


def analyze_dll(path: Path | str, max_scan: int = 400_000) -> dict[str, str | None]:
    """
    Read DLL from disk and return {"framegen": "x.y.z"|None, "ml": ..., "fsr": ...}.
    On read error, all values None and key "_error" set.
    """
    p = Path(path)
    out: dict[str, str | None] = {
        "framegen": None,
        "ml": None,
        "fsr": None,
        "generation": None,
        "generation_detail": None,
        "generation_numbers": None,
    }
    try:
        data = p.read_bytes()
    except OSError as e:
        out["_error"] = str(e)
        return out
    out.update(analyze_ffx_versions_from_bytes(data, max_scan=max_scan))
    return out


def collect_semver_hits(
    data: bytes,
    max_occurrences_per_token: int = 4,
    max_scan_matches: int = 400_000,
) -> dict[str, list[int]]:
    from collections import defaultdict

    by_tok: dict[str, list[int]] = defaultdict(list)
    for n, m in enumerate(SEMVER_RE.finditer(data), start=1):
        if n > max_scan_matches:
            break
        tok = m.group(1).decode("ascii", errors="ignore")
        if len(by_tok[tok]) < max_occurrences_per_token:
            by_tok[tok].append(m.start())
    return dict(by_tok)


def ascii_snippet(data: bytes, off: int, before: int = 36, width: int = 90) -> str:
    lo = max(0, off - before)
    hi = min(len(data), off + width)
    chunk = data[lo:hi]
    safe = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
    return f"@{off:#x} ({off})  …{safe}…"
