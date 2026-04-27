import fs from 'fs'
import path from 'path'
import vdf from 'simple-vdf'
import type { CompatToolInfo } from '../../../shared/types'

// Ports steam_compat_context.py — reads config.vdf CompatToolMapping
// to identify what Proton/compat tool is configured per game.

interface CompatMapping {
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

function toolLabel(name: string): string {
  const lower = name.toLowerCase().replace(/[-_ ]/g, '_')
  if (TOOL_LABELS[lower]) return TOOL_LABELS[lower]
  // Proton 9.x, etc.
  const protonMatch = /proton[_\s-]?(\d+[\d.]*)/i.exec(name)
  if (protonMatch) return `Proton ${protonMatch[1]}`
  return name
}

export function getCompatInfo(mappings: CompatMapping, appId: number): CompatToolInfo {
  const entry = mappings[String(appId)]
  if (!entry) {
    return { toolName: null, toolDescription: null, sourceLabel: 'global default' }
  }
  const name = entry.name ?? ''
  if (!name || name === '0') {
    return { toolName: null, toolDescription: 'Steam Linux native', sourceLabel: 'per-game (none)' }
  }
  return {
    toolName: name,
    toolDescription: toolLabel(name),
    sourceLabel: 'per-game',
  }
}
