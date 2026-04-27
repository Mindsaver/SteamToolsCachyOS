import fs from 'fs'
import path from 'path'
import type { InstalledGame } from '../../../shared/types'

// Heuristic filter matching steam-game-symlinks.sh skip_heuristic_non_game
const NON_GAME_PREFIXES = [
  'Steam Linux Runtime',
  'Proton ',
  'Steamworks Common Redistributables',
]

export function isHeuristicNonGame(name: string): boolean {
  return NON_GAME_PREFIXES.some((p) => name.startsWith(p))
}

function acfField(content: string, key: string): string {
  const re = new RegExp(`"${key}"\\s+"([^"]*)"`, 'i')
  return re.exec(content)?.[1] ?? ''
}

export function parseManifest(manifestPath: string): { appId: number; name: string; installDir: string } | null {
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8')
    const appId = parseInt(acfField(content, 'appid'), 10)
    const name = acfField(content, 'name')
    const installDir = acfField(content, 'installdir')
    if (!appId || !name || !installDir) return null
    return { appId, name, installDir }
  } catch {
    return null
  }
}

export function collectGames(
  libraries: string[],
  filter: 'heuristic' | 'all' = 'heuristic'
): InstalledGame[] {
  const seen = new Map<number, InstalledGame>()

  for (const lib of libraries) {
    const steamapps = path.join(lib, 'steamapps')
    if (!fs.existsSync(steamapps)) continue

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(steamapps, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith('appmanifest_') || !entry.name.endsWith('.acf'))
        continue

      const idStr = entry.name.replace('appmanifest_', '').replace('.acf', '')
      if (!/^\d+$/.test(idStr)) continue
      const appId = parseInt(idStr, 10)
      if (seen.has(appId)) continue

      const manifestPath = path.join(steamapps, entry.name)
      const parsed = parseManifest(manifestPath)
      if (!parsed) continue
      if (filter === 'heuristic' && isHeuristicNonGame(parsed.name)) continue

      const installPath = path.join(steamapps, 'common', parsed.installDir)
      if (!fs.existsSync(installPath)) continue

      // Find compatdata
      const compatPath = path.join(steamapps, 'compatdata', String(appId))
      const compatDataPath = fs.existsSync(compatPath) ? path.resolve(compatPath) : null

      const sys32 =
        compatDataPath && fs.existsSync(path.join(compatDataPath, 'pfx', 'drive_c', 'windows', 'system32'))
          ? path.join(compatDataPath, 'pfx', 'drive_c', 'windows', 'system32')
          : null

      seen.set(appId, {
        appId,
        name: parsed.name,
        installDir: parsed.installDir,
        installPath: path.resolve(installPath),
        libraryPath: lib,
        compatDataPath,
        system32Path: sys32,
        launchOptions: '',
      })
    }
  }

  // Also check other libraries for compatdata of already-seen games
  const games = [...seen.values()]
  for (const game of games) {
    if (game.compatDataPath) continue
    for (const lib of libraries) {
      const altCompat = path.join(lib, 'steamapps', 'compatdata', String(game.appId))
      if (fs.existsSync(altCompat)) {
        game.compatDataPath = path.resolve(altCompat)
        const sys32 = path.join(altCompat, 'pfx', 'drive_c', 'windows', 'system32')
        game.system32Path = fs.existsSync(sys32) ? sys32 : null
        break
      }
    }
  }

  return games.sort((a, b) => a.appId - b.appId)
}
