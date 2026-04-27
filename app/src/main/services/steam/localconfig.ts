import fs from 'fs'
import path from 'path'
import os from 'os'
import vdf from 'simple-vdf'

// Read/write Steam localconfig.vdf for launch options.
// Atomic write: write to .tmp then rename, plus one-time .bak backup.

export function findLocalconfigs(userDataPath: string): Array<{ accountId: string; filePath: string }> {
  if (!fs.existsSync(userDataPath)) return []
  const results: Array<{ accountId: string; filePath: string }> = []
  try {
    const accounts = fs.readdirSync(userDataPath, { withFileTypes: true })
    for (const acc of accounts) {
      if (!acc.isDirectory()) continue
      const lc = path.join(userDataPath, acc.name, 'config', 'localconfig.vdf')
      if (fs.existsSync(lc)) {
        results.push({ accountId: acc.name, filePath: lc })
      }
    }
  } catch {
    // ignore
  }
  return results
}

export function readLaunchOptions(localconfigPath: string): Map<string, string> {
  const map = new Map<string, string>()
  try {
    const raw = fs.readFileSync(localconfigPath, 'utf-8')
    const data = vdf.parse(raw) as Record<string, unknown>
    // Traverse: UserLocalConfigStore > Software > Valve > Steam > apps
    const apps = getNestedKey(data, ['UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'Apps'])
    if (!apps || typeof apps !== 'object') return map
    for (const [appId, appData] of Object.entries(apps as Record<string, unknown>)) {
      if (typeof appData === 'object' && appData !== null) {
        const lo = (appData as Record<string, unknown>)['LaunchOptions']
        if (typeof lo === 'string') {
          map.set(appId, lo)
        }
      }
    }
  } catch {
    // parse error — return empty
  }
  return map
}

function getNestedKey(obj: unknown, keys: string[]): unknown {
  let cur = obj
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined
    // Case-insensitive search
    const entry = Object.entries(cur as Record<string, unknown>).find(
      ([key]) => key.toLowerCase() === k.toLowerCase()
    )
    if (!entry) return undefined
    cur = entry[1]
  }
  return cur
}

function setNestedKey(
  obj: Record<string, unknown>,
  keys: string[],
  value: unknown
): void {
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    const existing = Object.entries(cur).find(([key]) => key.toLowerCase() === k.toLowerCase())
    if (existing) {
      if (typeof existing[1] !== 'object' || existing[1] === null) {
        cur[existing[0]] = {}
      }
      cur = cur[existing[0]] as Record<string, unknown>
    } else {
      cur[k] = {}
      cur = cur[k] as Record<string, unknown>
    }
  }
  const lastKey = keys[keys.length - 1]
  const existing = Object.entries(cur).find(([key]) => key.toLowerCase() === lastKey.toLowerCase())
  if (existing) {
    cur[existing[0]] = value
  } else {
    cur[lastKey] = value
  }
}

export function writeLaunchOption(
  localconfigPath: string,
  appId: string,
  options: string
): void {
  const raw = fs.readFileSync(localconfigPath, 'utf-8')
  const data = vdf.parse(raw) as Record<string, unknown>

  // Navigate to apps section, create if needed
  const appsPath = ['UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'Apps']
  let apps = getNestedKey(data, appsPath) as Record<string, unknown> | undefined
  if (!apps) {
    setNestedKey(data, appsPath, {})
    apps = getNestedKey(data, appsPath) as Record<string, unknown>
  }

  // Find or create the app entry (case-insensitive)
  const existingKey = Object.keys(apps).find((k) => k === appId)
  const appKey = existingKey ?? appId
  if (!apps[appKey] || typeof apps[appKey] !== 'object') {
    apps[appKey] = {}
  }
  const appEntry = apps[appKey] as Record<string, unknown>

  if (options.trim() === '') {
    delete appEntry['LaunchOptions']
    // Also try lowercase
    delete appEntry['launchoptions']
  } else {
    appEntry['LaunchOptions'] = options
  }

  writeAtomicVdf(localconfigPath, data)
}

function writeAtomicVdf(filePath: string, data: Record<string, unknown>): void {
  const bakPath = filePath + '.steamtools.bak'
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(filePath, bakPath)
  }

  const serialized = vdf.stringify(data)
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, serialized, 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

export function getCacheDir(): string {
  const xdgCache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
  return path.join(xdgCache, 'SteamToolsCachyOS')
}

// ── Account discovery ──────────────────────────────────────────────────────

export function listAccounts(userDataPath: string): Array<{ accountId: string; persona: string | null }> {
  const accounts: Array<{ accountId: string; persona: string | null }> = []
  if (!fs.existsSync(userDataPath)) return accounts

  // Try to read loginusers.vdf for persona names
  const loginUsers = path.join(path.dirname(userDataPath), 'config', 'loginusers.vdf')
  const personaMap = new Map<string, string>()
  if (fs.existsSync(loginUsers)) {
    try {
      const raw = fs.readFileSync(loginUsers, 'utf-8')
      const data = vdf.parse(raw) as Record<string, unknown>
      const users = data['users'] || data['Users']
      if (users && typeof users === 'object') {
        for (const [, userData] of Object.entries(users as Record<string, unknown>)) {
          if (userData && typeof userData === 'object') {
            const u = userData as Record<string, unknown>
            const steamId = String(u['SteamID'] ?? u['steamid'] ?? '')
            const persona = String(u['PersonaName'] ?? u['personaname'] ?? '')
            if (steamId && persona) personaMap.set(steamId, persona)
          }
        }
      }
    } catch { /* ignore */ }
  }

  try {
    const dirs = fs.readdirSync(userDataPath, { withFileTypes: true })
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      const lc = path.join(userDataPath, d.name, 'config', 'localconfig.vdf')
      if (fs.existsSync(lc)) {
        accounts.push({ accountId: d.name, persona: personaMap.get(d.name) ?? null })
      }
    }
  } catch { /* ignore */ }
  return accounts
}

// ── Batch read/write ───────────────────────────────────────────────────────

export function readAllLaunchOptionsForAccount(
  userDataPath: string,
  accountId: string
): Map<string, string> {
  const lc = path.join(userDataPath, accountId, 'config', 'localconfig.vdf')
  if (!fs.existsSync(lc)) return new Map()
  return readLaunchOptions(lc)
}

export function batchWriteLaunchOptions(
  userDataPath: string,
  accountId: string,
  updates: Map<string, string>
): string {
  const lc = path.join(userDataPath, accountId, 'config', 'localconfig.vdf')
  const raw = fs.readFileSync(lc, 'utf-8')
  const data = vdf.parse(raw) as Record<string, unknown>

  const appsPath = ['UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'Apps']
  let apps = getNestedKey(data, appsPath) as Record<string, unknown> | undefined
  if (!apps) {
    setNestedKey(data, appsPath, {})
    apps = getNestedKey(data, appsPath) as Record<string, unknown>
  }

  for (const [appId, value] of updates) {
    const existingKey = Object.keys(apps).find((k) => k === appId) ?? appId
    if (!apps[existingKey] || typeof apps[existingKey] !== 'object') {
      apps[existingKey] = {}
    }
    const appEntry = apps[existingKey] as Record<string, unknown>
    if (value.trim() === '') {
      delete appEntry['LaunchOptions']
      delete appEntry['launchoptions']
    } else {
      appEntry['LaunchOptions'] = value
    }
  }

  const bakPath = lc + '.steamtools.bak'
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(lc, bakPath)
  }

  const serialized = vdf.stringify(data)
  const tmpPath = lc + '.tmp'
  fs.writeFileSync(tmpPath, serialized, 'utf-8')
  fs.renameSync(tmpPath, lc)

  return bakPath
}

// ── Backup ─────────────────────────────────────────────────────────────────

export function latestBackupPath(userDataPath: string, accountId: string): string | null {
  const lc = path.join(userDataPath, accountId, 'config', 'localconfig.vdf')
  const bak = lc + '.steamtools.bak'
  return fs.existsSync(bak) ? bak : null
}

export function restoreBackup(userDataPath: string, accountId: string): string {
  const lc = path.join(userDataPath, accountId, 'config', 'localconfig.vdf')
  const bak = lc + '.steamtools.bak'
  if (!fs.existsSync(bak)) throw new Error(`No backup found at ${bak}`)
  fs.copyFileSync(bak, lc)
  return bak
}
