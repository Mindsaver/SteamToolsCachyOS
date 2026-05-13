import { api } from './ipc'
import {
  computeRollingLatestInstallLayout,
  normalizeCompatSettings,
  normalizeReleaseChannel,
  repoHeadTag,
} from './compatToolsShared'
import type { CompatInstallLayout, CompatProviderId } from '../../shared/types'

export async function installCompatToolUpdateFromCheck(opts: {
  provider: CompatProviderId
  remoteTag: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const raw = await api.getSettings()
  const s = normalizeCompatSettings(raw)
  const ch = normalizeReleaseChannel(s, opts.provider)
  const releases = await api.listCompatReleases({
    provider: opts.provider,
    slrOnly: opts.provider === 'proton_cachyos' ? s.protonCachyosSlrOnly : undefined,
  })
  const installed = (await api.listCompatToolsInstalled()) ?? []
  const rollingLayout = computeRollingLatestInstallLayout(opts.provider, installed, s)
  const headTag = repoHeadTag(releases)
  const installLayout: CompatInstallLayout =
    headTag && opts.remoteTag === headTag ? 'latest_slot' : rollingLayout
  const result = await api.installCompatRelease({
    provider: opts.provider,
    tag: opts.remoteTag,
    installLayout,
  })
  if (!result?.ok) return { ok: false, error: result?.error ?? 'Install failed' }
  if (ch === 'pinned') {
    const next =
      opts.provider === 'ge_proton'
        ? normalizeCompatSettings({ ...s, geProtonPinnedTag: opts.remoteTag })
        : normalizeCompatSettings({ ...s, protonCachyosPinnedTag: opts.remoteTag })
    await api.setSettings(next)
  }
  return { ok: true }
}
