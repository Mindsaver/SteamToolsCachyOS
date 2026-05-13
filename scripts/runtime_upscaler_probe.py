#!/usr/bin/env python3
"""
Probe running Linux processes for mapped upscaler DLLs (FSR/DLSS/XeSS).

Examples:
  python scripts/runtime_upscaler_probe.py
  python scripts/runtime_upscaler_probe.py --appid 730
  python scripts/runtime_upscaler_probe.py --json
  python scripts/runtime_upscaler_probe.py --watch 2
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any

PROC_ROOT = Path("/proc")
UPSCALER_HINTS = ("amdxcffx", "nvngx", "xess", "dlss")


def _read_text(path: Path) -> str:
    try:
        return path.read_text("utf-8", errors="ignore")
    except Exception:
        return ""


def _read_bytes(path: Path) -> bytes:
    try:
        return path.read_bytes()
    except Exception:
        return b""


def _parse_environ(pid: int) -> dict[str, str]:
    raw = _read_bytes(PROC_ROOT / str(pid) / "environ")
    if not raw:
        return {}
    out: dict[str, str] = {}
    for chunk in raw.split(b"\x00"):
        if not chunk or b"=" not in chunk:
            continue
        k, v = chunk.split(b"=", 1)
        out[k.decode("utf-8", errors="ignore")] = v.decode("utf-8", errors="ignore")
    return out


def _first_int(*values: str | None) -> int | None:
    for value in values:
        if not value:
            continue
        text = value.strip()
        if text.isdigit():
            return int(text)
    return None


def _indicator_state(env: dict[str, str]) -> str:
    if env.get("PROTON_FSR4_INDICATOR") == "1":
        return "fsr4-active"
    if (
        env.get("WINE_FULLSCREEN_FSR") == "1"
        or env.get("PROTON_ENABLE_AMD_FSR") == "1"
        or env.get("PROTON_FSR_INDICATOR") == "1"
    ):
        return "fsr-active"
    return "not-detected"


def _maps_paths(pid: int) -> list[str]:
    maps = _read_text(PROC_ROOT / str(pid) / "maps")
    if not maps:
        return []
    out: list[str] = []
    for line in maps.splitlines():
        parts = line.split()
        if len(parts) < 6:
            continue
        path = parts[-1]
        if path.startswith("/"):
            out.append(path)
    return out


def _maps_module_paths(pid: int) -> list[str]:
    maps = _read_text(PROC_ROOT / str(pid) / "maps")
    if not maps:
        return []
    out: list[str] = []
    for line in maps.splitlines():
        parts = line.split()
        if len(parts) < 6:
            continue
        candidate = parts[-1].strip()
        if not candidate or candidate.startswith("["):
            continue
        low = candidate.lower()
        if ".dll" in low or ".so" in low:
            out.append(candidate)
    return sorted(set(out))


def _maps_hint_paths(pid: int) -> list[str]:
    maps = _read_text(PROC_ROOT / str(pid) / "maps")
    if not maps:
        return []
    out: list[str] = []
    for line in maps.splitlines():
        low = line.lower()
        if not any(h in low for h in UPSCALER_HINTS):
            continue
        parts = line.split()
        candidate = parts[-1] if len(parts) >= 6 else line.strip()
        cand_low = candidate.lower()
        # Keep hints focused on likely mapped libraries, avoid random text/path noise.
        if not (cand_low.endswith(".dll") or cand_low.endswith(".so") or ".dll." in cand_low or ".so." in cand_low):
            continue
        if candidate:
            out.append(candidate)
    return sorted(set(out))


def _classify(paths: list[str]) -> dict[str, list[str]]:
    fsr: list[str] = []
    dlss: list[str] = []
    xess: list[str] = []
    for p in paths:
        name = os.path.basename(p).lower()
        full = p.lower()
        if "amdxcffx64.dll" in name or "amdxcffx64.dll" in full:
            fsr.append(p)
        elif "nvngx_dlss" in name or "nvngx" in name:
            dlss.append(p)
        elif "xess" in name or "libxess" in name:
            xess.append(p)
    return {
        "fsr": sorted(set(fsr)),
        "dlss": sorted(set(dlss)),
        "xess": sorted(set(xess)),
    }


def _pid_row(pid: int) -> dict[str, Any] | None:
    env = _parse_environ(pid)
    maps_paths = _maps_paths(pid)
    module_paths = _maps_module_paths(pid)
    hint_paths = _maps_hint_paths(pid)
    # Classify both strict map paths and hint paths so relative DLL paths
    # (e.g. "Human/libxess.dll") are counted correctly.
    mapped = _classify(sorted(set(module_paths + maps_paths + hint_paths)))
    if not mapped["fsr"] and not mapped["dlss"] and not mapped["xess"] and not hint_paths:
        return None

    comm = _read_text(PROC_ROOT / str(pid) / "comm").strip()
    exe = ""
    try:
        exe = os.readlink(PROC_ROOT / str(pid) / "exe")
    except Exception:
        pass
    cmdline_raw = _read_bytes(PROC_ROOT / str(pid) / "cmdline")
    cmdline = " ".join(x.decode("utf-8", errors="ignore") for x in cmdline_raw.split(b"\x00") if x)

    app_id = _first_int(
        env.get("SteamAppId"),
        env.get("STEAM_COMPAT_APP_ID"),
        env.get("STEAM_GAME_ID"),
    )
    indicator = _indicator_state(env)
    return {
        "pid": pid,
        "app_id": app_id,
        "indicator_state": indicator,
        "name": comm or None,
        "exe": exe or None,
        "cmdline": cmdline or None,
        "module_paths": module_paths,
        "mapped_dlls": mapped,
        "hint_paths": hint_paths,
    }


def _scan(appid_filter: int | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for ent in PROC_ROOT.iterdir():
        if not ent.name.isdigit():
            continue
        pid = int(ent.name)
        row = _pid_row(pid)
        if row is None:
            continue
        if appid_filter is not None and row["app_id"] != appid_filter:
            continue
        rows.append(row)
    rows.sort(key=lambda r: (r["app_id"] is None, r["app_id"] or 0, r["pid"]))
    return rows


def _group_by_app(rows: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, Any] = {}
    for row in rows:
        key = str(row["app_id"]) if row["app_id"] is not None else "unknown"
        if key not in grouped:
            grouped[key] = {
                "app_id": row["app_id"],
                "pids": [],
                "mapped_dlls": {"fsr": set(), "dlss": set(), "xess": set()},
                "hint_paths": set(),
                "indicator_states": set(),
            }
        grouped[key]["pids"].append(row["pid"])
        grouped[key]["indicator_states"].add(row["indicator_state"])
        for p in row.get("hint_paths", []):
            grouped[key]["hint_paths"].add(p)
        for fam in ("fsr", "dlss", "xess"):
            for p in row["mapped_dlls"][fam]:
                grouped[key]["mapped_dlls"][fam].add(p)

    for key in grouped:
        grouped[key]["pids"] = sorted(grouped[key]["pids"])
        grouped[key]["mapped_dlls"] = {
            "fsr": sorted(grouped[key]["mapped_dlls"]["fsr"]),
            "dlss": sorted(grouped[key]["mapped_dlls"]["dlss"]),
            "xess": sorted(grouped[key]["mapped_dlls"]["xess"]),
        }
        grouped[key]["hint_paths"] = sorted(grouped[key]["hint_paths"])
        grouped[key]["indicator_states"] = sorted(grouped[key]["indicator_states"])
    return grouped


def _pick_current_game(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    score_by_app: dict[int, int] = {}
    for row in rows:
        app_id = row.get("app_id")
        if app_id is None:
            continue
        score = 1
        mapped = row["mapped_dlls"]
        if mapped["fsr"]:
            score += 8
        if mapped["dlss"] or mapped["xess"]:
            score += 4
        if row.get("indicator_state") != "not-detected":
            score += 3
        cmdline = (row.get("cmdline") or "").lower()
        if "-shipping.exe" in cmdline:
            score += 2
        score_by_app[app_id] = score_by_app.get(app_id, 0) + score

    if not score_by_app:
        return None

    best_app_id = sorted(score_by_app.items(), key=lambda kv: kv[1], reverse=True)[0][0]
    grouped = _group_by_app(rows)
    candidate = grouped.get(str(best_app_id))
    if not candidate:
        return None
    candidate = dict(candidate)
    candidate["score"] = score_by_app[best_app_id]
    return candidate


def _collect_modules_for_app(rows: list[dict[str, Any]], app_id: int | None) -> list[str]:
    modules: set[str] = set()
    for row in rows:
        if row.get("app_id") != app_id:
            continue
        for mod in row.get("module_paths", []):
            modules.add(mod)
    return sorted(modules)


def _filter_modules(modules: list[str], pattern: str | None) -> list[str]:
    if not pattern:
        return modules
    try:
        import re

        rx = re.compile(pattern, re.IGNORECASE)
        return [m for m in modules if rx.search(m)]
    except Exception:
        return modules


def _print_human(rows: list[dict[str, Any]]) -> None:
    if not rows:
        print("No mapped FSR/DLSS/XeSS DLLs found in running processes.")
        return

    grouped = _group_by_app(rows)
    current = _pick_current_game(rows)
    print("Running process mappings:")
    print()
    if current is not None:
        print(f"Detected current game AppID: {current['app_id']} (score={current['score']})")
        print(f"  PIDs: {', '.join(str(x) for x in current['pids'])}")
        print(f"  Indicator: {', '.join(current['indicator_states']) or 'not-detected'}")
        print(f"  FSR DLLs: {len(current['mapped_dlls']['fsr'])}")
        for p in current["mapped_dlls"]["fsr"]:
            print(f"    - {p}")
        print(f"  DLSS DLLs: {len(current['mapped_dlls']['dlss'])}")
        for p in current["mapped_dlls"]["dlss"]:
            print(f"    - {p}")
        print(f"  XeSS DLLs: {len(current['mapped_dlls']['xess'])}")
        for p in current["mapped_dlls"]["xess"]:
            print(f"    - {p}")
        if current["hint_paths"]:
            print(f"  Other upscaler hint mappings: {len(current['hint_paths'])}")
            for p in current["hint_paths"][:20]:
                print(f"    - {p}")
        print()

    print("All detected AppID groups:")
    print()
    for key, g in grouped.items():
        print(f"AppID: {key}")
        print(f"  PIDs: {', '.join(str(x) for x in g['pids'])}")
        print(f"  Indicator: {', '.join(g['indicator_states']) or 'not-detected'}")
        print(f"  FSR DLLs: {len(g['mapped_dlls']['fsr'])}")
        for p in g["mapped_dlls"]["fsr"]:
            print(f"    - {p}")
        print(f"  DLSS DLLs: {len(g['mapped_dlls']['dlss'])}")
        for p in g["mapped_dlls"]["dlss"]:
            print(f"    - {p}")
        print(f"  XeSS DLLs: {len(g['mapped_dlls']['xess'])}")
        for p in g["mapped_dlls"]["xess"]:
            print(f"    - {p}")
        if g["hint_paths"]:
            print(f"  Other upscaler hint mappings: {len(g['hint_paths'])}")
            for p in g["hint_paths"][:20]:
                print(f"    - {p}")
        print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe running processes for mapped FSR/DLSS/XeSS DLLs")
    parser.add_argument("--appid", type=int, default=None, help="Only show processes for this Steam AppID")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--watch", type=float, default=0.0, help="Repeat every N seconds")
    parser.add_argument("--debug", action="store_true", help="Include scan diagnostics")
    parser.add_argument(
        "--dump-current-modules",
        action="store_true",
        help="Dump all mapped .dll/.so modules for detected current game candidate",
    )
    parser.add_argument(
        "--module-filter",
        default=None,
        help="Regex filter for --dump-current-modules (example: 'fsr|ffx|xess|nvngx|dxgi')",
    )
    args = parser.parse_args()

    def emit_once() -> None:
        rows = _scan(args.appid)
        current_game = _pick_current_game(rows)
        current_modules: list[str] = []
        if args.dump_current_modules and current_game is not None:
            current_modules = _collect_modules_for_app(rows, current_game.get("app_id"))
            current_modules = _filter_modules(current_modules, args.module_filter)
        diagnostics = None
        if args.debug:
            pid_count = 0
            visible_maps = 0
            for ent in PROC_ROOT.iterdir():
                if not ent.name.isdigit():
                    continue
                pid_count += 1
                maps_path = PROC_ROOT / ent.name / "maps"
                if maps_path.exists() and os.access(maps_path, os.R_OK):
                    visible_maps += 1
            diagnostics = {
                "pid_count": pid_count,
                "readable_maps_count": visible_maps,
                "appid_filter": args.appid,
            }
        if args.json:
            payload = {
                "timestamp_ms": int(time.time() * 1000),
                "rows": rows,
                "grouped": _group_by_app(rows),
                "detected_current_game": current_game,
                "current_game_modules": current_modules,
                "diagnostics": diagnostics,
            }
            print(json.dumps(payload, indent=2))
        else:
            if diagnostics:
                print(f"Diagnostics: pids={diagnostics['pid_count']} readable_maps={diagnostics['readable_maps_count']}")
                print()
            _print_human(rows)
            if args.dump_current_modules:
                print("Current game mapped modules (.dll/.so):")
                if not current_game:
                    print("  none (no detected current game)")
                elif not current_modules:
                    print("  none (no matching modules)")
                else:
                    print(f"  count: {len(current_modules)}")
                    for mod in current_modules:
                        print(f"  - {mod}")
                print()

    if args.watch > 0:
        try:
            while True:
                if args.json:
                    emit_once()
                else:
                    os.system("clear")
                    emit_once()
                time.sleep(max(0.2, args.watch))
        except KeyboardInterrupt:
            return 0
    else:
        emit_once()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

