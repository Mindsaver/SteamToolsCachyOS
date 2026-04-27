import fs from 'fs'
import path from 'path'
import vdf from 'simple-vdf'
import { loadCompatMappings } from './compat'

// Reads `compatibilitytools.d/<tool>/user_settings.py` for the active compat
// tool for a given appId and extracts non-default env key/value overrides.

const PROTON_ENV_RE = /PROTON_|DXVK_|WINEDLLOVERRIDES|VKD3D_/i
const USER_SETTINGS_KV_RE = /['"]([A-Za-z_][A-Za-z0-9_]*)['"]:\s*['"]([^'"]*)['"]/g

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

function extractUserSettingsKv(text: string): Record<string, string> {
  const body = stripPyCommentsAndStrings(text)
  const out: Record<string, string> = {}
  let m: RegExpExecArray | null
  const re = new RegExp(USER_SETTINGS_KV_RE.source, 'g')
  while ((m = re.exec(body)) !== null) {
    out[m[1]] = m[2]
  }
  return out
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

  const parsed = extractUserSettingsKv(text)
  if (!Object.keys(parsed).length) return {}

  // Strip keys identical to shipped sample defaults
  const samplePath = path.join(toolDir, 'user_settings.sample.py')
  if (fs.existsSync(samplePath)) {
    try {
      const sampleText = fs.readFileSync(samplePath, 'utf-8')
      const sampleParsed = extractUserSettingsKv(sampleText)
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
