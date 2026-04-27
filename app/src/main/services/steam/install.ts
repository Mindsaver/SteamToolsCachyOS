import fs from 'fs'
import path from 'path'
import os from 'os'
import vdf from 'simple-vdf'

// Mirrors steam_launch_options_core.resolve_steam_install and libraryfolders parser

export function resolveSteamInstall(): string | null {
  const envPath = process.env.STEAM_CLIENT?.trim()
  if (envPath) {
    const p = path.resolve(envPath)
    if (fs.existsSync(path.join(p, 'steamapps', 'libraryfolders.vdf'))) return p
    if (fs.existsSync(path.join(p, 'config', 'config.vdf'))) return p
  }

  const candidates = [
    path.join(os.homedir(), '.local', 'share', 'Steam'),
    path.join(os.homedir(), '.steam', 'steam'),
  ]

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'steamapps', 'libraryfolders.vdf'))) {
      return c
    }
  }
  return null
}

export function parseLibraryPaths(steamInstall: string): string[] {
  const vdfPath = path.join(steamInstall, 'steamapps', 'libraryfolders.vdf')
  if (!fs.existsSync(vdfPath)) return [steamInstall]

  try {
    const raw = fs.readFileSync(vdfPath, 'utf-8')
    const data = vdf.parse(raw) as Record<string, unknown>
    const root =
      (data['libraryfolders'] as Record<string, unknown>) ||
      (data['LibraryFolders'] as Record<string, unknown>)
    if (!root) return [steamInstall]

    const skipKeys = new Set(['contentid', 'time_next_stats_report', 'TimeNextStatsReport'])
    const paths: string[] = []

    for (const [k, entry] of Object.entries(root)) {
      if (skipKeys.has(k)) continue
      if (typeof entry === 'object' && entry !== null) {
        const p = (entry as Record<string, unknown>)['path']
        if (typeof p === 'string' && p) {
          paths.push(path.resolve(p.replace(/\\\\/g, '\\')))
        }
      } else if (typeof entry === 'string' && /^\d+$/.test(k)) {
        paths.push(path.resolve(entry.replace(/\\\\/g, '\\')))
      }
    }

    return [...new Set(paths.length ? paths : [steamInstall])]
  } catch {
    return [steamInstall]
  }
}

export function resolveUserDataPath(steamInstall: string): string | null {
  const primary = path.join(steamInstall, 'userdata')
  if (fs.existsSync(primary)) return primary
  const fallback = path.join(os.homedir(), '.steam', 'steam', 'userdata')
  if (fs.existsSync(fallback)) return path.resolve(fallback)
  return null
}

export function listSteamAccounts(userDataPath: string): string[] {
  if (!fs.existsSync(userDataPath)) return []
  try {
    return fs
      .readdirSync(userDataPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
      .map((d) => d.name)
  } catch {
    return []
  }
}
