import type { BrowserWindow } from 'electron'
import { IPC } from '../../../shared/ipc-channels'
import type { AppSettings, CompatInstallLayout, CompatToolsUpdateAvailablePayload } from '../../../shared/types'
import { isCachyosLatestSlotRow, latestSlotInternalToolName, LEGACY_CACHYOS_LATEST_INTERNAL_TOOL_NAME } from '../../../shared/compatToolsPure'
import { loadSettings, saveSettings } from '../settings'
import { resolveSteamInstall } from './install'
import {
  checkGeProtonUpdate,
  checkCachyosUpdate,
  installCompatRelease,
} from './compatInstall'
import { listInstalledCompatTools } from './compatInstalled'

/** Dedupe “update available” toasts when the same remote tag is seen across repeated polls in one session. */
const compatUpdateToastOnce = new Set<string>()

function patchSettings(partial: Partial<AppSettings>): void {
  saveSettings({ ...loadSettings(), ...partial })
}

export type CompatToolsAutoCheckOpts = {
  /** @deprecated Throttle removed; checks run whenever this function is invoked. Kept for call-site compatibility. */
  bypassThrottle?: boolean
}

/** Background GitHub compat check: runs when GE / Cachy tools are installed (or auto-update bindings). */
export async function runCompatToolsAutoCheck(
  win: BrowserWindow | null,
  _opts?: CompatToolsAutoCheckOpts
): Promise<void> {
  if (!win?.webContents || win.isDestroyed()) return

  let settings = loadSettings()
  const steam = settings.steamPath || resolveSteamInstall()
  if (!steam) return

  const installed = listInstalledCompatTools(steam)
  const stale: Partial<AppSettings> = {}
  const ge = settings.geProtonAutoUpdateInternalName
  if (ge && !installed.some((r) => r.provider === 'ge_proton' && r.internalName === ge)) {
    stale.geProtonAutoUpdateInternalName = null
    stale.geProtonAutoUpdate = false
  }
  const ca = settings.protonCachyosAutoUpdateInternalName
  if (
    ca &&
    !installed.some(
      (r) =>
        r.provider === 'proton_cachyos' &&
        (r.internalName === ca ||
          ((ca === latestSlotInternalToolName('proton_cachyos') ||
            ca === LEGACY_CACHYOS_LATEST_INTERNAL_TOOL_NAME) &&
            isCachyosLatestSlotRow(r)))
    )
  ) {
    stale.protonCachyosAutoUpdateInternalName = null
    stale.protonCachyosAutoUpdate = false
  }
  if (Object.keys(stale).length) {
    patchSettings(stale)
    settings = loadSettings()
  }

  const notifyMaybeOnce = (payload: CompatToolsUpdateAvailablePayload) => {
    const key = `${payload.provider}:${payload.remoteTag}`
    if (compatUpdateToastOnce.has(key)) return
    compatUpdateToastOnce.add(key)
    win.webContents.send(IPC.COMPAT_TOOLS_UPDATE_AVAILABLE, payload)
  }

  const hasGeInstall = installed.some((r) => r.provider === 'ge_proton')
  const hasCachyInstall = installed.some((r) => r.provider === 'proton_cachyos')

  const geLegacyRolling =
    settings.geProtonChannel === 'rolling' &&
    settings.geProtonAutoUpdate &&
    !settings.geProtonAutoUpdateInternalName
  const geBound =
    settings.geProtonAutoUpdate &&
    Boolean(settings.geProtonAutoUpdateInternalName) &&
    installed.some((r) => r.provider === 'ge_proton' && r.internalName === settings.geProtonAutoUpdateInternalName)

  /** GitHub check whenever GE-Proton is installed, or legacy/bound auto-update requests it. */
  const runGeCheck = hasGeInstall || geBound || geLegacyRolling

  if (runGeCheck) {
    try {
      const r = await checkGeProtonUpdate(steam)
      patchSettings({
        compatGeLastCheckEpoch: Date.now(),
        compatGeLastRemoteTag: r.remoteTag,
      })
      if (win.webContents && !win.isDestroyed()) {
        win.webContents.send(IPC.COMPAT_TOOLS_CHECK_RESULT, r)
      }
      if (r.hasUpdate && r.remoteTag) {
        const s2 = loadSettings()
        const silent =
          s2.compatToolsSilentAutoInstall && (geBound || geLegacyRolling)
        if (silent) {
          await installCompatRelease({
            provider: 'ge_proton',
            tag: r.remoteTag,
            steamInstall: steam,
            installLayout:
              s2.geProtonAutoUpdateInternalName === latestSlotInternalToolName('ge_proton')
                ? 'latest_slot'
                : 'default',
            onProgress: (p) => win.webContents.send(IPC.COMPAT_TOOLS_PROGRESS, p),
          })
        } else {
          notifyMaybeOnce({
            provider: 'ge_proton',
            remoteTag: r.remoteTag,
            installedBestTag: r.installedBestTag,
            releaseUrl: r.releaseUrl,
          })
        }
      }
    } catch {
      patchSettings({ compatGeLastCheckEpoch: Date.now() })
    }
  }

  const caLegacyRolling =
    settings.protonCachyosChannel === 'rolling' &&
    settings.protonCachyosAutoUpdate &&
    !settings.protonCachyosAutoUpdateInternalName
  const caBound =
    settings.protonCachyosAutoUpdate &&
    Boolean(settings.protonCachyosAutoUpdateInternalName) &&
    installed.some((r) => {
      if (r.provider !== 'proton_cachyos') return false
      const bound = settings.protonCachyosAutoUpdateInternalName
      if (!bound) return false
      if (r.internalName === bound) return true
      if (bound === latestSlotInternalToolName('proton_cachyos') || bound === LEGACY_CACHYOS_LATEST_INTERNAL_TOOL_NAME)
        return isCachyosLatestSlotRow(r)
      return false
    })

  /** GitHub check whenever Proton-CachyOS is installed, or legacy/bound auto-update requests it. */
  const runCachyCheck = hasCachyInstall || caBound || caLegacyRolling

  function cachyosAutoInstallLayout(steamPath: string, boundInternalName: string | null): CompatInstallLayout {
    if (!boundInternalName) return 'default'
    if (
      boundInternalName === latestSlotInternalToolName('proton_cachyos') ||
      boundInternalName === LEGACY_CACHYOS_LATEST_INTERNAL_TOOL_NAME
    )
      return 'latest_slot'
    const row = listInstalledCompatTools(steamPath).find(
      (r) => r.provider === 'proton_cachyos' && r.internalName === boundInternalName
    )
    if (row && isCachyosLatestSlotRow(row)) return 'latest_slot'
    return 'default'
  }
  if (runCachyCheck) {
    try {
      const s3 = loadSettings()
      const r = await checkCachyosUpdate(steam, s3.protonCachyosSlrOnly)
      patchSettings({
        compatCachyosLastCheckEpoch: Date.now(),
        compatCachyosLastRemoteTag: r.remoteTag,
      })
      if (win.webContents && !win.isDestroyed()) {
        win.webContents.send(IPC.COMPAT_TOOLS_CHECK_RESULT, r)
      }
      if (r.hasUpdate && r.remoteTag) {
        const s4 = loadSettings()
        const silent = s4.compatToolsSilentAutoInstall && (caBound || caLegacyRolling)
        if (silent) {
          await installCompatRelease({
            provider: 'proton_cachyos',
            tag: r.remoteTag,
            steamInstall: steam,
            installLayout: cachyosAutoInstallLayout(steam, s4.protonCachyosAutoUpdateInternalName),
            onProgress: (p) => win.webContents.send(IPC.COMPAT_TOOLS_PROGRESS, p),
          })
        } else {
          notifyMaybeOnce({
            provider: 'proton_cachyos',
            remoteTag: r.remoteTag,
            installedBestTag: r.installedBestTag,
            releaseUrl: r.releaseUrl,
          })
        }
      }
    } catch {
      patchSettings({ compatCachyosLastCheckEpoch: Date.now() })
    }
  }
}
