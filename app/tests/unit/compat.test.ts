import { describe, expect, it } from 'vitest'
import type { CompatMapping } from '../../src/main/services/steam/compat'
import { getCompatInfo, getSteamPlayDefault } from '../../src/main/services/steam/compat'

describe('compat tool mapping', () => {
  it('reads Steam Play default from mapping key "0"', () => {
    const mappings = {
      '0': { name: 'proton_experimental', config: '', Priority: '75' },
    } as unknown as CompatMapping
    expect(getSteamPlayDefault(mappings)).toEqual({
      toolName: 'proton_experimental',
      toolDescription: 'Proton Experimental',
    })
  })

  it('inherits Steam default when app has no CompatToolMapping entry', () => {
    const mappings = {
      '0': { name: 'proton_experimental', config: '', Priority: '75' },
    } as unknown as CompatMapping
    const info = getCompatInfo(mappings, 1091500)
    expect(info.selectionKind).toBe('steam_default')
    expect(info.toolName).toBe('proton_experimental')
    expect(info.toolDescription).toBe('Proton Experimental')
  })

  it('marks explicit per-game mapping that matches global as steam_default', () => {
    const mappings = {
      '0': { name: 'proton_experimental', config: '', Priority: '75' },
      '1245620': { name: 'proton_experimental', config: '', Priority: '75' },
    } as unknown as CompatMapping
    const info = getCompatInfo(mappings, 1245620)
    expect(info.selectionKind).toBe('steam_default')
    expect(info.sourceLabel).toBe('Steam default')
  })

  it('marks override when per-game tool differs from global', () => {
    const mappings = {
      '0': { name: 'proton_experimental', config: '', Priority: '75' },
      '1245620': { name: 'proton_hotfix', config: '', Priority: '75' },
    } as unknown as CompatMapping
    const info = getCompatInfo(mappings, 1245620)
    expect(info.selectionKind).toBe('override')
    expect(info.toolDescription).toBe('Proton Hotfix')
    expect(info.steamDefaultDescription).toBe('Proton Experimental')
  })

  it('forces native Linux when mapping entry clears compatibility tool', () => {
    const mappings = {
      '0': { name: 'proton_experimental', config: '', Priority: '75' },
      '1623730': { name: '0', config: '', Priority: '75' },
    } as unknown as CompatMapping
    const info = getCompatInfo(mappings, 1623730)
    expect(info.selectionKind).toBe('native')
    expect(info.toolName).toBeNull()
  })
})
