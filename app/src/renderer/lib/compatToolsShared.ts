import { isRollingLineCompatToolRow } from '../../shared/compatToolsPure'
import type {
  AppSettings,
  CompatGithubReleaseRow,
  CompatInstallLayout,
  CompatProviderId,
  CompatReleaseChannel,
  InstalledCompatToolRow,
} from '../../shared/types'

/** `<select>` value: install repository HEAD (`releases[0]`), not a duplicate of the first tag row. */
export const INSTALL_LATEST_SENTINEL = '__install_latest__'

export function repoHeadTag(releases: CompatGithubReleaseRow[]): string | null {
  const t = releases[0]?.tag_name?.trim()
  return t || null
}

/** “Latest” Steam folder + stable internal name whenever we install the current list HEAD (sentinel or pinned head). */
export function compatInstallLayoutForSelection(
  provider: CompatProviderId,
  selectedTag: string,
  releases: CompatGithubReleaseRow[]
): CompatInstallLayout {
  if (provider !== 'ge_proton' && provider !== 'proton_cachyos') return 'default'
  const head = repoHeadTag(releases)
  if (!head) return 'default'
  const resolved = selectedTag === INSTALL_LATEST_SENTINEL ? head : selectedTag.trim()
  return resolved === head ? 'latest_slot' : 'default'
}

export function providerLabel(p: CompatProviderId): string {
  return p === 'ge_proton' ? 'GE-Proton' : 'Proton-CachyOS'
}

/** Latest-line installs show per-row auto update (+ CachyOS cog). Bound row still shows if name changed. */
export function showRollingControlsOnInstalledRow(row: InstalledCompatToolRow, s: AppSettings): boolean {
  if (row.provider === 'ge_proton') {
    return isRollingLineCompatToolRow(row) || s.geProtonAutoUpdateInternalName === row.internalName
  }
  if (row.provider === 'proton_cachyos') {
    return isRollingLineCompatToolRow(row) || s.protonCachyosAutoUpdateInternalName === row.internalName
  }
  return false
}

export function normalizeReleaseChannel(s: AppSettings, p: CompatProviderId): CompatReleaseChannel {
  const raw = p === 'ge_proton' ? s.geProtonChannel : s.protonCachyosChannel
  return raw === 'rolling' || raw === 'pinned' ? raw : 'pinned'
}

export function normalizeCompatSettings(s: AppSettings): AppSettings {
  return {
    ...s,
    geProtonChannel:
      s.geProtonChannel === 'rolling' || s.geProtonChannel === 'pinned' ? s.geProtonChannel : 'pinned',
    protonCachyosChannel:
      s.protonCachyosChannel === 'rolling' || s.protonCachyosChannel === 'pinned'
        ? s.protonCachyosChannel
        : 'pinned',
    geProtonAutoUpdate: Boolean(s.geProtonAutoUpdate),
    protonCachyosAutoUpdate: Boolean(s.protonCachyosAutoUpdate),
    geProtonAutoUpdateInternalName: s.geProtonAutoUpdateInternalName ?? null,
    protonCachyosAutoUpdateInternalName: s.protonCachyosAutoUpdateInternalName ?? null,
    geProtonPinnedTag: s.geProtonPinnedTag ?? null,
    protonCachyosPinnedTag: s.protonCachyosPinnedTag ?? null,
    protonCachyosSlrOnly: s.protonCachyosSlrOnly !== false,
  }
}

export function computeRollingLatestInstallLayout(
  provider: CompatProviderId,
  installed: InstalledCompatToolRow[],
  settings: AppSettings
): CompatInstallLayout {
  if (provider === 'proton_cachyos') {
    return installed.some((r) => r.provider === 'proton_cachyos' && showRollingControlsOnInstalledRow(r, settings))
      ? 'latest_slot'
      : 'default'
  }
  if (provider === 'ge_proton') {
    return installed.some((r) => r.provider === 'ge_proton' && showRollingControlsOnInstalledRow(r, settings))
      ? 'latest_slot'
      : 'default'
  }
  return 'default'
}
