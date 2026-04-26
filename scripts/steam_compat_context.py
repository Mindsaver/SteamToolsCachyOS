"""Read-only Steam compatibility tool context from config.vdf and compatibilitytools.d."""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

import vdf


class CompatSource(Enum):
    """How per-appid compat relates to the global default (key \"0\")."""

    INHERITS_DEFAULT = "inherits_default"
    EXPLICIT_SAME_AS_DEFAULT = "explicit_same_as_default"
    PER_GAME_OVERRIDE = "per_game_override"


@dataclass(frozen=True)
class CompatToolMappingLoad:
    """Parsed CompatToolMapping table from config.vdf (empty if missing or on error)."""

    entries: dict[str, Any]
    read_error: str | None = None


def config_vdf_path(steam: Path) -> Path:
    return steam.resolve() / "config" / "config.vdf"


def compatibilitytools_d_root(steam: Path) -> Path:
    return steam.resolve() / "compatibilitytools.d"


def load_compat_tool_mapping(steam: Path) -> CompatToolMappingLoad:
    """Load InstallConfigStore → … → CompatToolMapping. Returns read_error on I/O or parse failure."""
    path = config_vdf_path(steam)
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return CompatToolMappingLoad({}, read_error=str(e))
    try:
        data = vdf.loads(text)
    except Exception as e:  # noqa: BLE001 — VDF library errors vary
        return CompatToolMappingLoad({}, read_error=str(e))
    if not isinstance(data, dict):
        return CompatToolMappingLoad({}, read_error="config.vdf root is not a mapping")
    inner = _navigate_compat_tool_mapping(data)
    if inner is None:
        return CompatToolMappingLoad({})
    if not isinstance(inner, dict):
        return CompatToolMappingLoad({}, read_error="CompatToolMapping is not a mapping")
    return CompatToolMappingLoad(inner)


def _navigate_compat_tool_mapping(root: dict[str, Any]) -> Any:
    ic = root.get("InstallConfigStore")
    if not isinstance(ic, dict):
        return None
    sw = ic.get("Software")
    if not isinstance(sw, dict):
        return None
    valve = sw.get("Valve")
    if not isinstance(valve, dict):
        return None
    steam = valve.get("Steam")
    if not isinstance(steam, dict):
        return None
    return steam.get("CompatToolMapping")


def _entry_tool_name(entry: Any) -> str | None:
    if not isinstance(entry, dict):
        return None
    n = entry.get("name")
    if n is None:
        return None
    s = str(n).strip()
    return s or None


def get_default_tool_name(mapping: dict[str, Any]) -> str | None:
    return _entry_tool_name(mapping.get("0"))


def get_app_compat_entry_name(mapping: dict[str, Any], appid: int) -> str | None:
    return _entry_tool_name(mapping.get(str(appid)))


def classify_compat_source(default_name: str | None, app_name: str | None) -> CompatSource:
    if app_name is None:
        return CompatSource.INHERITS_DEFAULT
    if default_name is None:
        return CompatSource.PER_GAME_OVERRIDE
    if app_name == default_name:
        return CompatSource.EXPLICIT_SAME_AS_DEFAULT
    return CompatSource.PER_GAME_OVERRIDE


def table_default_cell(default_name: str | None, *, read_error: str | None) -> tuple[str, str]:
    """(display, tooltip) for Compat (default) column."""
    if read_error:
        return "—", f"Could not read compatibility mapping:\n{read_error}"
    if default_name:
        return default_name, "Steam global default compatibility tool (CompatToolMapping key \"0\")."
    return "—", "No global default in CompatToolMapping."


def table_per_game_cell(
    default_name: str | None,
    app_name: str | None,
    *,
    read_error: str | None,
) -> tuple[str, str]:
    """(display, tooltip) for Compat (this game) column."""
    if read_error:
        return "—", f"Could not read compatibility mapping:\n{read_error}"
    src = classify_compat_source(default_name, app_name)
    if src is CompatSource.INHERITS_DEFAULT:
        return "inherits", "No per-game entry — uses the Steam default tool."
    assert app_name is not None
    if src is CompatSource.EXPLICIT_SAME_AS_DEFAULT:
        return app_name, (
            f"Per-game entry matches default ({app_name}). "
            "Steam stores an explicit appid row even when identical to key \"0\"."
        )
    return app_name, f"Per-game override (differs from default{f': {default_name}' if default_name else ''})."


def effective_tool_name(default_name: str | None, app_name: str | None) -> str | None:
    if app_name is not None:
        return app_name
    return default_name


def source_phrase(src: CompatSource) -> str:
    if src is CompatSource.INHERITS_DEFAULT:
        return "inherits Steam default"
    if src is CompatSource.EXPLICIT_SAME_AS_DEFAULT:
        return "explicit per-game entry (same as default)"
    return "per-game override"


def resolve_tool_install_dir(steam: Path, internal_name: str) -> Path | None:
    """Find compatibilitytools.d folder for internal tool name (folder or compat_tools key)."""
    root = compatibilitytools_d_root(steam)
    if not root.is_dir():
        return None
    iname = internal_name.strip()
    if not iname:
        return None
    direct = root / iname
    if direct.is_dir() and (direct / "compatibilitytool.vdf").is_file():
        return direct
    try:
        for sub in sorted(root.iterdir()):
            if not sub.is_dir():
                continue
            vdf_path = sub / "compatibilitytool.vdf"
            if not vdf_path.is_file():
                continue
            if _vdf_lists_compat_tool(vdf_path, iname):
                return sub
    except OSError:
        return None
    return None


def _vdf_lists_compat_tool(vdf_path: Path, internal_name: str) -> bool:
    try:
        raw = vdf_path.read_text(encoding="utf-8", errors="replace")
        data = vdf.loads(raw)
    except Exception:  # noqa: BLE001
        return False
    if not isinstance(data, dict):
        return False
    ct = data.get("compat_tools")
    if isinstance(ct, dict) and internal_name in ct:
        return True
    for v in data.values():
        if isinstance(v, dict):
            ct2 = v.get("compat_tools")
            if isinstance(ct2, dict) and internal_name in ct2:
                return True
    return False


_PROTON_ENV_RE = re.compile(r"(PROTON_|DXVK_|WINEDLLOVERRIDES|VKD3D_)", re.I)
_USER_SETTINGS_KV_RE = re.compile(r"""['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*:\s*['"]([^'"]*)['"]""")


def _strip_py_comments_and_strings(text: str) -> str:
    """Rough strip for comparison/heuristic — not a full parser."""
    out_lines: list[str] = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("#"):
            continue
        if "#" in line:
            line = line.split("#", 1)[0]
        out_lines.append(line)
    return "\n".join(out_lines)


def user_settings_global_note(tool_dir: Path | None) -> str | None:
    """Short UI label if user_settings.py looks non-trivial for this tool directory."""
    if tool_dir is None or not tool_dir.is_dir():
        return None
    us = tool_dir / "user_settings.py"
    if not us.is_file():
        return None
    try:
        text = us.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    sample = tool_dir / "user_settings.sample.py"
    stripped = _strip_py_comments_and_strings(text).strip()
    if not stripped:
        return None
    if sample.is_file():
        try:
            sample_text = sample.read_text(encoding="utf-8", errors="replace")
        except OSError:
            sample_text = ""
        if sample_text and _strip_py_comments_and_strings(text) == _strip_py_comments_and_strings(sample_text):
            return None
    if _user_settings_looks_active(text):
        return "Global Proton user_settings.py (this tool) appears customized — affects all games using this build."
    return None


def user_settings_env_overrides(tool_dir: Path | None) -> dict[str, str]:
    """Best-effort env key/value extraction from user_settings.py for global UI markers."""
    if tool_dir is None or not tool_dir.is_dir():
        return {}
    us = tool_dir / "user_settings.py"
    if not us.is_file():
        return {}
    try:
        text = us.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}
    if not _user_settings_looks_active(text):
        return {}
    sample_text = ""
    sample = tool_dir / "user_settings.sample.py"
    if sample.is_file():
        try:
            sample_text = sample.read_text(encoding="utf-8", errors="replace")
        except OSError:
            sample_text = ""
    parsed = _extract_user_settings_kv(text)
    if not parsed:
        return {}
    if sample_text:
        sample_parsed = _extract_user_settings_kv(sample_text)
        # Hide keys identical to shipped sample defaults; show only user divergence.
        for k in list(parsed.keys()):
            if sample_parsed.get(k) == parsed.get(k):
                parsed.pop(k, None)
    return parsed


def _extract_user_settings_kv(text: str) -> dict[str, str]:
    body = _strip_py_comments_and_strings(text)
    out: dict[str, str] = {}
    for m in _USER_SETTINGS_KV_RE.finditer(body):
        out[m.group(1)] = m.group(2)
    return out


def _user_settings_looks_active(text: str) -> bool:
    body = _strip_py_comments_and_strings(text)
    if not body.strip():
        return False
    if _PROTON_ENV_RE.search(body):
        return True
    if "user_settings" in body and "{" in body:
        inner = re.search(r"user_settings\s*=\s*\{([^}]*)\}", body, re.DOTALL)
        if inner:
            block = inner.group(1)
            for line in block.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if ":" in line or "=" in line:
                    return True
    return False


def format_compat_detail_html(
    steam: Path,
    mapping: dict[str, Any],
    appid: int,
    *,
    read_error: str | None,
) -> str:
    """Rich-text lines for the per-game compat banner (empty if nothing to say)."""
    if read_error:
        return (
            "<span style='color:#ffcc80;'>Compatibility:</span> "
            f"<span style='color:#eee;'>could not read config.vdf ({read_error})</span>"
        )
    default_n = get_default_tool_name(mapping)
    app_n = get_app_compat_entry_name(mapping, appid)
    eff = effective_tool_name(default_n, app_n)
    src = classify_compat_source(default_n, app_n)
    if eff is None and default_n is None:
        return (
            "<span style='color:#aaa;'>Compatibility:</span> "
            "<span style='color:#ccc;'>no CompatToolMapping data for this install.</span>"
        )
    eff_disp = eff or "—"
    phrase = source_phrase(src)
    line1 = (
        f"<span style='color:#aaa;'>Compatibility (Steam mapping):</span> "
        f"<span style='color:#e0e0e0;'>{eff_disp}</span> "
        f"<span style='color:#888;'>— {phrase}</span>"
    )
    tool_dir = resolve_tool_install_dir(steam, eff) if eff else None
    if tool_dir is not None:
        source_line = (
            "<br/><span style='color:#aaa;'>Tool source:</span> "
            f"<span style='color:#b3e5fc;'>compatibilitytools.d/{tool_dir.name}</span>"
        )
    else:
        source_line = (
            "<br/><span style='color:#aaa;'>Tool source:</span> "
            "<span style='color:#ccc;'>not found in compatibilitytools.d "
            "(likely Steam built-in / runtime)</span>"
        )
    us = user_settings_global_note(tool_dir)
    if us:
        line3 = f"<br/><span style='color:#aaa;'>Global:</span> <span style='color:#aed581;'>{us}</span>"
        return line1 + source_line + line3
    return line1 + source_line

