/** Pure helpers for compatibility-tool install (unit-tested; no Node I/O). */

import type { CachyosArchChoice, CompatProviderId, InstalledCompatToolRow } from './types'

export interface ReleaseAssetStub {
  name: string
  browser_download_url: string
  size: number
}

export interface ReleaseStub {
  tag_name: string
  published_at: string
  assets: ReleaseAssetStub[]
}

const GE_TAG_RE = /^GE-Proton(\d+)-(\d+)$/i

/** Sort key for GE tags: higher = newer. Unknown shape sorts first (0,0). */
export function geTagSortKey(tag: string): [number, number] {
  const m = tag.trim().match(GE_TAG_RE)
  if (!m) return [0, 0]
  return [parseInt(m[1], 10), parseInt(m[2], 10)]
}

export function compareGeTagsDesc(a: string, b: string): number {
  const [ma, ia] = geTagSortKey(a)
  const [mb, ib] = geTagSortKey(b)
  if (ma !== mb) return mb - ma
  return ib - ia
}

export function isGeProtonTag(tag: string): boolean {
  return GE_TAG_RE.test(tag.trim())
}

export function isCachyosProtonTag(tag: string): boolean {
  return tag.trim().toLowerCase().startsWith('cachyos-')
}

/**
 * Steam compatibility tool rows that represent the “rolling / Latest” product line (not a fixed version-only slot).
 * Used to show per-install auto-update + CachyOS options only on that entry.
 */
export function isRollingLineCompatToolRow(
  row: Pick<InstalledCompatToolRow, 'displayName' | 'internalName' | 'dirName' | 'provider'>
): boolean {
  if (row.provider !== 'ge_proton' && row.provider !== 'proton_cachyos') return false
  const blob = `${row.displayName} ${row.internalName} ${row.dirName}`.toLowerCase()
  if (/\blatest\b/.test(blob)) return true
  if (/\brolling\b/.test(blob)) return true
  if (/\bprotontip\b/.test(blob)) return true
  if (row.internalName === latestSlotInternalToolName('ge_proton')) return true
  if (row.internalName === latestSlotInternalToolName('proton_cachyos')) return true
  return false
}

/** `compatibilitytools.d` folder name for our managed Latest install. */
export function latestSlotSteamDirName(provider: CompatProviderId): string {
  return provider === 'ge_proton' ? 'GE-Proton Latest' : 'Proton-CachyOS Latest'
}

/** Stable `compat_tools` key so Steam + this app keep the same tool across tag bumps. */
export function latestSlotInternalToolName(provider: CompatProviderId): string {
  return provider === 'ge_proton' ? 'GE-Proton-SteamTools-Latest' : 'proton_cachyos_steamtools_latest'
}

/** `display_name` written into compatibilitytool.vdf. */
export function latestSlotDisplayName(provider: CompatProviderId): string {
  return provider === 'ge_proton' ? 'GE-Proton (Latest)' : 'Proton-CachyOS (Latest)'
}

/** When true, keep only tags whose name includes "-slr" (Steam Linux Runtime line). */
export function filterCachyosReleases(releases: ReleaseStub[], slrOnly: boolean): ReleaseStub[] {
  if (!slrOnly) return releases.filter((r) => r.tag_name.trim().toLowerCase().startsWith('cachyos-'))
  return releases.filter((r) => {
    const t = r.tag_name.trim().toLowerCase()
    return t.startsWith('cachyos-') && t.includes('-slr')
  })
}

/** Pick GE archive: prefer .tar.zst for tag, else .tar.gz. */
export function pickGeArchiveAsset(assets: ReleaseAssetStub[], tagName: string): ReleaseAssetStub | null {
  const tag = tagName.trim()
  const zst = assets.find((a) => a.name === `${tag}.tar.zst`)
  if (zst) return zst
  const gz = assets.find((a) => a.name === `${tag}.tar.gz`)
  return gz ?? null
}

export function pickGeSha512Asset(assets: ReleaseAssetStub[], tagName: string): ReleaseAssetStub | null {
  const tag = tagName.trim()
  return assets.find((a) => a.name === `${tag}.sha512sum`) ?? null
}

/** CachyOS ships proton-{tag}-{arch}.tar.xz (tag includes e.g. cachyos-10.0-…-slr). */
export function expectedCachyosArchiveName(tagName: string, arch: CachyosArchChoice): string {
  const tag = tagName.trim()
  return `proton-${tag}-${arch}.tar.xz`
}

export function pickCachyosArchiveAsset(
  assets: ReleaseAssetStub[],
  tagName: string,
  arch: CachyosArchChoice
): ReleaseAssetStub | null {
  const want = expectedCachyosArchiveName(tagName, arch)
  return assets.find((a) => a.name === want) ?? null
}

export function pickCachyosSha512Asset(
  assets: ReleaseAssetStub[],
  tagName: string,
  arch: CachyosArchChoice
): ReleaseAssetStub | null {
  const archive = expectedCachyosArchiveName(tagName, arch)
  const sumName = `${archive.replace(/\.tar\.xz$/i, '')}.sha512sum`
  return assets.find((a) => a.name === sumName) ?? null
}

/** Best GE tag among installed internal names / folder names. */
export function bestInstalledGeTag(names: string[]): string | null {
  const geTags = names.map((n) => n.trim()).filter((n) => isGeProtonTag(n))
  if (!geTags.length) return null
  geTags.sort(compareGeTagsDesc)
  return geTags[0] ?? null
}

/** Pull `cachyos-…` token from a folder or VDF string (e.g. dir name). */
export function extractCachyosTagFromText(s: string): string | null {
  const m = s.match(/(cachyos-\d[\w.-]*)/i)
  return m ? m[1] : null
}

/** Newest installed tag that appears in `orderedNewestFirst` release list order. */
export function bestInstalledCachyosTagFromReleases(
  installedTagCandidates: string[],
  orderedNewestFirst: ReleaseStub[]
): string | null {
  const set = new Set(installedTagCandidates.map((t) => t.trim()))
  for (const r of orderedNewestFirst) {
    if (set.has(r.tag_name.trim())) return r.tag_name.trim()
  }
  const tags = [...installedTagCandidates].map((t) => t.trim()).filter(Boolean)
  if (!tags.length) return null
  tags.sort((a, b) => b.localeCompare(a, undefined, { sensitivity: 'base' }))
  return tags[0] ?? null
}
