# SteamToolsCachyOS

**SteamToolsCachyOS** is a Linux desktop toolkit for Steam (CachyOS-friendly, works on other distros too): per-game symlink hubs, FSR-related DLL workflows, and a launch-options editor with structured toggles and compatibility-tool context. The packaged binary, menu entry, and install paths all use the **SteamToolsCachyOS** name.

## Features

- **Game symlink hub** — `[scripts/steam-game-symlinks.sh](scripts/steam-game-symlinks.sh)` creates `~/SteamToolsCachyOS/<Game Name>/` with links to the install directory, Proton prefix, `system32`, and userdata. Each folder can include a “Start in Steam” desktop entry (`steam://rungameid/...`). Optional FSR-related DLL copy via `--amd-dll=/path/to/amdxcffx64.dll` and `--mode=all|folders|dll`. Override the hub directory with `STEAMGAME_ROOT` (for example, keep using `~/Symlink-Steam` if you already populated that path). See the script’s `--help`.
- **Desktop UI** — `[scripts/steam-sync-ui.py](scripts/steam-sync-ui.py)` launches the symlink workflow, an **FSR DLL helper** (`[scripts/fsr_dll_window.py](scripts/fsr_dll_window.py)`), and a **launch options manager** (`[scripts/launch_options_window.py](scripts/launch_options_window.py)`) with structured presets (`[scripts/launch_options_compose.py](scripts/launch_options_compose.py)`, `[scripts/launch_options_structured_panel.py](scripts/launch_options_structured_panel.py)`), GPU vendor hints (`[scripts/gpu_vendor_detect.py](scripts/gpu_vendor_detect.py)`), and **Steam compatibility context** (`[scripts/steam_compat_context.py](scripts/steam_compat_context.py)`).

## Requirements

- **Linux** with **Steam** installed. If autodetection fails, set `STEAM_CLIENT` to your Steam root (see `steam-game-symlinks.sh --help`).
- **From source**: Python 3 and dependencies listed in `[scripts/requirements-ui.txt](scripts/requirements-ui.txt)` (`PySide6`, `vdf`).

## Install (release bundle)

Release artifacts are produced by `[scripts/build-steam-sync-ui.sh](scripts/build-steam-sync-ui.sh)` under `dist/` (that directory is gitignored; clone the repo and build, or use a published zip / `.run` from releases).

Typical flow (matches the generated `**dist/README.txt`** after a build):

- **Self-extracting installer** (when `SteamToolsCachyOS-Linux-x86_64.run` is present): `chmod +x` and run it; it unpacks and runs `install.sh`.
- **If double-clicking the `.run` does nothing** (common on KDE / Wayland): use `SteamToolsCachyOS-Install-Run-in-Terminal.desktop`, `SteamToolsCachyOS-Install.desktop`, or `SteamToolsCachyOS-Linux-install-terminal.sh` from the same folder.
- **Install or update**: `./install.sh` — installs to `~/.local/share/SteamToolsCachyOS`, registers the application menu entry, and symlinks `~/.local/bin/SteamToolsCachyOS`. Safe to re-run to update in place.
- **Run without installing**: `./SteamToolsCachyOS` from the bundle directory.
- **Remove**: `./uninstall.sh`, or after install `~/.local/share/SteamToolsCachyOS/uninstall.sh`. The uninstall script also removes a **legacy** install under the old **Symlink-Steam** paths if still present.

For the exact copy shipped with a build, open `**dist/README.txt`** after running the build script.

## Development (from git)

Recommended on Arch / CachyOS (PEP 668–friendly): use the dev launcher, which creates `**./.venv-ui-dev**` (or set `STEAMTOOLS_CACHYOS_VENV`, or the deprecated `SYMLINK_STEAM_VENV`, to another path) and installs `[scripts/requirements-ui.txt](scripts/requirements-ui.txt)`:

```bash
./scripts/run-steam-sync-ui.sh
```

Alternatively, with your own venv:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements-ui.txt
python3 scripts/steam-sync-ui.py
```

Imports resolve from the `scripts/` directory when `steam-sync-ui.py` is run as above.

Installed `.desktop` entries and dev helpers pass `**STEAMTOOLS_CACHYOS_ICON**` (with legacy `**SYMLINK_STEAM_ICON**` still supported in the app).

## Building a release

From the repository root:

```bash
./scripts/build-steam-sync-ui.sh
```

This creates a dedicated build venv, runs **PyInstaller** to produce a one-file binary named `**SteamToolsCachyOS`**, copies `install.sh`, `uninstall.sh`, icons, desktop helpers, and `**VERSION**` into `**dist/**`, and writes `**dist/README.txt**`.

- Set `**SKIP_MAKESELF=1**` to skip generating the `.run` installer.
- Set `**MAKESELF=/path/to/makeself**` (or ensure `makeself` is on `PATH`) to build `**dist/SteamToolsCachyOS-Linux-x86_64.run**`.

Optional `**makeself**` package: required only if you want the single-file `.run` output.

## Tests

Install the test runner in your dev venv (not required for the packaged app):

```bash
pip install pytest
python3 -m pytest tests/
```

Includes `[tests/test_launch_options_compose.py](tests/test_launch_options_compose.py)` and `[tests/test_steam_compat_context.py](tests/test_steam_compat_context.py)`.

## Repository layout

- `**scripts/**` — UI entrypoint, Steam/VDF helpers, symlink backend shell script, install/uninstall scripts
- `**assets/**` — Icons (`symlink-steam-logo.png`) and desktop entry templates
- `**tests/**` — Pytest suite
- `**steam-sync-ui.spec**`, `**SteamToolsCachyOS.spec**` — PyInstaller spec files (optional alternative to the build shell script)
- `**dist/**` — Build output (ignored by git after you run the build)

## Links

- **GitHub**: [Mindsaver/SteamToolsCachyOS](https://github.com/Mindsaver/SteamToolsCachyOS)

