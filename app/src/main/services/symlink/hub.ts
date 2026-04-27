import fs from 'fs'
import path from 'path'
import os from 'os'
import { collectGames } from '../steam/manifests'
import { parseLibraryPaths } from '../steam/install'
import type { SymlinkHubOptions, SymlinkProgress } from '../../../shared/types'

// Symlink hub (per-game folders, links, optional DLL copy) — implemented in TypeScript.
// All filesystem operations use Node's fs module — no bash invocations.

type ProgressCallback = (p: SymlinkProgress) => void

function sanitizeDirname(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '-')
    .trim()
}

function writeStartInSteamDesktop(outPath: string, appId: number, dryRun: boolean): void {
  const content = `[Desktop Entry]
Type=Application
Version=1.0
Name=Start in Steam
Comment=Launch this library game in the Steam client (AppID ${appId}).
Exec=steam steam://rungameid/${appId}
TryExec=steam
Icon=steam
Terminal=false
Categories=Game;
Keywords=Steam;Game;SteamToolsCachyOS;
`
  if (dryRun) return
  fs.writeFileSync(outPath, content, 'utf-8')
  fs.chmodSync(outPath, 0o755)
}

function ensureSymlink(target: string, linkPath: string, dryRun: boolean): void {
  if (dryRun) return
  try {
    const stat = fs.lstatSync(linkPath)
    if (stat.isSymbolicLink() || stat.isFile()) fs.unlinkSync(linkPath)
    else if (stat.isDirectory()) return
  } catch {
    // doesn't exist
  }
  fs.symlinkSync(target, linkPath)
}

function removeIfExists(p: string, dryRun: boolean): void {
  if (dryRun) return
  try {
    fs.rmSync(p, { force: true })
  } catch {
    // ignore
  }
}

export async function runSymlinkHub(
  steamInstall: string,
  options: SymlinkHubOptions,
  onProgress: ProgressCallback
): Promise<void> {
  const hubRoot =
    options.hubRoot ||
    process.env.STEAMGAME_ROOT ||
    path.join(os.homedir(), 'SteamToolsCachyOS')

  const filter = options.filter ?? 'heuristic'
  const mode = options.mode
  const dryRun = options.dryRun

  onProgress({ type: 'log', message: `Hub root: ${hubRoot} (mode=${mode}, filter=${filter})` })
  if (dryRun) onProgress({ type: 'log', message: '[DRY RUN] No changes will be written.' })

  const libraries = parseLibraryPaths(steamInstall)
  onProgress({ type: 'log', message: `Libraries: ${libraries.join(', ')}` })

  const games = collectGames(libraries, filter)
  onProgress({ type: 'log', message: `Found ${games.length} games` })

  // Validate DLL if needed
  let dllPath: string | null = null
  if (mode !== 'folders' && options.dllPath) {
    dllPath = path.resolve(options.dllPath)
    if (!fs.existsSync(dllPath)) {
      onProgress({ type: 'error', message: `DLL not found: ${dllPath}` })
      return
    }
  }
  if (mode === 'dll' && !dllPath) {
    onProgress({ type: 'error', message: '--mode=dll requires a DLL path' })
    return
  }

  if (!dryRun) {
    fs.mkdirSync(hubRoot, { recursive: true })
  }

  const userDataRoot = path.join(steamInstall, 'userdata')
  const hasUserData = fs.existsSync(userDataRoot)

  const nameCount = new Map<string, number>()
  let done = 0

  for (const game of games) {
    done++
    let safeName = sanitizeDirname(game.name) || `app-${game.appId}`
    const count = nameCount.get(safeName) ?? 0
    if (count > 0) safeName = `${safeName} (${game.appId})`
    nameCount.set(safeName, count + 1)

    const gameDir = path.join(hubRoot, safeName)
    const commonLink = path.join(gameDir, 'common')
    const prefixLink = path.join(gameDir, 'compatdata_prefix')
    const sys32Link = path.join(gameDir, 'compatdata_windows_system32')

    onProgress({
      type: 'progress',
      message: `[${done}/${games.length}] ${game.name}`,
      current: done,
      total: games.length,
    })
    onProgress({ type: 'log', message: `  folder  ${gameDir}` })

    if (mode !== 'dll') {
      if (!dryRun) fs.mkdirSync(gameDir, { recursive: true })

      ensureSymlink(game.installPath, commonLink, dryRun)
      onProgress({ type: 'log', message: `  link    common → ${game.installPath}` })

      if (game.compatDataPath) {
        ensureSymlink(game.compatDataPath, prefixLink, dryRun)
        onProgress({ type: 'log', message: `  link    compatdata_prefix → ${game.compatDataPath}` })
      }

      if (game.system32Path) {
        ensureSymlink(game.system32Path, sys32Link, dryRun)
        onProgress({ type: 'log', message: `  link    compatdata_windows_system32 → ${game.system32Path}` })
      } else {
        removeIfExists(sys32Link, dryRun)
      }

      writeStartInSteamDesktop(path.join(gameDir, 'Start in Steam.desktop'), game.appId, dryRun)
      onProgress({ type: 'log', message: `  file    Start in Steam.desktop` })

      // Userdata symlinks
      if (hasUserData) {
        const udPaths: string[] = []
        try {
          const accounts = fs.readdirSync(userDataRoot, { withFileTypes: true })
          for (const acc of accounts) {
            if (!acc.isDirectory()) continue
            const udPath = path.join(userDataRoot, acc.name, String(game.appId))
            if (fs.existsSync(udPath)) udPaths.push(path.resolve(udPath))
          }
        } catch {
          // ignore
        }

        const udLink = path.join(gameDir, 'userdata')
        if (udPaths.length === 1) {
          ensureSymlink(udPaths[0], udLink, dryRun)
          onProgress({ type: 'log', message: `  link    userdata → ${udPaths[0]}` })
          if (!dryRun) {
            try {
              const entries = fs.readdirSync(gameDir)
              for (const e of entries) {
                if (e.startsWith('userdata_')) removeIfExists(path.join(gameDir, e), dryRun)
              }
            } catch {
              // ignore
            }
          }
        } else if (udPaths.length > 1) {
          removeIfExists(udLink, dryRun)
          for (const p of udPaths) {
            const accId = path.basename(path.dirname(p))
            ensureSymlink(p, path.join(gameDir, `userdata_${accId}`), dryRun)
            onProgress({ type: 'log', message: `  link    userdata_${accId} → ${p}` })
          }
        }
      }
    }
    onProgress({ type: 'log', message: '' })

    // DLL copy
    if (mode !== 'folders' && dllPath && game.system32Path) {
      const dest = path.join(game.system32Path, 'amdxcffx64.dll')
      if (!dryRun) {
        try {
          fs.copyFileSync(dllPath, dest)
        } catch (e) {
          onProgress({ type: 'log', message: `  WARN: DLL copy failed for ${game.name}: ${e}` })
        }
      }
    }
  }

  onProgress({
    type: 'done',
    message: `Done — ${games.length} games processed (mode=${mode}, filter=${filter})`,
    exitCode: 0,
  })
}
