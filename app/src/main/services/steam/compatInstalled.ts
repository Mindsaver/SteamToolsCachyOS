import fs from 'fs'
import path from 'path'
import vdf from 'simple-vdf'
import type { CompatProviderId, InstalledCompatToolRow } from '../../../shared/types'
import { isGeProtonTag, isCachyosProtonTag } from '../../../shared/compatToolsPure'

function detectProvider(internalName: string, dirName: string): CompatProviderId | 'other' {
  const n = `${internalName} ${dirName}`
  if (isGeProtonTag(internalName) || /GE-Proton/i.test(n)) return 'ge_proton'
  if (isCachyosProtonTag(internalName) || /cachyos/i.test(internalName) || /Proton-CachyOS/i.test(dirName))
    return 'proton_cachyos'
  return 'other'
}

function readCompatToolVdf(vdfPath: string): { internalName: string; displayName: string } | null {
  try {
    const raw = fs.readFileSync(vdfPath, 'utf-8')
    const data = vdf.parse(raw) as Record<string, unknown>
    for (const topVal of Object.values(data)) {
      if (!topVal || typeof topVal !== 'object') continue
      const ct = (topVal as Record<string, unknown>)['compat_tools']
      if (!ct || typeof ct !== 'object') continue
      const entries = ct as Record<string, unknown>
      for (const [internalName, toolVal] of Object.entries(entries)) {
        if (!toolVal || typeof toolVal !== 'object') continue
        const tv = toolVal as Record<string, unknown>
        const dn = typeof tv['display_name'] === 'string' ? tv['display_name'] : internalName
        return { internalName, displayName: dn }
      }
    }
    const ct = data['compat_tools']
    if (ct && typeof ct === 'object') {
      const entries = ct as Record<string, unknown>
      for (const [internalName, toolVal] of Object.entries(entries)) {
        if (!toolVal || typeof toolVal !== 'object') continue
        const tv = toolVal as Record<string, unknown>
        const dn = typeof tv['display_name'] === 'string' ? tv['display_name'] : internalName
        return { internalName, displayName: dn }
      }
    }
  } catch {
    return null
  }
  return null
}

export function listInstalledCompatTools(steamInstall: string): InstalledCompatToolRow[] {
  const root = path.join(steamInstall, 'compatibilitytools.d')
  if (!fs.existsSync(root)) return []

  const out: InstalledCompatToolRow[] = []
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dirName = entry.name
      const installPath = path.join(root, dirName)
      const vdfPath = path.join(installPath, 'compatibilitytool.vdf')
      if (!fs.existsSync(vdfPath)) continue
      const parsed = readCompatToolVdf(vdfPath)
      if (!parsed) continue
      const provider = detectProvider(parsed.internalName, dirName)
      out.push({
        dirName,
        installPath,
        internalName: parsed.internalName,
        displayName: parsed.displayName,
        provider,
      })
    }
  } catch {
    return out
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
  return out
}
