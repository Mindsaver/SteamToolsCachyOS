# SteamToolsCachyOS

**SteamToolsCachyOS** is a Linux desktop toolkit for Steam (CachyOS-friendly; works on other distros too): per-game symlink hubs, FSR-related DLL workflows, and a launch-options editor with structured toggles and compatibility-tool context. Packaged binaries, menu entries, and install paths use this name.

---

## Install

Pick one of these; you only need **curl**, **python3**, and **unzip** on `PATH` for the one-liner.

### One-liner (latest GitHub release)

Downloads the latest [release](https://github.com/Mindsaver/SteamToolsCachyOS/releases) asset `SteamToolsCachyOS-Linux-x86_64.zip`, unpacks it, and runs `install.sh`:

```bash
curl -fsSL https://raw.githubusercontent.com/Mindsaver/SteamToolsCachyOS/main/scripts/install-latest-github.sh | bash
```

For a **fork**, set `STEAMTOOLS_INSTALL_REPO=owner/repo` before piping (the in-app updater uses `STEAMTOOLS_UPDATE_REPO` for the same purpose).

### Release zip (manual)

1. Download `**SteamToolsCachyOS-Linux-x86_64.zip`** from [Releases](https://github.com/Mindsaver/SteamToolsCachyOS/releases) and unpack it.
2. **Self-extracting `.run`** (if `SteamToolsCachyOS-Linux-x86_64.run` is in the bundle): `chmod +x` and run it; it unpacks and runs `install.sh`.
3. **If double-clicking the `.run` does nothing** (common on KDE / Wayland): use `SteamToolsCachyOS-Install-Run-in-Terminal.desktop`, `SteamToolsCachyOS-Install.desktop`, or `SteamToolsCachyOS-Linux-install-terminal.sh` from the same folder.
4. **Install or update in place**: `./install.sh` — installs to `~/.local/share/SteamToolsCachyOS`, registers the application menu entry, and symlinks `~/.local/bin/SteamToolsCachyOS`. Safe to re-run.
5. **Run without installing**: `./SteamToolsCachyOS` from the bundle directory.

Each install includes `**RELEASE_VERSION`** (semver) and `**VERSION`** (line 1: semver, line 2: build stamp) for update checks. For the exact copy shipped with a local build, see `dist/README.txt` after running the build script.

---

## Uninstall

- **From an unpacked release or build folder** (same directory as `install.sh`): run `./uninstall.sh` in a terminal.
- **After a normal install** (you no longer have the zip folder): run the copy kept with the app:
  ```bash
  ~/.local/share/SteamToolsCachyOS/uninstall.sh
  ```

The uninstall script removes the application menu entry (`.desktop` under `~/.local/share/applications`), the `~/.local/bin/SteamToolsCachyOS` symlink, and the install directory `~/.local/share/SteamToolsCachyOS`. It also cleans up a **legacy** install under the old **Symlink-Steam** paths if one is still present.

If you **only ever ran** `./SteamToolsCachyOS` from an unpacked folder and never ran `install.sh`, there may be nothing under `~/.local` to remove — delete that unpacked folder yourself when you are done.

---

## Updates and autoupdate

- **Menu**: **Help → Check for updates…** compares your semver to the [latest GitHub release](https://api.github.com/repos/Mindsaver/SteamToolsCachyOS/releases/latest), can download the same zip, and re-runs `install.sh`. After updating, **restart** the app so the new binary loads.
- **Automatic check**: when you start the **installed** app, it compares your version to GitHub’s latest release. **Release installs** (semver without a local `+dev` / `0.0.0+…` dev line from `./build`) use a **1-hour** throttle (timestamp under `$XDG_CACHE_HOME/SteamToolsCachyOS/last_update_check`). **Direct / local builds** skip that throttle so every launch hits GitHub. **Help → Check for updates** always hits GitHub immediately. To skip the automatic check entirely: `**STEAMTOOLS_NO_AUTO_UPDATE=1**`. To throttle a dev build too: `**STEAMTOOLS_AUTO_CHECK_THROTTLE=1**`. To turn throttling off for a release install: `**STEAMTOOLS_AUTO_CHECK_THROTTLE=0**`. Gap override: `**STEAMTOOLS_AUTO_CHECK_INTERVAL_HOURS**` (float; minimum 5 minutes). `**STEAMTOOLS_FORCE_UPDATE_CHECK=1**` runs the startup check once even inside the throttle window.
- **Outside the app**: run the [one-liner](#one-liner-latest-github-release) again, or unpack a newer zip and run `./install.sh`.

---

## What it does

- **Game symlink hub** — `[scripts/steam-game-symlinks.sh](scripts/steam-game-symlinks.sh)` creates `~/SteamToolsCachyOS/<Game Name>/` with links to the install directory, Proton prefix, `system32`, and userdata. Each folder can include a “Start in Steam” desktop entry (`steam://rungameid/...`). Optional FSR-related DLL copy via `--amd-dll=/path/to/amdxcffx64.dll` and `--mode=all|folders|dll`. Override the hub directory with `STEAMGAME_ROOT` (for example, keep using `~/Symlink-Steam` if you already use that path). See the script’s `--help`.
- **Desktop UI** — `[scripts/steam-sync-ui.py](scripts/steam-sync-ui.py)` runs the symlink workflow, an **FSR DLL helper** (`[scripts/fsr_dll_window.py](scripts/fsr_dll_window.py)`), and a **launch options manager** (`[scripts/launch_options_window.py](scripts/launch_options_window.py)`) with structured presets (`[scripts/launch_options_compose.py](scripts/launch_options_compose.py)`, `[scripts/launch_options_structured_panel.py](scripts/launch_options_structured_panel.py)`), GPU vendor hints (`[scripts/gpu_vendor_detect.py](scripts/gpu_vendor_detect.py)`), and **Steam compatibility context** (`[scripts/steam_compat_context.py](scripts/steam_compat_context.py)`).

---

## Requirements

- **Linux** with **Steam** installed. If autodetection fails, set `STEAM_CLIENT` to your Steam root (see `steam-game-symlinks.sh --help`).
- **Running from git** (not the packaged app): Python 3 and dependencies in `[scripts/requirements-ui.txt](scripts/requirements-ui.txt)` (`PySide6`, `vdf`).

---

## Advanced: development, build, and publishing

### Run from git

Recommended on Arch / CachyOS (PEP 668–friendly): the dev launcher creates `**./.venv-ui-dev`** (or set `STEAMTOOLS_CACHYOS_VENV`, or the deprecated `SYMLINK_STEAM_VENV`) and installs `[scripts/requirements-ui.txt](scripts/requirements-ui.txt)`:

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

Imports resolve from the `scripts/` directory when `steam-sync-ui.py` is run as above. Installed `.desktop` entries and dev helpers pass `**STEAMTOOLS_CACHYOS_ICON**` (legacy `**SYMLINK_STEAM_ICON**` is still supported in the app).

### Build a release

From the repository root:

```bash
./scripts/build-steam-sync-ui.sh
```

This creates a build venv, runs **PyInstaller** for a one-file binary named `**SteamToolsCachyOS`**, copies `install.sh`, `uninstall.sh`, icons, desktop helpers, `**VERSION`**, `**RELEASE_VERSION**`, and writes `dist/README.txt`.

- `**RELEASE_VERSION**` / first line of `**VERSION**`: from `**RELEASE_VERSION**` if set, else `**GITHUB_REF_NAME**` when it looks like `v1.2.3`, else the latest reachable git tag, else `0.0.0+dev.<hash>`.
- `**SKIP_MAKESELF=1**` — skip the `.run` installer (CI uses this).
- `**MAKESELF=/path/to/makeself**` (or `makeself` on `PATH`) — build `dist/SteamToolsCachyOS-Linux-x86_64.run`.

The **makeself** package is only required if you want the single-file `.run` output. Release artifacts are produced under `dist/` (gitignored until you build locally).

### Publishing (GitHub Actions)

Workflow `[.github/workflows/release.yml](.github/workflows/release.yml)`:

- **Tag push** matching `v*`: builds on Ubuntu, zips `dist/` as `**SteamToolsCachyOS-Linux-x86_64.zip`**, uploads to the matching GitHub Release (via **softprops/action-gh-release**).
- **Actions → Run workflow**: enter a semver without `v` (e.g. `1.2.3`), optional draft/prerelease; creates `**v1.2.3`** and a release with the zip (fails if that tag or release already exists).

Maintainers can still publish manually: build locally, zip `dist/`, attach `**SteamToolsCachyOS-Linux-x86_64.zip`** so the curl installer and in-app updater keep working.

### Electron app and electron-builder 26 (Linux)

The Electron UI lives under [`app/`](app/). CI builds **AppImage** and **pacman** via [`.github/workflows/release-electron.yml`](.github/workflows/release-electron.yml) (`working-directory: app`, then `npx electron-builder --linux AppImage pacman --publish never`).

**Local packaging** (from repo root):

```bash
cd app
npm ci
npm run build
npx electron-builder --linux AppImage pacman --publish never
```

Artifacts land in `app/dist/` (for example `*.AppImage`, `*.pkg.tar.zst`, `latest-linux.yml` for electron-updater).

**electron-builder 26.x** validates [`app/electron-builder.yml`](app/electron-builder.yml) against a strict schema. If you edit that file, keep the following in mind:

| Topic | What to use |
|--------|----------------|
| **Linux targets** | Put targets under `linux.target`, not a root-level `targets` key. See [Linux configuration](https://www.electron.build/linux). |
| **`.desktop` metadata** | Custom `[Desktop Entry]` keys (`Name`, `Comment`, `Categories`, `Keywords`, …) belong under `linux.desktop.entry`. The `linux.desktop` object only allows `entry` and `desktopActions`. See [LinuxDesktopFile](https://www.electron.build/app-builder-lib.interface.linuxdesktopfile). |
| **AppImage license file** | Paths are resolved from `app/` and `app/resources/`. The MIT `LICENSE` at the **repository root** is referenced as `../LICENSE` from `app/electron-builder.yml`. |
| **Pacman / FPM** | FPM-based targets need a project **homepage**, **author** with an **email**, and a Linux **maintainer**. The YAML sets these via `extraMetadata` and `linux.maintainer`; replace the GitHub `users.noreply.github.com` placeholder with a real address if you prefer. |

### Tests

In your dev venv (not required for the packaged app):

```bash
pip install pytest
python3 -m pytest tests/
```

Includes `[tests/test_launch_options_compose.py](tests/test_launch_options_compose.py)` and `[tests/test_steam_compat_context.py](tests/test_steam_compat_context.py)`.

### Repository layout

- `**app/**` — Electron + Vite desktop app (`npm run build`, `electron-builder` Linux packages)
- `**scripts/**` — UI entrypoint, Steam/VDF helpers, symlink backend shell script, install/uninstall scripts
- `**assets/**` — Icons (`symlink-steam-logo.png`) and desktop entry templates
- `**tests/**` — Pytest suite
- `**steam-sync-ui.spec**`, `**SteamToolsCachyOS.spec**` — PyInstaller spec files (optional alternative to the build shell script)
- `**dist/**` — Build output (ignored by git after you run the build)

---

## License

This project is licensed under the [MIT License](LICENSE).

Bundled and runtime dependencies (for example **PySide6** / Qt, **certifi**, **packaging**, **vdf**, and the **PyInstaller** bootloader in release binaries) remain under their respective licenses; see each package’s metadata or upstream project.

---

## Links

- **GitHub**: [Mindsaver/SteamToolsCachyOS](https://github.com/Mindsaver/SteamToolsCachyOS)

