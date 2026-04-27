/**
 * Typed catalog loader for launch-options.json.
 * No Node.js dependencies — safe to import in both main and renderer.
 *
 * All items share a single unified `Item` type. The `section` field controls
 * serialization behavior; `input` and `valueType` control the UI control.
 * No `kind` discriminant exists any more.
 */

import data from './launch-options.json'

// ── Types ──────────────────────────────────────────────────────────────────

export type ItemSection = 'env' | 'prefix-token' | 'gamescope'
export type InputType = 'toggle' | 'number' | 'enum' | 'text'
export type ValueType = 'bool' | 'int' | 'float' | 'string'

export interface CatalogRelation {
  target: string
  reason: string
}

export interface CatalogRelations {
  conflictsWith?: CatalogRelation[]
  implies?: CatalogRelation[]
}

/** Unified catalog item — all items share this shape. */
export interface Item {
  id: string
  label: string
  description?: string
  docs?: string
  /** References a tabs[].id in the catalog. */
  tab: string
  group?: string
  order?: number

  /** Controls serialization behavior. */
  section: ItemSection
  /** Controls which UI control is rendered. */
  input: InputType
  /** Describes the value type for parsing/coercion. */
  valueType: ValueType

  // Input shape (optional)
  options?: string[]
  min?: number
  max?: number
  step?: number
  placeholder?: string

  // section === 'env'
  tier?: 1 | 2 | 3 | 4
  risk?: 'safe' | 'experimental'
  gpuFamily?: 'any' | 'amd' | 'nvidia'
  envKey?: string
  envValue?: string

  // section === 'prefix-token'
  token?: string
  modelField?: 'mangohud' | 'gamemode' | 'gamePerformance'

  // section === 'gamescope'
  field?: string
  cliFlags?: string[]

  relations?: CatalogRelations
}

export interface CatalogGroup {
  id: string
  label: string
}

export interface CatalogTab {
  id: string
  label: string
  features?: string[]
  groups?: CatalogGroup[]
}

// ── Load & index ────────────────────────────────────────────────────────────

export const CATALOG_TABS: CatalogTab[] = data.tabs as CatalogTab[]
export const CATALOG: Item[] = data.items as Item[]
export const CATALOG_BY_ID: ReadonlyMap<string, Item> = new Map(
  CATALOG.map((i) => [i.id, i])
)

// ── Accessors ────────────────────────────────────────────────────────────────

export function getItemsBySection(section: ItemSection): Item[] {
  return CATALOG.filter((i) => i.section === section)
}

export function getItemsByTab(tabId: string): Item[] {
  return CATALOG.filter((i) => i.tab === tabId)
}

export function getTabById(tabId: string): CatalogTab | undefined {
  return CATALOG_TABS.find((t) => t.id === tabId)
}

/** Returns the tab with all its items grouped by group id/order. */
export function getItemsForTabGrouped(tabId: string): Map<string, Item[]> {
  const tab = getTabById(tabId)
  const items = getItemsByTab(tabId).slice().sort((a, b) => {
    const ga = a.group ?? ''
    const gb = b.group ?? ''
    if (ga !== gb) return ga.localeCompare(gb)
    return (a.order ?? 0) - (b.order ?? 0)
  })
  const map = new Map<string, Item[]>()
  for (const item of items) {
    const g = item.group ?? ''
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(item)
  }
  // Respect tab.groups order if defined
  if (tab?.groups?.length) {
    const ordered = new Map<string, Item[]>()
    for (const g of tab.groups) {
      if (map.has(g.id)) ordered.set(g.id, map.get(g.id)!)
    }
    // Append any ungrouped items
    if (map.has('')) ordered.set('', map.get('')!)
    return ordered
  }
  return map
}

/** All gamescope items sorted by (group, order). */
export function getGamescopeItems(): Item[] {
  return getItemsBySection('gamescope').slice().sort((a, b) => {
    const ga = a.group ?? ''
    const gb = b.group ?? ''
    if (ga !== gb) return ga.localeCompare(gb)
    return (a.order ?? 0) - (b.order ?? 0)
  })
}

/** Build a map from every CLI flag → its gamescope catalog item. */
export function buildGsFlagMap(): Map<string, Item> {
  const map = new Map<string, Item>()
  for (const item of getItemsBySection('gamescope')) {
    for (const flag of item.cliFlags ?? []) map.set(flag, item)
  }
  return map
}

export function getItemById(id: string): Item | undefined {
  return CATALOG_BY_ID.get(id)
}

// ── Legacy typed accessor aliases (kept for backward compatibility) ──────────

/** @deprecated Use getItemsBySection('env') */
export function getEnvPresets(): Item[] {
  return getItemsBySection('env')
}

/** @deprecated Use getItemsBySection('prefix-token') */
export function getWrappers(): Item[] {
  return getItemsBySection('prefix-token')
}

/** @deprecated Use getGamescopeItems().filter(i => i.input === 'toggle') */
export function getGamescopeToggles(): Item[] {
  return getItemsBySection('gamescope').filter((i) => i.input === 'toggle')
}

/** @deprecated Use getGamescopeItems().filter(i => i.input !== 'toggle') */
export function getGamescopeArgs(): Item[] {
  return getItemsBySection('gamescope').filter((i) => i.input !== 'toggle')
}

// ── Validation ──────────────────────────────────────────────────────────────

export function validateCatalog(): { errors: string[] } {
  const errors: string[] = []
  const ids = new Set<string>()
  const tabIds = new Set(CATALOG_TABS.map((t) => t.id))

  // Unique IDs
  for (const item of CATALOG) {
    if (ids.has(item.id)) {
      errors.push(`Duplicate id: "${item.id}"`)
    }
    ids.add(item.id)
  }

  // Every item references a known tab
  for (const item of CATALOG) {
    if (!tabIds.has(item.tab)) {
      errors.push(`"${item.id}".tab "${item.tab}" does not match any tabs[].id`)
    }
  }

  // section=env: unique (envKey, envValue) pairs; required fields
  const envPairs = new Map<string, string>()
  for (const item of CATALOG) {
    if (item.section !== 'env') continue
    if (!item.envKey || item.envValue === undefined) {
      errors.push(`"${item.id}" has section=env but missing envKey or envValue`)
      continue
    }
    const key = `${item.envKey}=${item.envValue}`
    if (envPairs.has(key)) {
      errors.push(`Duplicate env pair ${key} in "${item.id}" and "${envPairs.get(key)}"`)
    } else {
      envPairs.set(key, item.id)
    }
  }

  // section=prefix-token: unique modelField; required fields
  const wrapperFields = new Map<string, string>()
  for (const item of CATALOG) {
    if (item.section !== 'prefix-token') continue
    if (!item.token || !item.modelField) {
      errors.push(`"${item.id}" has section=prefix-token but missing token or modelField`)
      continue
    }
    if (wrapperFields.has(item.modelField)) {
      errors.push(`Duplicate prefix-token modelField "${item.modelField}" in "${item.id}" and "${wrapperFields.get(item.modelField)}"`)
    } else {
      wrapperFields.set(item.modelField, item.id)
    }
  }

  // section=gamescope: unique field across all gamescope items; unique cliFlags; required fields
  const gsFields = new Map<string, string>()
  const gsFlags = new Map<string, string>()
  for (const item of CATALOG) {
    if (item.section !== 'gamescope') continue
    if (!item.field) {
      errors.push(`"${item.id}" has section=gamescope but missing field`)
    } else {
      if (gsFields.has(item.field)) {
        errors.push(`Duplicate gamescope field "${item.field}" in "${item.id}" and "${gsFields.get(item.field)}"`)
      } else {
        gsFields.set(item.field, item.id)
      }
    }
    if (!item.cliFlags || item.cliFlags.length === 0) {
      errors.push(`"${item.id}" has section=gamescope but missing or empty cliFlags`)
    } else {
      for (const flag of item.cliFlags) {
        if (!flag.startsWith('-')) {
          errors.push(`"${item.id}".cliFlags entry "${flag}" does not start with '-'`)
        }
        if (gsFlags.has(flag)) {
          errors.push(`Duplicate CLI flag "${flag}" in "${item.id}" and "${gsFlags.get(flag)}"`)
        } else {
          gsFlags.set(flag, item.id)
        }
      }
    }
  }

  // enum items must have a non-empty options array
  for (const item of CATALOG) {
    if (item.input === 'enum') {
      if (!item.options || item.options.length === 0) {
        errors.push(`"${item.id}" has input=enum but missing or empty "options" array`)
      }
    }
  }

  // All relation targets must resolve
  for (const item of CATALOG) {
    const relations = item.relations
    if (!relations) continue
    for (const rel of relations.conflictsWith ?? []) {
      if (!ids.has(rel.target)) {
        errors.push(`"${item.id}".relations.conflictsWith references unknown id "${rel.target}"`)
      }
    }
    for (const rel of relations.implies ?? []) {
      if (!ids.has(rel.target)) {
        errors.push(`"${item.id}".relations.implies references unknown id "${rel.target}"`)
      }
    }
  }

  // conflictsWith must be symmetric
  for (const item of CATALOG) {
    for (const rel of item.relations?.conflictsWith ?? []) {
      const target = CATALOG_BY_ID.get(rel.target)
      if (!target) continue
      const targetConflicts = target.relations?.conflictsWith ?? []
      const hasBack = targetConflicts.some((r) => r.target === item.id)
      if (!hasBack) {
        errors.push(
          `Asymmetric conflict: "${item.id}" conflictsWith "${rel.target}" but "${rel.target}" does not list "${item.id}" in its conflictsWith`
        )
      }
    }
  }

  return { errors }
}

// Run validation once at module load.
const _validationResult = validateCatalog()
if (_validationResult.errors.length > 0) {
  const msg = `[launch-options catalog] Validation errors:\n${_validationResult.errors.map((e) => `  • ${e}`).join('\n')}`
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    throw new Error(msg)
  }
  console.error(msg)
}
