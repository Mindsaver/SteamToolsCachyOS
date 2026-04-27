import type { BrowserWindow } from 'electron'
import { IPC } from '../../../shared/ipc-channels'
import type { AppSettings, CompatToolsUpdateAvailablePayload } from '../../../shared/types'
import { latestSlotInternalToolName } from '../../../shared/compatToolsPure'
import { loadSettings, saveSettings } from '../settings'
import { resolveSteamInstall } from './install'
import {
  checkGeProtonUpdate,
  checkCachyosUpdate,
  installCompatRelease,
} from './compatInstall'
import { listInstalledCompatTools } from './compatInstalled'

function patchSettings(partial: Partial<AppSettings>): void {
  saveSettings({ ...loadSettings(), ...partial })
}

/** Throttled GitHub auto-update check (main process, ~5s after startup). Runs regardless of which page is open. */
export async function runCompatToolsAutoCheck(win: BrowserWindow | null): Promise<void> {
  if (!win?.webContents) return

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
  if (ca && !installed.some((r) => r.provider === 'proton_cachyos' && r.internalName === ca)) {
    stale.protonCachyosAutoUpdateInternalName = null
    stale.protonCachyosAutoUpdate = false
  }
  if (Object.keys(stale).length) {
    patchSettings(stale)
    settings = loadSettings()
  }

  const now = Date.now()
  const throttleMs = Math.max(0.25, settings.compatToolsCheckThrottleHours || 24) * 3600000
  const shouldRun = (last: number) => !last || now - last >= throttleMs

  const notify = (payload: CompatToolsUpdateAvailablePayload) => {
    win.webContents.send(IPC.COMPAT_TOOLS_UPDATE_AVAILABLE, payload)
  }

  /** Legacy: global “rolling” + auto before per-install binding existed. */
  const geLegacyRolling =
    settings.geProtonChannel === 'rolling' &&
    settings.geProtonAutoUpdate &&
    !settings.geProtonAutoUpdateInternalName
  const geBound =
    settings.geProtonAutoUpdate &&
    Boolean(settings.geProtonAutoUpdateInternalName) &&
    installed.some((r) => r.provider === 'ge_proton' && r.internalName === settings.geProtonAutoUpdateInternalName)

  if ((geBound || geLegacyRolling) && shouldRun(settings.compatGeLastCheckEpoch)) {
    try {
      const r = await checkGeProtonUpdate(steam)
      patchSettings({
        compatGeLastCheckEpoch: Date.now(),
        compatGeLastRemoteTag: r.remoteTag,
      })
      if (r.hasUpdate && r.remoteTag) {
        const s2 = loadSettings()
        if (s2.compatToolsSilentAutoInstall) {
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
          notify({
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
    installed.some((r) => r.provider === 'proton_cachyos' && r.internalName === settings.protonCachyosAutoUpdateInternalName)

  if ((caBound || caLegacyRolling) && shouldRun(settings.compatCachyosLastCheckEpoch)) {
    try {
      const s3 = loadSettings()
      const r = await checkCachyosUpdate(steam, s3.protonCachyosSlrOnly, s3.protonCachyosArch)
      patchSettings({
        compatCachyosLastCheckEpoch: Date.now(),
        compatCachyosLastRemoteTag: r.remoteTag,
      })
      if (r.hasUpdate && r.remoteTag) {
        const s4 = loadSettings()
        if (s4.compatToolsSilentAutoInstall) {
          await installCompatRelease({
            provider: 'proton_cachyos',
            tag: r.remoteTag,
            steamInstall: steam,
            cachyosArch: s4.protonCachyosArch,
            installLayout:
              s4.protonCachyosAutoUpdateInternalName === latestSlotInternalToolName('proton_cachyos')
                ? 'latest_slot'
                : 'default',
            onProgress: (p) => win.webContents.send(IPC.COMPAT_TOOLS_PROGRESS, p),
          })
        } else {
          notify({
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
