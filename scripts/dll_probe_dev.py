#!/usr/bin/env python3
"""
Developer DLL probe for FSR/DLSS/XeSS version readout debugging.

Usage:
  python scripts/dll_probe_dev.py /path/to/amdxcffx64.dll
  python scripts/dll_probe_dev.py /path/to/file.dll --json
  python scripts/dll_probe_dev.py /path/to/file.dll --nearby 5
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

SEMVER_RE = re.compile(r"(?<![0-9.])(\d{1,3}\.\d{1,3}\.\d{1,3}(?:\.\d{1,5})?)(?![0-9.])")

ROLE_KEYWORDS = {
    "fsr": ["fsr4", "ffxfsr4", "ffxfsr", "superresolution", "upscale"],
    "mlfi": ["ffxmlfi", "mlfipass", "mlfi", "dilatemv", "dilate"],
    "framegen": ["framegeneration", "dispatchdescframegeneration", "framegen", "multiframe", "mfg"],
    "dlss": ["dlss", "nvngx"],
    "xess": ["xess", "libxess"],
}


def extract_ascii_strings(data: bytes, min_len: int = 4) -> list[str]:
    out: list[str] = []
    start = -1
    for i, b in enumerate(data):
        if 0x20 <= b <= 0x7E:
            if start == -1:
                start = i
        else:
            if start != -1 and i - start >= min_len:
                out.append(data[start:i].decode("ascii", errors="ignore"))
            start = -1
    if start != -1 and len(data) - start >= min_len:
        out.append(data[start:].decode("ascii", errors="ignore"))
    return out


def best_semver(versions: list[str]) -> str | None:
    if not versions:
        return None

    def key(v: str) -> tuple[int, int, int, int]:
        parts = [int(p) for p in v.split(".")]
        while len(parts) < 4:
            parts.append(0)
        return tuple(parts[:4])  # type: ignore[return-value]

    return sorted(set(versions), key=key, reverse=True)[0]


def all_versions(strings: list[str]) -> list[str]:
    versions: set[str] = set()
    for s in strings:
        for m in SEMVER_RE.finditer(s):
            v = m.group(1)
            if v == "0.0.0" or v.startswith("0.0."):
                continue
            versions.add(v)
    return sorted(versions)


def role_hits(strings: list[str], role: str) -> list[dict]:
    kws = ROLE_KEYWORDS[role]
    hits: list[dict] = []
    for i, s in enumerate(strings):
        lower = s.lower()
        matched = [k for k in kws if k in lower]
        if not matched:
            continue
        versions = [m.group(1) for m in SEMVER_RE.finditer(s) if not m.group(1).startswith("0.0.")]
        hits.append(
            {
                "index": i,
                "matched_keywords": matched,
                "line_preview": s[:220],
                "line_versions": versions,
            }
        )
    return hits


def role_pick(strings: list[str], role: str, nearby_window: int = 3) -> dict:
    kws = ROLE_KEYWORDS[role]
    best: tuple[str, int, int, str] | None = None
    # (version, score, string_index, source_line)

    for i, s in enumerate(strings):
        lower = s.lower()
        kw_positions = [lower.find(k) for k in kws if k in lower]
        if not kw_positions:
            continue
        kw_pos = min(kw_positions)

        start = max(0, i - nearby_window)
        end = min(len(strings) - 1, i + nearby_window)
        for j in range(start, end + 1):
            line = strings[j]
            for m in SEMVER_RE.finditer(line):
                v = m.group(1)
                if v == "0.0.0" or v.startswith("0.0."):
                    continue
                local_dist = abs(m.start() - kw_pos) if j == i else 200
                before_penalty = 500 if j == i and m.start() < kw_pos else 0
                window_penalty = abs(j - i) * 100
                score = local_dist + before_penalty + window_penalty
                if best is None or score < best[1]:
                    best = (v, score, j, line[:220])
                elif score == best[1]:
                    winner = best_semver([best[0], v])
                    if winner and winner != best[0]:
                        best = (winner, score, j, line[:220])

    return {
        "role": role,
        "picked_version": best[0] if best else None,
        "score": best[1] if best else None,
        "source_index": best[2] if best else None,
        "source_preview": best[3] if best else None,
    }


def probe(path: Path, nearby: int) -> dict:
    data = path.read_bytes()
    strings = extract_ascii_strings(data)
    versions = all_versions(strings)
    return {
        "file": str(path),
        "size_bytes": len(data),
        "string_count": len(strings),
        "all_versions": versions,
        "highest_version": best_semver(versions),
        "roles": {
            role: {
                "pick": role_pick(strings, role, nearby_window=nearby),
                "hits": role_hits(strings, role)[:25],
            }
            for role in ROLE_KEYWORDS
        },
    }


def main() -> int:
    p = argparse.ArgumentParser(description="Debug DLL version readout decisions")
    p.add_argument("dll_path", help="DLL path to analyze")
    p.add_argument("--nearby", type=int, default=3, help="Neighbor string window for role scoring")
    p.add_argument("--json", action="store_true", help="Output JSON only")
    args = p.parse_args()

    dll = Path(args.dll_path).expanduser()
    if not dll.exists():
        print(f"ERROR: file does not exist: {dll}")
        return 2
    if not dll.is_file():
        print(f"ERROR: not a file: {dll}")
        return 2

    result = probe(dll, nearby=max(1, args.nearby))
    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    print(f"File: {result['file']}")
    print(f"Size: {result['size_bytes']} bytes")
    print(f"Extracted strings: {result['string_count']}")
    print(f"All version candidates ({len(result['all_versions'])}): {', '.join(result['all_versions']) or 'none'}")
    print(f"Highest semver: {result['highest_version'] or 'none'}")
    print()
    for role, info in result["roles"].items():
        pick = info["pick"]
        print(f"[{role}] pick: {pick['picked_version'] or 'none'} (score={pick['score']})")
        hits = info["hits"]
        print(f"  hits: {len(hits)}")
        for h in hits[:5]:
            line = h["line_preview"].replace("\n", " ")
            print(f"   - idx {h['index']}: kw={','.join(h['matched_keywords'])} versions={h['line_versions']} :: {line}")
        if len(hits) > 5:
            print(f"   ... {len(hits) - 5} more")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

