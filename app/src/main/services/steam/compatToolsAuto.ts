import type { BrowserWindow } from 'electron'
import { IPC } from '../../../shared/ipc-channels'
import type { AppSettings, CompatToolsUpdateAvailablePayload } from '../../../shared/types'
import { loadSettings, saveSettings } from '../settings'
import { resolveSteamInstall } from './install'
import {
  checkGeProtonUpdate,
  checkCachyosUpdate,
  installCompatRelease,
} from './compatInstall'

function patchSettings(partial: Partial<AppSettings>): void {
  saveSettings({ ...loadSettings(), ...partial })
}

/** Throttled GitHub auto-update check (main process, ~5s after startup). Runs regardless of which page is open. */
export async function runCompatToolsAutoCheck(win: BrowserWindow | null): Promise<void> {
  if (!win?.webContents) return

  const settings = loadSettings()
  const steam = settings.steamPath || resolveSteamInstall()
  if (!steam) return

  const now = Date.now()
  const throttleMs = Math.max(0.25, settings.compatToolsCheckThrottleHours || 24) * 3600000

  const shouldRun = (last: number) => !last || now - last >= throttleMs

  const notify = (payload: CompatToolsUpdateAvailablePayload) => {
    win.webContents.send(IPC.COMPAT_TOOLS_UPDATE_AVAILABLE, payload)
  }

  if (settings.geProtonTrack === 'latest' && shouldRun(settings.compatGeLastCheckEpoch)) {
    try {
      const r = await checkGeProtonUpdate(steam)
      patchSettings({
        compatGeLastCheckEpoch: Date.now(),
        compatGeLastRemoteTag: r.remoteTag,
      })
      if (r.hasUpdate && r.remoteTag) {
        if (settings.compatToolsSilentAutoInstall) {
          await installCompatRelease({
            provider: 'ge_proton',
            tag: r.remoteTag,
            steamInstall: steam,
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

  if (settings.protonCachyosTrack === 'latest' && shouldRun(settings.compatCachyosLastCheckEpoch)) {
    try {
      const r = await checkCachyosUpdate(steam, settings.protonCachyosSlrOnly, settings.protonCachyosArch)
      patchSettings({
        compatCachyosLastCheckEpoch: Date.now(),
        compatCachyosLastRemoteTag: r.remoteTag,
      })
      if (r.hasUpdate && r.remoteTag) {
        if (settings.compatToolsSilentAutoInstall) {
          await installCompatRelease({
            provider: 'proton_cachyos',
            tag: r.remoteTag,
            steamInstall: steam,
            cachyosArch: settings.protonCachyosArch,
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
