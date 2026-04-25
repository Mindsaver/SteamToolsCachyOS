#!/usr/bin/env python3
"""
Quick peek at version-related data inside a PE DLL (e.g. amdxcffx64.dll).

- UTF-16 scan: VERSIONINFO keys (FileVersion, ProductVersion, …)
- Heuristic FFX roles: Frame Generation, ML (MLFI), FSR — from dll_ffx_versions
- Full list: semver-like tokens with offset + context
- Optional: pip install pefile for VS_VERSIONINFO parsing

Usage:
  python3 scripts/sniff-dll-version.py [path/to/file.dll]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dll_ffx_versions import (
    ROLE_LABEL,
    ROLE_ORDER,
    ascii_snippet,
    classify_ffx_roles,
    collect_semver_hits,
    ffx_nearby,
    infer_fsr_generation,
)

UTF16_KEYS = (
    "FileVersion",
    "ProductVersion",
    "ProductName",
    "FileDescription",
    "CompanyName",
    "LegalCopyright",
    "InternalName",
    "OriginalFilename",
)


def read_utf16_sz(data: bytes, off: int) -> tuple[str, int]:
    chars: list[str] = []
    j = off
    while j + 1 < len(data):
        code = data[j] | (data[j + 1] << 8)
        j += 2
        if code == 0:
            break
        if code < 0x110000:
            chars.append(chr(code))
    return "".join(chars), j


def utf16_key_values(data: bytes, key: str) -> list[str]:
    needle = key.encode("utf-16-le")
    out: list[str] = []
    pos = 0
    while True:
        i = data.find(needle, pos)
        if i == -1:
            break
        j = i + len(needle)
        while j + 1 <= len(data) and data[j : j + 2] == b"\x00\x00":
            j += 2
        val, _ = read_utf16_sz(data, j)
        if val and val != key and val not in out:
            out.append(val)
        pos = i + 1
    return out


def try_pefile(path: Path) -> None:
    try:
        import pefile  # type: ignore
    except ImportError:
        print("(pefile not installed — skipping structured parse. Try: pip install pefile)\n")
        return

    print("--- pefile VS_FIXEDFILEINFO / StringFileInfo (if present) ---")
    pe = pefile.PE(str(path), fast_load=True)
    pe.parse_data_directories(pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_RESOURCE"])

    if not hasattr(pe, "VS_VERSIONINFO") or not pe.VS_VERSIONINFO:
        print("(no VS_VERSIONINFO parsed)\n")
        return

    for vs in pe.VS_VERSIONINFO:
        if hasattr(vs, "FileInfo"):
            for fi in vs.FileInfo:
                for e in getattr(fi, "StringTable", []) or []:
                    for st_entry in getattr(e, "entries", {}).items():
                        k, v = st_entry
                        if isinstance(k, bytes):
                            k = k.decode("utf-16-le", errors="replace")
                        if isinstance(v, bytes):
                            v = v.decode("utf-16-le", errors="replace")
                        print(f"  {k}: {v}")
        ver = getattr(vs, "VS_FixedFileInfo", None)
        if ver is not None:
            ms = ver.get("FileVersionMS", 0)
            ls = ver.get("FileVersionLS", 0)
            print(
                f"  FileVersion (numeric): {(ms >> 16) & 0xFFFF}.{(ms) & 0xFFFF}."
                f"{(ls >> 16) & 0xFFFF}.{(ls) & 0xFFFF}"
            )
    print()


def main() -> int:
    ap = argparse.ArgumentParser(description="Sniff PE DLL for version strings")
    ap.add_argument(
        "dll",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "amdxcffx64.dll",
        help="Path to PE .dll (default: repo amdxcffx64.dll)",
    )
    args = ap.parse_args()
    path: Path = args.dll
    if not path.is_file():
        print(f"Not a file: {path}", file=sys.stderr)
        return 1

    data = path.read_bytes()
    print(f"File: {path.resolve()}")
    print(f"Size: {len(data):,} bytes\n")

    try_pefile(path)

    print("--- PE resource strings (UTF-16 key scan) ---")
    print(
        "Windows / Properties file version — often a *build* line, not the same as "
        "embedded FFX stack numbers below.\n"
    )
    found_any = False
    for key in UTF16_KEYS:
        vals = utf16_key_values(data, key)
        if vals:
            found_any = True
            for v in vals:
                print(f"  {key}: {v}")
    if not found_any:
        print("  (no matches)")
    print()

    gen, gen_detail, gen_nums = infer_fsr_generation(data)
    print("--- Estimated FSR driver generation ---")
    if gen and gen_detail:
        print(f"  {gen}: {gen_detail}")
        if gen_nums:
            print(f"  Stack numbers: {gen_nums}")
    else:
        print("  (could not infer 3.x vs 4.x — see semver list below)")
    print()

    best_roles, unclassified = classify_ffx_roles(data)
    print("--- Heuristic FFX stack versions (keyword context around x.y.z) ---")
    print(
        "Labels are inferred from nearby FFX symbol text (FrameGen / MLFI / FSR4). "
        "If AMD renames strings, update ROLE_KEYWORDS in dll_ffx_versions.py.\n"
    )
    for role in ROLE_ORDER:
        label = ROLE_LABEL[role]
        if role in best_roles:
            sc, off, tok = best_roles[role]
            print(f"  {label}:  {tok}  @ {off:#x} ({off})  [context score {sc}]")
            print(f"    {ascii_snippet(data, off)}")
        else:
            print(f"  {label}:  (no strong match in this DLL)")
        print()

    if unclassified:
        print("--- FFX-adjacent semver hits (no role matched; check manually) ---")
        for off, tok, _scores in unclassified[:12]:
            print(f"  {tok!r} @ {off:#x}")
            print(f"    {ascii_snippet(data, off)}")
        if len(unclassified) > 12:
            print(f"  … and {len(unclassified) - 12} more")
        print()

    print("--- All embedded x.y.z hits (deduped by token, with context) ---")
    hits = collect_semver_hits(data)
    for tok in sorted(hits.keys(), key=lambda t: (hits[t][0], t)):
        offs = hits[tok]
        near_ffx = [o for o in offs if ffx_nearby(data, o)]
        tag = "  [near ffx/fsr in ±96 bytes]" if near_ffx else ""
        print(f"  {tok!r} ({len(offs)} hit(s)) {tag}")
        for o in offs[:4]:
            print(f"    {ascii_snippet(data, o)}")
        if len(offs) > 4:
            print(f"    … ({len(offs) - 4} more)")
        print()

    print(
        "--- Notes ---\n"
        "  • PE FileVersion ≠ embedded FFX triplets; both can be valid for different purposes.\n"
        "  • Role labels are heuristics — verify on new DLLs if symbols change.\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
