import { describe, it, expect } from 'vitest'
import {
  pickGeArchiveAsset,
  pickGeSha512Asset,
  pickCachyosArchiveAsset,
  pickCachyosSha512Asset,
  filterCachyosReleases,
  compareGeTagsDesc,
  bestInstalledGeTag,
  extractCachyosTagFromText,
  expectedCachyosArchiveName,
  isRollingLineCompatToolRow,
  latestSlotSteamDirName,
  latestSlotDisplayName,
} from '../../src/shared/compatToolsPure'

describe('compatToolsPure', () => {
  it('pickGeArchive prefers zst', () => {
    const assets = [
      { name: 'GE-Proton10-34.tar.gz', browser_download_url: 'https://x/gz', size: 1 },
      { name: 'GE-Proton10-34.tar.zst', browser_download_url: 'https://x/zst', size: 1 },
    ]
    expect(pickGeArchiveAsset(assets, 'GE-Proton10-34')?.name).toBe('GE-Proton10-34.tar.zst')
  })

  it('pickGeArchive falls back to gz', () => {
    const assets = [{ name: 'GE-Proton10-34.tar.gz', browser_download_url: 'https://x/gz', size: 1 }]
    expect(pickGeArchiveAsset(assets, 'GE-Proton10-34')?.name).toBe('GE-Proton10-34.tar.gz')
  })

  it('pickGeSha512', () => {
    const assets = [{ name: 'GE-Proton10-34.sha512sum', browser_download_url: 'https://x/s', size: 1 }]
    expect(pickGeSha512Asset(assets, 'GE-Proton10-34')?.name).toBe('GE-Proton10-34.sha512sum')
  })

  it('compareGeTagsDesc orders newer first for sort', () => {
    const tags = ['GE-Proton10-30', 'GE-Proton10-34', 'GE-Proton9-20']
    tags.sort(compareGeTagsDesc)
    expect(tags[0]).toBe('GE-Proton10-34')
  })

  it('bestInstalledGeTag', () => {
    expect(bestInstalledGeTag(['foo', 'GE-Proton10-30', 'GE-Proton10-34'])).toBe('GE-Proton10-34')
  })

  it('filterCachyosReleases slrOnly', () => {
    const rel = [
      { tag_name: 'cachyos-10.0-slr', published_at: '', assets: [] },
      { tag_name: 'cachyos-10.0-native', published_at: '', assets: [] },
      { tag_name: 'other', published_at: '', assets: [] },
    ]
    const slr = filterCachyosReleases(rel, true)
    expect(slr.map((r) => r.tag_name)).toEqual(['cachyos-10.0-slr'])
    const all = filterCachyosReleases(rel, false)
    expect(all.map((r) => r.tag_name)).toEqual(['cachyos-10.0-slr', 'cachyos-10.0-native'])
  })

  it('expectedCachyosArchiveName', () => {
    expect(expectedCachyosArchiveName('cachyos-10.0-20260420-slr', 'x86_64')).toBe(
      'proton-cachyos-10.0-20260420-slr-x86_64.tar.xz'
    )
  })

  it('pickCachyosArchiveAsset', () => {
    const tag = 'cachyos-10.0-20260420-slr'
    const name = 'proton-cachyos-10.0-20260420-slr-x86_64.tar.xz'
    const sum = 'proton-cachyos-10.0-20260420-slr-x86_64.sha512sum'
    const assets = [
      { name, browser_download_url: 'https://x/a.tar.xz', size: 1 },
      { name: sum, browser_download_url: 'https://x/s', size: 1 },
    ]
    expect(pickCachyosArchiveAsset(assets, tag, 'x86_64')?.name).toBe(name)
    expect(pickCachyosSha512Asset(assets, tag, 'x86_64')?.name).toBe(sum)
  })

  it('extractCachyosTagFromText', () => {
    expect(extractCachyosTagFromText('Proton-CachyOS Latest')).toBe(null)
    expect(extractCachyosTagFromText('foo cachyos-10.0-20260420-slr bar')).toBe('cachyos-10.0-20260420-slr')
  })

  it('isRollingLineCompatToolRow detects Latest / rolling branding', () => {
    expect(
      isRollingLineCompatToolRow({
        displayName: 'Proton-CachyOS (Latest)',
        internalName: 'cachyos-10.0-slr',
        dirName: 'Proton-CachyOS',
        provider: 'proton_cachyos',
      })
    ).toBe(true)
    expect(
      isRollingLineCompatToolRow({
        displayName: 'GE-Proton',
        internalName: 'GE-Proton10-50',
        dirName: 'GE-Proton',
        provider: 'ge_proton',
      })
    ).toBe(false)
    expect(
      isRollingLineCompatToolRow({
        displayName: 'GE-Proton (Latest)',
        internalName: 'GE-Proton10-50',
        dirName: 'GE-Proton',
        provider: 'ge_proton',
      })
    ).toBe(true)
  })

  it('latest slot Steam folder and display names', () => {
    expect(latestSlotSteamDirName('proton_cachyos')).toBe('Proton-CachyOS Latest')
    expect(latestSlotDisplayName('proton_cachyos')).toBe('Proton-CachyOS (Latest)')
    expect(latestSlotSteamDirName('ge_proton')).toBe('GE-Proton Latest')
  })
})
