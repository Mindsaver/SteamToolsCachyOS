import fs from 'fs'
import path from 'path'
import vdf from 'simple-vdf'
import type { CompatSelectionKind, CompatToolInfo } from '../../../shared/types'

// Reads config.vdf CompatToolMapping for Steam compatibility-tool context.
// Global Steam Play default is stored under mapping key "0"; per-game overrides use app IDs.

export interface CompatMapping {
  [appId: string]: {
    name?: string
    config?: string
    Priority?: string
  }
}

export function loadCompatMappings(steamInstall: string): CompatMapping {
  const configVdf = path.join(steamInstall, 'config', 'config.vdf')
  if (!fs.existsSync(configVdf)) return {}

  try {
    const raw = fs.readFileSync(configVdf, 'utf-8')
    const data = vdf.parse(raw) as Record<string, unknown>
    // InstallConfigStore > Software > Valve > Steam > CompatToolMapping
    const mapping = getNestedCaseInsensitive(data, [
      'InstallConfigStore',
      'Software',
      'Valve',
      'Steam',
      'CompatToolMapping',
    ])
    if (!mapping || typeof mapping !== 'object') return {}
    return mapping as CompatMapping
  } catch {
    return {}
  }
}

function getNestedCaseInsensitive(obj: unknown, keys: string[]): unknown {
  let cur = obj
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined
    const entry = Object.entries(cur as Record<string, unknown>).find(
      ([key]) => key.toLowerCase() === k.toLowerCase()
    )
    if (!entry) return undefined
    cur = entry[1]
  }
  return cur
}

const TOOL_LABELS: Record<string, string> = {
  proton_experimental: 'Proton Experimental',
  proton_hotfix: 'Proton Hotfix',
  steamlinuxruntime: 'Steam Linux Runtime',
}

export function toolLabel(name: string): string {
  const lower = name.toLowerCase().replace(/[-_ ]/g, '_')
  if (TOOL_LABELS[lower]) return TOOL_LABELS[lower]
  // Proton 9.x, etc.
  const protonMatch = /proton[_\s-]?(\d+[\d.]*)/i.exec(name)
  if (protonMatch) return `Proton ${protonMatch[1]}`
  return name
}

/** Steam Play default compatibility tool from CompatToolMapping key "0". */
export function getSteamPlayDefault(mappings: CompatMapping): {
  toolName: string | null
  toolDescription: string | null
} {
  const entry = mappings['0']
  if (!entry || typeof entry !== 'object') {
    return { toolName: null, toolDescription: null }
  }
  const raw = entry.name
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name || name === '0') {
    return { toolName: null, toolDescription: null }
  }
  return { toolName: name, toolDescription: toolLabel(name) }
}

function baseFields(
  selectionKind: CompatSelectionKind,
  def: { toolName: string | null; toolDescription: string | null },
  overrides: Partial<CompatToolInfo>
): CompatToolInfo {
  return {
    steamDefaultToolName: def.toolName,
    steamDefaultDescription: def.toolDescription,
    ...overrides,
    selectionKind,
  }
}

export function getCompatInfo(mappings: CompatMapping, appId: number): CompatToolInfo {
  const def = getSteamPlayDefault(mappings)
  const entry = mappings[String(appId)]

  if (!entry) {
    return baseFields('steam_default', def, {
      toolName: def.toolName,
      toolDescription: def.toolDescription,
      sourceLabel: 'Steam default',
    })
  }

  const rawName = entry.name
  const name = typeof rawName === 'string' ? rawName.trim() : ''
  if (!name || name === '0') {
    return baseFields('native', def, {
      toolName: null,
      toolDescription: 'Steam Linux native',
      sourceLabel: 'Linux native (per-game)',
    })
  }

  const sameAsGlobal = def.toolName !== null && name === def.toolName
  return baseFields(sameAsGlobal ? 'steam_default' : 'override', def, {
    toolName: name,
    toolDescription: toolLabel(name),
    sourceLabel: sameAsGlobal ? 'Steam default' : 'Per-game override',
  })
}
