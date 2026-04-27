# SteamToolsCachyOS

**SteamToolsCachyOS** is a Linux desktop toolkit for Steam (CachyOS-friendly; works on other distros too): per-game symlink hubs, FSR-related DLL workflows, and a launch-options editor with structured toggles and compatibility-tool context. Packaged binaries, menu entries, and install paths use this name.

---

## Install (Electron — **pacman only**)

Supported path today: **Arch / CachyOS** (or any system with `**pacman`** and `**sudo**`). Installs the `**SteamToolsCachyOS-Linux-x86_64.pacman**` from the [latest GitHub release](https://github.com/Mindsaver/SteamToolsCachyOS/releases/latest) under `**/opt**`, same layout as **in-app updates**.

**One-liner** (needs **curl**, **python3**, **pacman**, **sudo** unless you run the pipe as root):

```bash
curl -fsSL -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/Mindsaver/SteamToolsCachyOS/contents/scripts/install-latest-pacman-github.sh?ref=main" \
  | bash
```

**Or manually:** download `**SteamToolsCachyOS-Linux-x86_64.pacman`** from Releases, then:

```bash
sudo pacman -U ./SteamToolsCachyOS-Linux-x86_64.pacman
```

`raw.githubusercontent.com/.../main/...` is often **CDN-cached**; the **Contents API** URL above tracks `main` immediately. For a **fork**, change `Mindsaver/SteamToolsCachyOS` in the URL or set `**STEAMTOOLS_INSTALL_REPO=owner/repo`** before piping (the in-app updater can use `**STEAMTOOLS_UPDATE_REPO**` the same way).

**Older PyInstaller zip** builds may still appear on Releases for legacy use; unpack and run `**install.sh`** if you need that stack only — not the same install tree as the Electron app above.

---

## Uninstall

**Electron (pacman package):**

```bash
sudo pacman -Rns steamtoolscachyos
```

Use the exact name from `**pacman -Qs steamtools**` if it differs.

**Legacy PyInstaller zip** (if you used `**~/.local/share/SteamToolsCachyOS`** from `**install.sh**`):

```bash
bash ~/.local/share/SteamToolsCachyOS/uninstall.sh
```

(or `**./uninstall.sh**` next to `**install.sh**` in an unpacked bundle). That removes the menu entry, `**~/.local/bin/SteamToolsCachyOS**`, and `**~/.local/share/SteamToolsCachyOS**`, including old **Symlink-Steam** paths when still present.

---

## Updates and autoupdate

- **Menu**: **Help → Check for updates…** uses **electron-updater** with the `**.pacman`** asset on GitHub Releases (same as install). After download, **Restart & install** runs `**pacman -U`** on the new package.
- **Automatic check** on startup respects app settings (throttle, etc.); env overrides like `**STEAMTOOLS_NO_AUTO_UPDATE=1`** still apply if set.
- **Outside the app**: re-run the [install one-liner](#install-electron--pacman-only) or `**sudo pacman -U`** on a newer `**.pacman**` from Releases.

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

- **Tag push** matching `v`*: builds on Ubuntu, zips `dist/` as `**SteamToolsCachyOS-Linux-x86_64.zip`**, uploads to the matching GitHub Release (via **softprops/action-gh-release**).
- **Actions → Run workflow**: enter a semver without `v` (e.g. `1.2.3`), optional draft/prerelease; creates `**v1.2.3`** and a release with the zip (fails if that tag or release already exists).

Maintainers can still publish manually: build locally, zip `dist/`, attach `**SteamToolsCachyOS-Linux-x86_64.zip`** for the legacy PyInstaller curl installer.

### Electron app and electron-builder 26 (Linux)

The Electron UI lives under `[app/](app/)`. CI builds **pacman** via `[.github/workflows/release-electron.yml](.github/workflows/release-electron.yml)` (`working-directory: app`, then `npx electron-builder --linux pacman --publish never`). **End-user install** is the `**.pacman`** path documented above.

**Local packaging** (from repo root):

```bash
cd app
npm ci
npm run build
npx electron-builder --linux pacman --publish never
```

Artifacts land in `app/dist/` (for example `*.pacman`, `latest-linux.yml` for electron-updater).

**electron-builder 26.x** validates `[app/electron-builder.yml](app/electron-builder.yml)` against a strict schema. If you edit that file, keep the following in mind:


| Topic                   | What to use                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Linux targets**       | Put targets under `linux.target`, not a root-level `targets` key. See [Linux configuration](https://www.electron.build/linux).                                                                                                                                                                                                                |
| `**.desktop` metadata** | Custom `[Desktop Entry]` keys (`Name`, `Comment`, `Categories`, `Keywords`, …) belong under `linux.desktop.entry`. The `linux.desktop` object only allows `entry` and `desktopActions`. See [LinuxDesktopFile](https://www.electron.build/app-builder-lib.interface.linuxdesktopfile).                                                        |
| **Pacman / FPM**        | FPM-based targets need a project **homepage**, **author** with an **email**, and a Linux **maintainer**. The YAML sets these via `extraMetadata` and `linux.maintainer`; replace the GitHub `users.noreply.github.com` placeholder with a real address if you prefer. Package **license** comes from `app/package.json` (`"license": "MIT"`). |


**Ubuntu/CI**: the pacman step invokes `bsdtar` (for `.MTREE`). Install `**libarchive-tools`** so `bsdtar` is on `PATH` — the Release Electron workflow already includes it.

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

