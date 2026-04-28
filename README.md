# SteamToolsCachyOS

SteamToolsCachyOS is a Linux desktop app for Steam power users.  
It focuses on practical Proton/FSR workflows: launch options, compatibility tools, DLL inspection/copy, symlink helpers, and a live MangoHud editor.

The app lives in `app/` (Electron + Vite).

---

## Quick install (Arch/CachyOS)

Install the latest `.pacman` release package:

```bash
curl -fsSL -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/Mindsaver/SteamToolsCachyOS/contents/scripts/install-latest-pacman-github.sh?ref=main" \
  | bash
```

Manual install is also supported:

```bash
sudo pacman -U ./SteamToolsCachyOS-Linux-x86_64.pacman
```

Download packages from [latest releases](https://github.com/Mindsaver/SteamToolsCachyOS/releases/latest).

### Uninstall

```bash
sudo pacman -Rns steamtoolscachyos
```

---

## First run

1. Launch SteamToolsCachyOS.
2. Confirm Steam path in `Settings` if auto-detection is wrong.
3. Open `Launch Options` to apply per-game environment/arguments.
4. Open `Compat tools` to install/update GE-Proton or Proton-CachyOS.
5. Open `MangoHud Editor` to edit `MangoHud.conf` live.

---

## Main features

- `Dashboard`: quick links to all tools.
- `Symlink Hub`: creates per-game helper folders and links to common Steam/compatdata paths.
- `FSR DLL`: inspect/copy DLLs and infer version hints from binaries.
- `Launch Options`: structured launch-options editing with Proton context.
- `Proton user settings`: edit `user_settings.py` with backups.
- `Compat tools`: install/manage GE-Proton and Proton-CachyOS builds.
- `MangoHud Editor`:
  - full-catalog structured editor + raw text editor
  - typed controls (select/list/number/boolean/color picker + hex)
  - runtime upscaler status panel (FSR/DLSS/XeSS evidence)
  - runtime `custom_text` sync styles: `full-stack`, `fsr-only`, `status-only`, `compact`
  - optional background auto-sync with change detection (avoids unnecessary rewrites/reloads)

---

## Updates

- In app: `Help -> Check for updates`.
- Startup update checks respect app settings.
- External update path: run the install script again or `pacman -U` a newer `.pacman`.

---

## Requirements

- Linux + Steam installed.
- Arch/CachyOS (or another distro with compatible `pacman` setup) for packaged install path.
- Optional env vars:
  - `STEAM_CLIENT` to force Steam root if detection fails.
  - `STEAMTOOLS_GITHUB_TOKEN` to reduce GitHub API rate-limit issues.

---

## Development

Run from source:

```bash
cd app
npm ci
npm run dev
```

Type-check:

```bash
cd app
npm run typecheck
```

Tests:

```bash
cd app
npm test
```

Build package locally:

```bash
cd app
npm ci
npm run build
npx electron-builder --linux pacman --publish never
```

Artifacts are written to `app/dist/`.

---

## Repo structure

- `app/`: Electron app source
- `scripts/`: install/update helper scripts
- `assets/`: icons and static assets

---

## License

MIT — see [LICENSE](LICENSE).

Project URL: [Mindsaver/SteamToolsCachyOS](https://github.com/Mindsaver/SteamToolsCachyOS)

