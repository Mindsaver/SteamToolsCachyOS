# SteamToolsCachyOS

**SteamToolsCachyOS** is a Linux desktop toolkit for Steam (CachyOS-friendly; works on other distros too): per-game symlink hubs, FSR-related DLL workflows, and a launch-options editor with structured toggles and compatibility-tool context. This repository ships an **Electron** desktop app (`[app/](app)`).

---

## Install (Electron — **pacman only**)

Supported path today: **Arch / CachyOS** (or any system with `**pacman`** and `**sudo`**). Installs `**SteamToolsCachyOS-Linux-x86_64.pacman`** from the [latest GitHub release](https://github.com/Mindsaver/SteamToolsCachyOS/releases/latest) under `**/opt`**, same layout as **in-app updates**.

**One-liner** (needs **curl**, **jq**, **pacman**, **sudo** unless you run the pipe as root):

```bash
curl -fsSL -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/Mindsaver/SteamToolsCachyOS/contents/scripts/install-latest-pacman-github.sh?ref=main" \
  | bash
```

**Or manually:** download `**SteamToolsCachyOS-Linux-x86_64.pacman`** from Releases, then:

```bash
sudo pacman -U ./SteamToolsCachyOS-Linux-x86_64.pacman
```

`raw.githubusercontent.com/.../main/...` is often **CDN-cached**; the **Contents API** URL above tracks `main` immediately. For a **fork**, change `Mindsaver/SteamToolsCachyOS` in the URL or set `**STEAMTOOLS_INSTALL_REPO=owner/repo`** before piping (the in-app updater can use `**STEAMTOOLS_UPDATE_REPO`** the same way).

Older releases may still list legacy artifacts; only the `***.pacman`** flow here is supported.

---

## Uninstall

```bash
sudo pacman -Rns steamtoolscachyos
```

Use the exact name from `**pacman -Qs steamtools**` if it differs.

---

## Updates and autoupdate

- **Menu**: **Help → Check for updates…** uses **electron-updater** with the `**.pacman`** asset on GitHub Releases (same as install). After download, **Restart & install** runs `**pacman -U`** on the new package.
- **Automatic check** on startup respects app settings (throttle, etc.); env overrides like `**STEAMTOOLS_NO_AUTO_UPDATE=1`** still apply if set.
- **Outside the app**: re-run the [install one-liner](#install-electron--pacman-only) or `**sudo pacman -U`** on a newer `**.pacman`** from Releases.

---

## What it does

Implemented in the Electron app under `[app/](app)`:

- **Game symlink hub** — per-game folders under `~/SteamToolsCachyOS/<Game Name>/` (or `STEAMGAME_ROOT`) with links to install dir, Proton prefix, `system32`, userdata; optional “Start in Steam” desktop entries and FSR-related DLL workflows.
- **FSR DLL helper** — locate and align AMD FFX stack DLLs with heuristics from PE bytes.
- **Launch options** — structured presets, compatibility-tool context from Steam config, and awareness of Proton `user_settings.py` when present.

---

## Requirements

- **Linux** with **Steam** installed. If autodetection fails, set `STEAM_CLIENT` to your Steam root where the app expects it (see in-app behavior and `[app/src/main](app/src/main)` services).

---

## Development, build, and publishing

### Run from git

```bash
cd app
npm ci
npm run dev
```

Tests (Vitest): `npm test` from `app/`.

### Electron packaging

CI builds **pacman** via `[.github/workflows/release-electron.yml](.github/workflows/release-electron.yml)` (`working-directory: app`, then `npx electron-builder --linux pacman --publish never`). **End-user install** is the `**.pacman`** path documented above.

**Local packaging** (from repo root):

```bash
cd app
npm ci
npm run build
npx electron-builder --linux pacman --publish never
```

Artifacts land in `app/dist/` (for example `*.pacman`, `latest-linux.yml` for electron-updater).

**Publishing**: push a tag `v`* or use **Actions → Release Electron** on GitHub.

**electron-builder 26.x** validates `[app/electron-builder.yml](app/electron-builder.yml)` against a strict schema. If you edit that file, keep the following in mind:


| Topic                   | What to use                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Linux targets**       | Put targets under `linux.target`, not a root-level `targets` key. See [Linux configuration](https://www.electron.build/linux).                                                                                                                                                                                                                |
| `**.desktop` metadata** | Custom `[Desktop Entry]` keys (`Name`, `Comment`, `Categories`, `Keywords`, …) belong under `linux.desktop.entry`. The `linux.desktop` object only allows `entry` and `desktopActions`. See [LinuxDesktopFile](https://www.electron.build/app-builder-lib.interface.linuxdesktopfile).                                                        |
| **Pacman / FPM**        | FPM-based targets need a project **homepage**, **author** with an **email**, and a Linux **maintainer**. The YAML sets these via `extraMetadata` and `linux.maintainer`; replace the GitHub `users.noreply.github.com` placeholder with a real address if you prefer. Package **license** comes from `app/package.json` (`"license": "MIT"`). |


**Ubuntu/CI**: the pacman step invokes `bsdtar` (for `.MTREE`). Install `**libarchive-tools`** so `bsdtar` is on `PATH` — the Release Electron workflow already includes it.

### Repository layout

- `[app/](app)` — Electron + Vite desktop app (`npm run build`, `electron-builder` Linux packages)
- `[scripts/](scripts)` — `[install-latest-pacman-github.sh](scripts/install-latest-pacman-github.sh)` for the documented one-liner install
- `[assets/](assets)` — Icons and related assets referenced by the app

---

## License

This project is licensed under the [MIT License](LICENSE).

Bundled and runtime dependencies of the Electron app (Electron, Chromium, Node modules, etc.) remain under their respective licenses; see each package’s metadata or upstream project.

---

## Links

- **GitHub**: [Mindsaver/SteamToolsCachyOS](https://github.com/Mindsaver/SteamToolsCachyOS)

