"""Parse and serialize Steam per-game launch option strings (ProtonPlus-style presets)."""
from __future__ import annotations

import re
import shlex
from dataclasses import dataclass, field
from typing import Iterable

COMMAND_TOKEN = "%command%"

# Preset prefixes for batch insert (no trailing %command% — merge adds it when needed)
BATCH_SNIPPET_CHOICES: tuple[tuple[str, str], ...] = (
    ("proton_log", "PROTON_LOG=1"),
    ("mangohud", "mangohud"),
    ("gamemode", "gamemode"),
    ("game_performance", "game-performance"),
    ("mangohud_gamemode", "mangohud gamemode"),
    ("proton_log_mangohud", "PROTON_LOG=1 mangohud"),
    ("wined3d", "PROTON_USE_WINED3D=1"),
)


def merge_snippet_prefix(current: str, snippet: str) -> str:
    """Insert snippet tokens before existing prefix (and before %command% if present)."""
    sn = snippet.strip()
    cur = (current or "").strip()
    if not sn:
        return cur
    if not cur:
        return f"{sn} {COMMAND_TOKEN}".strip()
    if COMMAND_TOKEN in cur:
        a, _sep, c = cur.partition(COMMAND_TOKEN)
        left = f"{sn} {a.strip()}".strip()
        tail = c.strip()
        if tail:
            return f"{left} {COMMAND_TOKEN} {tail}".strip()
        return f"{left} {COMMAND_TOKEN}".strip()
    return f"{sn} {cur}".strip()


@dataclass
class GamescopeConfig:
    fullscreen: bool = False
    hdr: bool = False
    vrr: bool = False  # adaptive sync / VRR-style flag
    frame_limit: int | None = None
    width: int | None = None
    height: int | None = None
    extra_args: list[str] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not (
            self.fullscreen
            or self.hdr
            or self.vrr
            or self.frame_limit is not None
            or self.width is not None
            or self.height is not None
            or self.extra_args
        )


@dataclass
class LaunchOptionsModel:
    """Structured launch options before %command% and after."""

    env: dict[str, str] = field(default_factory=dict)
    env_order: list[str] = field(default_factory=list)
    mangohud: bool = False
    gamemode: bool = False
    game_performance: bool = False  # KDE / distro "game-performance" wrapper before %command%
    gamescope: GamescopeConfig | None = None
    suffix_tokens: list[str] = field(default_factory=list)
    unknown_prefix_tokens: list[str] = field(default_factory=list)

    def copy(self) -> LaunchOptionsModel:
        gs = self.gamescope
        return LaunchOptionsModel(
            env=dict(self.env),
            env_order=list(self.env_order),
            mangohud=self.mangohud,
            gamemode=self.gamemode,
            game_performance=self.game_performance,
            gamescope=(
                None
                if gs is None
                else GamescopeConfig(
                    fullscreen=gs.fullscreen,
                    hdr=gs.hdr,
                    vrr=gs.vrr,
                    frame_limit=gs.frame_limit,
                    width=gs.width,
                    height=gs.height,
                    extra_args=list(gs.extra_args),
                )
            ),
            suffix_tokens=list(self.suffix_tokens),
            unknown_prefix_tokens=list(self.unknown_prefix_tokens),
        )


def _set_env(model: LaunchOptionsModel, key: str, value: str) -> None:
    model.env[key] = value
    if key not in model.env_order:
        model.env_order.append(key)


def _del_env(model: LaunchOptionsModel, key: str) -> None:
    model.env.pop(key, None)
    model.env_order = [k for k in model.env_order if k != key]


def _looks_env_token(t: str) -> bool:
    if "=" not in t or t.startswith("="):
        return False
    key, _val = t.split("=", 1)
    if not key or not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", key):
        return False
    return True


def _normalize_mangohud_in_env(model: LaunchOptionsModel) -> None:
    """MANGOHUD=1 and similar -> mangohud wrapper flag."""
    for k in list(model.env.keys()):
        if k.upper() == "MANGOHUD" and model.env.get(k, "").strip() in ("1", "true", "TRUE", "yes"):
            model.mangohud = True
            _del_env(model, k)


def _parse_gamescope_tokens(tokens: list[str]) -> tuple[GamescopeConfig, int]:
    """Consume gamescope argv starting at tokens[0]=='gamescope'; returns config and count consumed."""
    cfg = GamescopeConfig()
    if not tokens or tokens[0] != "gamescope":
        return cfg, 0
    i = 1
    while i < len(tokens):
        tok = tokens[i]
        if tok in ("-f", "--fullscreen"):
            cfg.fullscreen = True
            i += 1
            continue
        if tok in ("--hdr-enabled", "--hdr"):
            cfg.hdr = True
            i += 1
            continue
        if tok in ("-O", "--adaptive-sync", "--vr"):
            cfg.vrr = True
            i += 1
            continue
        if tok in ("-r", "--framerate", "-R"):
            if i + 1 < len(tokens) and tokens[i + 1].isdigit():
                cfg.frame_limit = int(tokens[i + 1])
                i += 2
                continue
        if tok in ("-W", "--output-width") and i + 1 < len(tokens) and tokens[i + 1].isdigit():
            cfg.width = int(tokens[i + 1])
            i += 2
            continue
        if tok in ("-H", "--output-height") and i + 1 < len(tokens) and tokens[i + 1].isdigit():
            cfg.height = int(tokens[i + 1])
            i += 2
            continue
        if tok == "--":
            i += 1
            break
        if tok.startswith("-"):
            cfg.extra_args.append(tok)
            i += 1
            if i < len(tokens) and not tokens[i].startswith("-"):
                cfg.extra_args.append(tokens[i])
                i += 1
            continue
        cfg.extra_args.append(tok)
        i += 1
    return cfg, i


def parse_launch_options(s: str) -> tuple[LaunchOptionsModel, list[str]]:
    """Split launch string into model + human warnings."""
    warnings: list[str] = []
    raw = (s or "").strip()
    model = LaunchOptionsModel()

    if COMMAND_TOKEN not in raw:
        if not raw:
            return model, warnings
        try:
            tokens = shlex.split(raw)
        except ValueError as e:
            warnings.append(f"Could not parse launch text: {e}")
            model.unknown_prefix_tokens = [raw]
            return model, warnings
        i = 0
        while i < len(tokens):
            t = tokens[i]
            if _looks_env_token(t):
                k, v = t.split("=", 1)
                _set_env(model, k, v)
                i += 1
                continue
            if t.lower() == "mangohud":
                model.mangohud = True
                i += 1
                continue
            if t == "gamemode":
                model.gamemode = True
                i += 1
                continue
            if t == "game-performance":
                model.game_performance = True
                i += 1
                continue
            if t == "gamescope":
                cfg, consumed = _parse_gamescope_tokens(tokens[i:])
                if consumed > 0:
                    model.gamescope = cfg
                    i += consumed
                continue
            model.unknown_prefix_tokens.append(t)
            i += 1
        _normalize_mangohud_in_env(model)
        warnings.append("No %command% in launch options — Steam normally requires it.")
        return model, warnings

    left, _, right = raw.partition(COMMAND_TOKEN)
    left = left.strip()
    right = right.strip()
    if COMMAND_TOKEN in right:
        warnings.append("Multiple %command% placeholders — extra text kept in suffix.")

    try:
        tokens = shlex.split(left) if left else []
    except ValueError as e:
        warnings.append(f"Could not parse prefix shell text: {e}")
        model.unknown_prefix_tokens = [left] if left else []
        try:
            model.suffix_tokens = shlex.split(right) if right else []
        except ValueError:
            model.suffix_tokens = [right] if right else []
        return model, warnings

    i = 0
    while i < len(tokens):
        t = tokens[i]
        if _looks_env_token(t):
            k, v = t.split("=", 1)
            _set_env(model, k, v)
            i += 1
            continue
        if t.lower() == "mangohud":
            model.mangohud = True
            i += 1
            continue
        if t == "gamemode":
            model.gamemode = True
            i += 1
            continue
        if t == "game-performance":
            model.game_performance = True
            i += 1
            continue
        if t == "gamescope":
            cfg, consumed = _parse_gamescope_tokens(tokens[i:])
            if consumed > 0:
                model.gamescope = cfg
                i += consumed
            continue
        if t in ("scopebuddy", "scb"):
            # Treat as unknown wrapper token but common; keep in unknown
            model.unknown_prefix_tokens.append(t)
            i += 1
            continue
        model.unknown_prefix_tokens.append(t)
        i += 1

    _normalize_mangohud_in_env(model)

    try:
        model.suffix_tokens = shlex.split(right) if right else []
    except ValueError:
        model.suffix_tokens = [right] if right else []

    return model, warnings


def _serialize_gamescope(gs: GamescopeConfig) -> list[str]:
    out = ["gamescope"]
    if gs.fullscreen:
        out.append("-f")
    if gs.hdr:
        out.append("--hdr-enabled")
    if gs.vrr:
        out.append("-O")
    if gs.width is not None:
        out.extend(["-W", str(gs.width)])
    if gs.height is not None:
        out.extend(["-H", str(gs.height)])
    if gs.frame_limit is not None:
        out.extend(["-r", str(gs.frame_limit)])
    out.extend(gs.extra_args)
    out.append("--")
    return out


def serialize_launch_options(model: LaunchOptionsModel) -> str:
    parts: list[str] = []

    for t in model.unknown_prefix_tokens:
        parts.append(shlex.quote(t))

    seen_env: set[str] = set()
    for key in model.env_order:
        if key in model.env and key not in seen_env:
            parts.append(shlex.quote(f"{key}={model.env[key]}"))
            seen_env.add(key)
    for key in sorted(model.env.keys()):
        if key not in seen_env:
            parts.append(shlex.quote(f"{key}={model.env[key]}"))
            seen_env.add(key)

    if model.mangohud:
        parts.append("mangohud")
    if model.gamemode:
        parts.append("gamemode")
    if model.game_performance:
        parts.append("game-performance")

    if model.gamescope is not None:
        parts.extend(shlex.quote(x) for x in _serialize_gamescope(model.gamescope))

    prefix = " ".join(parts).strip()
    suf = " ".join(shlex.quote(t) for t in model.suffix_tokens).strip()
    mid = COMMAND_TOKEN
    if prefix and suf:
        return f"{prefix} {mid} {suf}"
    if prefix:
        return f"{prefix} {mid}"
    if suf:
        return f"{mid} {suf}"
    return mid


def model_from_full_string(s: str) -> LaunchOptionsModel:
    m, _ = parse_launch_options(s)
    return m


def has_unrepresented_tokens(model: LaunchOptionsModel) -> bool:
    return bool(model.unknown_prefix_tokens)


# --- Presets (tier / risk for UI) ---


@dataclass(frozen=True)
class TogglePreset:
    id: str
    label: str
    tooltip: str
    tier: int
    risk: str  # "safe" | "experimental"


_ENV_PRESETS: list[tuple[TogglePreset, str, str]] = [
    (
        TogglePreset(
            id="proton_log",
            label="Proton log file",
            tooltip="Writes ~/steam-<appid>.log for debugging (Valve FAQ).",
            tier=1,
            risk="safe",
        ),
        "PROTON_LOG",
        "1",
    ),
    (
        TogglePreset(
            id="dxvk_hud_fps",
            label="DXVK HUD (fps)",
            tooltip="DXVK on-screen HUD with fps (Proton FAQ / DXVK README).",
            tier=1,
            risk="safe",
        ),
        "DXVK_HUD",
        "fps",
    ),
    (
        TogglePreset(
            id="proton_wined3d",
            label="WineD3D (OpenGL)",
            tooltip="Force OpenGL WineD3D instead of DXVK when Vulkan fails (lower performance).",
            tier=1,
            risk="safe",
        ),
        "PROTON_USE_WINED3D",
        "1",
    ),
    (
        TogglePreset(
            id="proton_no_esync",
            label="Disable esync",
            tooltip="PROTON_NO_ESYNC=1 — try if you see stutter or sync issues.",
            tier=1,
            risk="safe",
        ),
        "PROTON_NO_ESYNC",
        "1",
    ),
    (
        TogglePreset(
            id="proton_no_fsync",
            label="Disable fsync",
            tooltip="PROTON_NO_FSYNC=1 — try if you see stutter or sync issues.",
            tier=1,
            risk="safe",
        ),
        "PROTON_NO_FSYNC",
        "1",
    ),
    (
        TogglePreset(
            id="proton_no_d3d11",
            label="Disable D3D11",
            tooltip="PROTON_NO_D3D11=1 — niche troubleshooting only.",
            tier=1,
            risk="experimental",
        ),
        "PROTON_NO_D3D11",
        "1",
    ),
    (
        TogglePreset(
            id="vkbasalt",
            label="vkBasalt",
            tooltip="ENABLE_VKBASALT=1 — requires vkBasalt installed and configured.",
            tier=2,
            risk="safe",
        ),
        "ENABLE_VKBASALT",
        "1",
    ),
    (
        TogglePreset(
            id="steamdeck_off",
            label="Disable Steam Deck profile",
            tooltip="SteamDeck=0 — some titles behave better without Deck hints.",
            tier=3,
            risk="safe",
        ),
        "SteamDeck",
        "0",
    ),
    (
        TogglePreset(
            id="proton_wayland",
            label="Proton Wayland",
            tooltip="PROTON_ENABLE_WAYLAND=1 — experimental; can break overlay / input.",
            tier=3,
            risk="experimental",
        ),
        "PROTON_ENABLE_WAYLAND",
        "1",
    ),
    (
        TogglePreset(
            id="proton_no_steaminput",
            label="Disable Steam Input",
            tooltip="PROTON_NO_STEAMINPUT=1 — controller / overlay workarounds.",
            tier=3,
            risk="experimental",
        ),
        "PROTON_NO_STEAMINPUT",
        "1",
    ),
    (
        TogglePreset(
            id="proton_prefer_sdl",
            label="Prefer SDL controller",
            tooltip="PROTON_PREFER_SDL=1 — workaround for pad detection.",
            tier=3,
            risk="safe",
        ),
        "PROTON_PREFER_SDL",
        "1",
    ),
    (
        TogglePreset(
            id="proton_local_shader_cache",
            label="Local shader cache",
            tooltip="PROTON_LOCAL_SHADER_CACHE=1 — per-game shader cache isolation.",
            tier=3,
            risk="safe",
        ),
        "PROTON_LOCAL_SHADER_CACHE",
        "1",
    ),
    (
        TogglePreset(
            id="proton_hdr",
            label="HDR output",
            tooltip="PROTON_ENABLE_HDR=1 — requires capable display and game.",
            tier=3,
            risk="experimental",
        ),
        "PROTON_ENABLE_HDR",
        "1",
    ),
    (
        TogglePreset(
            id="mesa_anti_lag",
            label="Mesa Anti-Lag",
            tooltip="ENABLE_LAYER_MESA_ANTI_LAG=1 — AMD Mesa latency layer.",
            tier=4,
            risk="experimental",
        ),
        "ENABLE_LAYER_MESA_ANTI_LAG",
        "1",
    ),
    (
        TogglePreset(
            id="mesa_anti_lag_disable",
            label="Disable Mesa Anti-Lag",
            tooltip="DISABLE_LAYER_MESA_ANTI_LAG=1 — turns the Mesa anti-lag layer off (e.g. when enabled globally).",
            tier=4,
            risk="safe",
        ),
        "DISABLE_LAYER_MESA_ANTI_LAG",
        "1",
    ),
    (
        TogglePreset(
            id="dri_prime",
            label="Use AMD dGPU (DRI_PRIME)",
            tooltip="DRI_PRIME=1 — hybrid graphics hint.",
            tier=4,
            risk="safe",
        ),
        "DRI_PRIME",
        "1",
    ),
    (
        TogglePreset(
            id="proton_hide_apu",
            label="Hide AMD APU",
            tooltip="PROTON_HIDE_APU=1 — mis-detection workaround.",
            tier=4,
            risk="experimental",
        ),
        "PROTON_HIDE_APU",
        "1",
    ),
    (
        TogglePreset(
            id="proton_fsr4",
            label="FSR 4 upgrade",
            tooltip="PROTON_FSR4_UPGRADE=1 — bleeding-edge Proton feature.",
            tier=4,
            risk="experimental",
        ),
        "PROTON_FSR4_UPGRADE",
        "1",
    ),
    (
        TogglePreset(
            id="proton_fsr4_rdna3",
            label="FSR 4 RDNA3 upgrade",
            tooltip="PROTON_FSR4_RDNA3_UPGRADE=1",
            tier=4,
            risk="experimental",
        ),
        "PROTON_FSR4_RDNA3_UPGRADE",
        "1",
    ),
    (
        TogglePreset(
            id="proton_nvapi",
            label="NVAPI (NVIDIA)",
            tooltip="PROTON_ENABLE_NVAPI=1 — DLSS / NVAPI paths.",
            tier=4,
            risk="experimental",
        ),
        "PROTON_ENABLE_NVAPI",
        "1",
    ),
    (
        TogglePreset(
            id="proton_ngx_updater",
            label="Update DLSS (NGX)",
            tooltip="PROTON_ENABLE_NGX_UPDATER=1",
            tier=4,
            risk="experimental",
        ),
        "PROTON_ENABLE_NGX_UPDATER",
        "1",
    ),
    (
        TogglePreset(
            id="proton_hide_nvidia",
            label="Hide NVIDIA GPU",
            tooltip="PROTON_HIDE_NVIDIA_GPU=1 — workaround for some titles.",
            tier=4,
            risk="experimental",
        ),
        "PROTON_HIDE_NVIDIA_GPU",
        "1",
    ),
    (
        TogglePreset(
            id="proton_dlss_indicator",
            label="DLSS indicator",
            tooltip="PROTON_DLSS_INDICATOR=1",
            tier=4,
            risk="experimental",
        ),
        "PROTON_DLSS_INDICATOR",
        "1",
    ),
    (
        TogglePreset(
            id="proton_nvidia_libs",
            label="NVIDIA libraries",
            tooltip="PROTON_NVIDIA_LIBS=1 — PhysX/CUDA style paths.",
            tier=4,
            risk="experimental",
        ),
        "PROTON_NVIDIA_LIBS",
        "1",
    ),
    (
        TogglePreset(
            id="proton_xess",
            label="XeSS upgrade",
            tooltip="PROTON_XESS_UPGRADE=1 — Intel XeSS.",
            tier=4,
            risk="experimental",
        ),
        "PROTON_XESS_UPGRADE",
        "1",
    ),
    (
        TogglePreset(
            id="proton_ntsync_off",
            label="Prefer FSync over NTSync",
            tooltip="PROTON_USE_NTSYNC=0 — ProtonPlus-style FSync preference.",
            tier=3,
            risk="experimental",
        ),
        "PROTON_USE_NTSYNC",
        "0",
    ),
    (
        TogglePreset(
            id="scb_auto_hdr",
            label="Scopebuddy Auto HDR",
            tooltip="SCB_AUTO_HDR=1 — with scopebuddy wrapper if used.",
            tier=3,
            risk="experimental",
        ),
        "SCB_AUTO_HDR",
        "1",
    ),
    (
        TogglePreset(
            id="scb_auto_vrr",
            label="Scopebuddy Auto VRR",
            tooltip="SCB_AUTO_VRR=1",
            tier=3,
            risk="experimental",
        ),
        "SCB_AUTO_VRR",
        "1",
    ),
]

PRESET_BY_ID: dict[str, tuple[TogglePreset, str, str]] = {
    meta.id: (meta, ekey, eval_on) for meta, ekey, eval_on in _ENV_PRESETS
}


def iter_env_presets() -> Iterable[tuple[TogglePreset, str, str]]:
    return iter(_ENV_PRESETS)


def preset_env_active(model: LaunchOptionsModel, env_key: str, value_when_on: str) -> bool:
    return model.env.get(env_key) == value_when_on


def set_preset_env(model: LaunchOptionsModel, env_key: str, value_when_on: str, on: bool) -> None:
    if on:
        _set_env(model, env_key, value_when_on)
    else:
        _del_env(model, env_key)


def set_mangohud(model: LaunchOptionsModel, on: bool) -> None:
    model.mangohud = on
    for k in list(model.env.keys()):
        if k.upper() == "MANGOHUD":
            _del_env(model, k)


def set_gamemode(model: LaunchOptionsModel, on: bool) -> None:
    model.gamemode = on


def set_game_performance(model: LaunchOptionsModel, on: bool) -> None:
    model.game_performance = on


def mangohud_active(model: LaunchOptionsModel) -> bool:
    if model.mangohud:
        return True
    for k, v in model.env.items():
        if k.upper() == "MANGOHUD" and v.strip() in ("1", "true", "yes"):
            return True
    return False


def gamemode_active(model: LaunchOptionsModel) -> bool:
    return model.gamemode


def game_performance_active(model: LaunchOptionsModel) -> bool:
    return model.game_performance


def dxvk_hud_active(model: LaunchOptionsModel) -> bool:
    v = model.env.get("DXVK_HUD", "").strip().lower()
    if not v or v in ("0", "false", "no"):
        return False
    return True


def set_dxvk_hud(model: LaunchOptionsModel, on: bool) -> None:
    if on:
        _set_env(model, "DXVK_HUD", "fps")
    else:
        _del_env(model, "DXVK_HUD")


def ensure_gamescope(model: LaunchOptionsModel) -> GamescopeConfig:
    if model.gamescope is None:
        model.gamescope = GamescopeConfig()
    return model.gamescope


def set_gamescope_enabled(model: LaunchOptionsModel, on: bool) -> None:
    if not on:
        model.gamescope = None
        return
    ensure_gamescope(model)


GAME_SUFFIX_FLAGS: tuple[tuple[str, str], ...] = (
    ("-vulkan", "Prefer Vulkan renderer when the game supports it."),
    ("-dx11", "DirectX 11 renderer flag (game-dependent)."),
    ("-dx12", "DirectX 12 renderer flag (game-dependent)."),
    ("-console", "Developer console (game-dependent)."),
    ("-skip-launcher", "Skip launcher (game-dependent)."),
)


def suffix_has(model: LaunchOptionsModel, token: str) -> bool:
    return token in model.suffix_tokens


def set_suffix_token(model: LaunchOptionsModel, token: str, on: bool) -> None:
    toks = [t for t in model.suffix_tokens if t != token]
    if on:
        toks.append(token)
    model.suffix_tokens = toks
