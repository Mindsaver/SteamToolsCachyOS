import fs from 'fs'
import path from 'path'
import vdf from 'simple-vdf'
import { parseUserSettingsEnvFromText, formatUserSettingsPyFile } from '../../../shared/userSettingsPy'
import { loadCompatMappings } from './compat'

// Reads `compatibilitytools.d/<tool>/user_settings.py` for the active compat
// tool for a given appId and extracts non-default env key/value overrides.

const PROTON_ENV_RE = /PROTON_|DXVK_|WINEDLLOVERRIDES|VKD3D_/i

function stripPyCommentsAndStrings(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('#')) return ''
      const hashIdx = line.indexOf('#')
      return hashIdx >= 0 ? line.slice(0, hashIdx) : line
    })
    .join('\n')
}

function userSettingsLooksActive(text: string): boolean {
  const body = stripPyCommentsAndStrings(text)
  if (!body.trim()) return false
  if (PROTON_ENV_RE.test(body)) return true
  if (body.includes('user_settings') && body.includes('{')) {
    const inner = /user_settings\s*=\s*\{([^}]*)\}/s.exec(body)
    if (inner) {
      for (const line of inner[1].split('\n')) {
        const l = line.trim()
        if (!l || l.startsWith('#')) continue
        if (l.includes(':') || l.includes('=')) return true
      }
    }
  }
  return false
}

/** Full env dict from file (no sample filtering). Missing file → {}. */
export function readUserSettingsEnvRaw(toolDir: string): Record<string, string> {
  const usPath = path.join(toolDir, 'user_settings.py')
  if (!fs.existsSync(usPath)) return {}
  try {
    const text = fs.readFileSync(usPath, 'utf-8')
    return parseUserSettingsEnvFromText(text)
  } catch {
    return {}
  }
}

export function readUserSettingsFileText(toolDir: string): string {
  const usPath = path.join(toolDir, 'user_settings.py')
  if (!fs.existsSync(usPath)) return ''
  try {
    return fs.readFileSync(usPath, 'utf-8')
  } catch {
    return ''
  }
}

export function writeUserSettingsPyFile(toolDir: string, fileText: string): void {
  const usPath = path.join(toolDir, 'user_settings.py')
  fs.mkdirSync(toolDir, { recursive: true })
  fs.writeFileSync(usPath, fileText, 'utf-8')
}

// ── Named backups (Proton user settings UI) ─────────────────────────────────

const USER_SETTINGS_BACKUPS_SUBDIR = 'steamtools-user-settings-backups'
const MAX_BACKUP_BASENAME_LEN = 128

/** Single path segment only; safe for join(toolDir, subdir, name). */
export function safeBackupBasename(
  fileName: string
): { ok: true; name: string } | { ok: false; error: string } {
  const t = fileName.trim()
  if (!t) return { ok: false, error: 'Empty file name' }
  if (t !== path.basename(t)) return { ok: false, error: 'Path separators not allowed' }
  if (t.includes('..')) return { ok: false, error: 'Invalid file name' }
  if (t.length > MAX_BACKUP_BASENAME_LEN) return { ok: false, error: 'File name too long' }
  if (!/^[a-zA-Z0-9._\- ]+$/.test(t)) {
    return { ok: false, error: 'Use only letters, numbers, spaces, dot, dash, underscore' }
  }
  return { ok: true, name: t }
}

export function userSettingsBackupsDir(toolDir: string): string {
  return path.join(toolDir, USER_SETTINGS_BACKUPS_SUBDIR)
}

export function listUserSettingsBackups(toolDir: string): { fileName: string; mtimeMs: number }[] {
  const dir = userSettingsBackupsDir(toolDir)
  if (!fs.existsSync(dir)) return []
  const out: { fileName: string; mtimeMs: number }[] = []
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isFile()) continue
      const safe = safeBackupBasename(ent.name)
      if (!safe.ok) continue
      const p = path.join(dir, ent.name)
      try {
        const st = fs.statSync(p)
        out.push({ fileName: ent.name, mtimeMs: st.mtimeMs })
      } catch {
        // skip
      }
    }
  } catch {
    return []
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return out
}

export function writeUserSettingsBackupFile(
  toolDir: string,
  fileName: string,
  content: string
): { ok: true } | { ok: false; error: string } {
  const safe = safeBackupBasename(fileName)
  if (!safe.ok) return safe
  try {
    const dir = userSettingsBackupsDir(toolDir)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, safe.name), content, 'utf-8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Write failed' }
  }
}

export function readUserSettingsBackupFile(
  toolDir: string,
  fileName: string
): { ok: true; fileText: string } | { ok: false; error: string } {
  const safe = safeBackupBasename(fileName)
  if (!safe.ok) return safe
  const p = path.join(userSettingsBackupsDir(toolDir), safe.name)
  if (!fs.existsSync(p)) return { ok: false, error: 'Backup not found' }
  try {
    const fileText = fs.readFileSync(p, 'utf-8')
    return { ok: true, fileText }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Read failed' }
  }
}

/** Create `user_settings.py` if missing. Prefer copying `user_settings.sample.py` when present. */
export function createMinimalUserSettingsPy(toolDir: string): { ok: true } | { ok: false; error: string } {
  const usPath = path.join(toolDir, 'user_settings.py')
  if (fs.existsSync(usPath)) {
    return { ok: false, error: 'user_settings.py already exists' }
  }
  const samplePath = path.join(toolDir, 'user_settings.sample.py')
  if (fs.existsSync(samplePath)) {
    try {
      fs.copyFileSync(samplePath, usPath)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'copy failed' }
    }
  }
  try {
    writeUserSettingsPyFile(toolDir, formatUserSettingsPyFile({}))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'write failed' }
  }
}

/** Extract env overrides from a Proton tool's user_settings.py.
 *  Returns {} when the file is missing, empty, or identical to sample defaults. */
export function userSettingsEnvOverrides(toolDir: string): Record<string, string> {
  const usPath = path.join(toolDir, 'user_settings.py')
  if (!fs.existsSync(usPath)) return {}

  let text: string
  try {
    text = fs.readFileSync(usPath, 'utf-8')
  } catch {
    return {}
  }

  if (!userSettingsLooksActive(text)) return {}

  const parsed = parseUserSettingsEnvFromText(text)
  if (!Object.keys(parsed).length) return {}

  // Strip keys identical to shipped sample defaults
  const samplePath = path.join(toolDir, 'user_settings.sample.py')
  if (fs.existsSync(samplePath)) {
    try {
      const sampleText = fs.readFileSync(samplePath, 'utf-8')
      const sampleParsed = parseUserSettingsEnvFromText(sampleText)
      for (const k of Object.keys(parsed)) {
        if (sampleParsed[k] === parsed[k]) delete parsed[k]
      }
    } catch {
      // ignore; use full parsed
    }
  }

  return parsed
}

/** Resolve the compatibilitytools.d install directory for a named tool.
 *  Tries a direct match first, then scans for a `compatibilitytool.vdf` that
 *  lists the internal name in `compat_tools`. */
export function resolveToolInstallDir(steamInstall: string, internalName: string): string | null {
  if (!internalName.trim()) return null
  const root = path.join(steamInstall, 'compatibilitytools.d')
  if (!fs.existsSync(root)) return null

  // Direct match: ~/.steam/steam/compatibilitytools.d/<internalName>/compatibilitytool.vdf
  const direct = path.join(root, internalName)
  if (fs.existsSync(path.join(direct, 'compatibilitytool.vdf'))) return direct

  // Scan: find a sub-dir whose compatibilitytool.vdf lists this internal name
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const vdfPath = path.join(root, entry.name, 'compatibilitytool.vdf')
      if (!fs.existsSync(vdfPath)) continue
      if (vdfListsCompatTool(vdfPath, internalName)) {
        return path.join(root, entry.name)
      }
    }
  } catch {
    return null
  }

  return null
}

function vdfListsCompatTool(vdfPath: string, internalName: string): boolean {
  try {
    const raw = fs.readFileSync(vdfPath, 'utf-8')
    const data = vdf.parse(raw) as Record<string, unknown>
    for (const topVal of Object.values(data)) {
      if (!topVal || typeof topVal !== 'object') continue
      const ct = (topVal as Record<string, unknown>)['compat_tools']
      if (ct && typeof ct === 'object' && internalName in (ct as object)) return true
    }
    const ct = data['compat_tools']
    if (ct && typeof ct === 'object' && internalName in (ct as object)) return true
  } catch {
    // ignore
  }
  return false
}

/** Given a Steam install path and appId, resolve the active compat tool and
 *  return the env overrides declared in its user_settings.py.
 *  Returns {} if no compat tool is active or user_settings.py has no customizations. */
export function getGlobalEnvOverridesForApp(
  steamInstall: string,
  appId: number
): Record<string, string> {
  const mappings = loadCompatMappings(steamInstall)

  // Prefer per-game entry, fall back to default (key "0")
  const perGame = mappings[String(appId)]
  const defaultEntry = mappings['0']
  const entry = perGame ?? defaultEntry
  if (!entry) return {}

  const toolName = entry.name?.trim()
  if (!toolName || toolName === '0') return {}

  const toolDir = resolveToolInstallDir(steamInstall, toolName)
  if (!toolDir) return {}

  return userSettingsEnvOverrides(toolDir)
}
