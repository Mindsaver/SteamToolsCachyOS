import { describe, it, expect } from 'vitest'
import {
  validateCatalog,
  CATALOG,
  CATALOG_TABS,
  CATALOG_BY_ID,
  getItemsBySection,
  getItemsByTab,
  getGamescopeItems,
  buildGsFlagMap,
  getItemById,
  getEnvPresets,
  getWrappers,
  getGamescopeToggles,
  getGamescopeArgs,
} from '../../src/shared/launchOptions/catalog'

describe('validateCatalog', () => {
  it('produces no errors for the bundled catalog', () => {
    const { errors } = validateCatalog()
    expect(errors).toEqual([])
  })

  it('has at least 29 env items', () => {
    expect(getItemsBySection('env').length).toBeGreaterThanOrEqual(29)
  })

  it('has exactly 3 prefix-token items', () => {
    expect(getItemsBySection('prefix-token').length).toBe(3)
  })

  it('has at least 8 gamescope toggle items', () => {
    expect(getGamescopeItems().filter((i) => i.input === 'toggle').length).toBeGreaterThanOrEqual(8)
  })

  it('has at least 10 gamescope arg items', () => {
    expect(getGamescopeItems().filter((i) => i.input !== 'toggle').length).toBeGreaterThanOrEqual(10)
  })

  it('no item has a "kind" field (legacy field removed)', () => {
    for (const item of CATALOG) {
      expect((item as unknown as Record<string, unknown>)['kind']).toBeUndefined()
    }
  })

  it('all item IDs are unique', () => {
    const ids = CATALOG.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every item references a valid tab id', () => {
    const tabIds = new Set(CATALOG_TABS.map((t) => t.id))
    for (const item of CATALOG) {
      expect(tabIds.has(item.tab)).toBe(true)
    }
  })

  it('every relation target resolves to a real item', () => {
    const errors: string[] = []
    for (const item of CATALOG) {
      for (const rel of item.relations?.conflictsWith ?? []) {
        if (!CATALOG_BY_ID.has(rel.target)) {
          errors.push(`${item.id}.conflictsWith → unknown ${rel.target}`)
        }
      }
      for (const rel of item.relations?.implies ?? []) {
        if (!CATALOG_BY_ID.has(rel.target)) {
          errors.push(`${item.id}.implies → unknown ${rel.target}`)
        }
      }
    }
    expect(errors).toEqual([])
  })

  it('conflictsWith is symmetric for all items', () => {
    const asymmetric: string[] = []
    for (const item of CATALOG) {
      for (const rel of item.relations?.conflictsWith ?? []) {
        const target = CATALOG_BY_ID.get(rel.target)
        if (!target) continue
        const hasBack = (target.relations?.conflictsWith ?? []).some((r) => r.target === item.id)
        if (!hasBack) asymmetric.push(`${item.id} → ${rel.target} (no back-ref)`)
      }
    }
    expect(asymmetric).toEqual([])
  })

  it('each prefix-token item has a unique modelField', () => {
    const fields = getItemsBySection('prefix-token').map((w) => w.modelField)
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('all gamescope fields are unique across all gamescope items', () => {
    const fields = getGamescopeItems().map((i) => i.field)
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('all gamescope cliFlags are unique across all items', () => {
    const flags: string[] = []
    for (const item of getGamescopeItems()) flags.push(...(item.cliFlags ?? []))
    expect(new Set(flags).size).toBe(flags.length)
  })

  it('all gamescope cliFlags start with -', () => {
    for (const item of getGamescopeItems()) {
      for (const flag of item.cliFlags ?? []) {
        expect(flag.startsWith('-')).toBe(true)
      }
    }
  })

  it('enum items have a non-empty options array', () => {
    for (const item of CATALOG) {
      if (item.input === 'enum') {
        expect(item.options).toBeDefined()
        expect(item.options!.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('getItemsBySection', () => {
  it('returns only env items', () => {
    const items = getItemsBySection('env')
    expect(items.every((i) => i.section === 'env')).toBe(true)
  })

  it('returns only prefix-token items', () => {
    const items = getItemsBySection('prefix-token')
    expect(items.every((i) => i.section === 'prefix-token')).toBe(true)
  })

  it('returns only gamescope items', () => {
    const items = getItemsBySection('gamescope')
    expect(items.every((i) => i.section === 'gamescope')).toBe(true)
  })
})

describe('getItemsByTab', () => {
  it('returns only items for the given tab', () => {
    const items = getItemsByTab('wrappers')
    expect(items.every((i) => i.tab === 'wrappers')).toBe(true)
  })

  it('wrappers tab has prefix-token items', () => {
    const items = getItemsByTab('wrappers')
    expect(items.every((i) => i.section === 'prefix-token')).toBe(true)
  })
})

describe('getItemById', () => {
  it('returns mesa_anti_lag item with section=env', () => {
    const item = getItemById('mesa_anti_lag')
    expect(item).toBeDefined()
    expect(item!.section).toBe('env')
  })

  it('returns mangohud item with section=prefix-token', () => {
    const item = getItemById('mangohud')
    expect(item).toBeDefined()
    expect(item!.section).toBe('prefix-token')
  })

  it('returns gs_hdr item with section=gamescope', () => {
    const item = getItemById('gs_hdr')
    expect(item).toBeDefined()
    expect(item!.section).toBe('gamescope')
    expect(item!.input).toBe('toggle')
  })

  it('returns gs_frameLimit as gamescope number input', () => {
    const item = getItemById('gs_frameLimit')
    expect(item).toBeDefined()
    expect(item!.section).toBe('gamescope')
    expect(item!.input).toBe('number')
  })

  it('returns gs_scaler as enum input', () => {
    const item = getItemById('gs_scaler')
    expect(item).toBeDefined()
    expect(item!.input).toBe('enum')
    expect(item!.options).toBeDefined()
  })

  it('returns undefined for unknown id', () => {
    expect(getItemById('does_not_exist')).toBeUndefined()
  })
})

describe('buildGsFlagMap', () => {
  it('maps -f to gs_fullscreen', () => {
    const map = buildGsFlagMap()
    expect(map.get('-f')?.id).toBe('gs_fullscreen')
  })

  it('maps --hdr-enabled to gs_hdr', () => {
    const map = buildGsFlagMap()
    expect(map.get('--hdr-enabled')?.id).toBe('gs_hdr')
  })

  it('maps -W to gs_width', () => {
    const map = buildGsFlagMap()
    expect(map.get('-W')?.id).toBe('gs_width')
  })
})

describe('catalog relations content', () => {
  it('mesa_anti_lag conflicts with mesa_anti_lag_disable', () => {
    const item = getItemById('mesa_anti_lag')!
    const conflicts = item.relations?.conflictsWith ?? []
    expect(conflicts.some((c) => c.target === 'mesa_anti_lag_disable')).toBe(true)
  })

  it('mesa_anti_lag_disable conflicts with mesa_anti_lag (symmetry)', () => {
    const item = getItemById('mesa_anti_lag_disable')!
    const conflicts = item.relations?.conflictsWith ?? []
    expect(conflicts.some((c) => c.target === 'mesa_anti_lag')).toBe(true)
  })

  it('proton_fsr4_rdna3 implies proton_fsr4', () => {
    const item = getItemById('proton_fsr4_rdna3')!
    const implies = item.relations?.implies ?? []
    expect(implies.some((i) => i.target === 'proton_fsr4')).toBe(true)
  })

  it('gs_hdr implies proton_hdr', () => {
    const item = getItemById('gs_hdr')!
    const implies = item.relations?.implies ?? []
    expect(implies.some((i) => i.target === 'proton_hdr')).toBe(true)
  })

  it('proton_hide_apu conflicts with proton_hide_nvidia', () => {
    const item = getItemById('proton_hide_apu')!
    const conflicts = item.relations?.conflictsWith ?? []
    expect(conflicts.some((c) => c.target === 'proton_hide_nvidia')).toBe(true)
  })

  it('gs_mangoapp conflicts with mangohud', () => {
    const item = getItemById('gs_mangoapp')!
    const conflicts = item.relations?.conflictsWith ?? []
    expect(conflicts.some((c) => c.target === 'mangohud')).toBe(true)
  })
})

describe('legacy accessor aliases', () => {
  it('getEnvPresets() returns same as getItemsBySection(env)', () => {
    expect(getEnvPresets()).toEqual(getItemsBySection('env'))
  })

  it('getWrappers() returns same as getItemsBySection(prefix-token)', () => {
    expect(getWrappers()).toEqual(getItemsBySection('prefix-token'))
  })

  it('getGamescopeToggles() returns only toggle items from gamescope section', () => {
    const result = getGamescopeToggles()
    expect(result.every((i) => i.section === 'gamescope' && i.input === 'toggle')).toBe(true)
  })

  it('getGamescopeArgs() returns only non-toggle items from gamescope section', () => {
    const result = getGamescopeArgs()
    expect(result.every((i) => i.section === 'gamescope' && i.input !== 'toggle')).toBe(true)
  })
})
