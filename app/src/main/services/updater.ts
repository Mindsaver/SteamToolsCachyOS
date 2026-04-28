import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import type { AppUpdater } from 'electron-updater'
import { PacmanUpdater } from 'electron-updater'
import { IPC } from '../../shared/ipc-channels'
import log from 'electron-log'

/**
 * `pkexec` (used by electron-updater for non-root GUI installs) runs the install command with a
 * minimal PATH. A bare `pacman` in `bash -c` can then fail with exit 127. Use the real path.
 */
function patchLinuxUpdaterPacmanFullPath(): void {
  if (process.platform !== 'linux') {
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LinuxUpdater } = require('electron-updater/out/LinuxUpdater') as {
    LinuxUpdater: { prototype: { runCommandWithSudoIfNeeded(this: unknown, args: string[]): unknown } }
  }
  const orig = LinuxUpdater.prototype.runCommandWithSudoIfNeeded
  LinuxUpdater.prototype.runCommandWithSudoIfNeeded = function (this: unknown, commandWithArgs: string[]) {
    const args =
      commandWithArgs[0] === 'pacman'
        ? ['/usr/bin/pacman', ...commandWithArgs.slice(1)]
        : commandWithArgs
    return orig.call(this, args)
  }
}

patchLinuxUpdaterPacmanFullPath()

/**
 * Linux: electron-updater's default selection logs noisy warnings in dev and unpackaged runs.
 * Use PacmanUpdater when there is no distro package marker (`package-type`).
 * Installed .deb/.rpm/.pacman system packages ship `resources/package-type`; keep default selection.
 */
function resolveAutoUpdater(): AppUpdater {
  if (process.platform !== 'linux' || process.env.SNAP != null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('electron-updater') as typeof import('electron-updater')
    return mod.autoUpdater
  }

  let pkgType: string | null = null
  if (app.isPackaged) {
    try {
      const typePath = path.join(process.resourcesPath, 'package-type')
      if (fs.existsSync(typePath)) {
        pkgType = fs.readFileSync(typePath, 'utf-8').trim()
      }
    } catch {
      /* ignore */
    }
  }

  if (pkgType == null) {
    log.info('[updater] Linux without package-type — using PacmanUpdater (dev or unpacked layout)')
    return new PacmanUpdater()
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deb/rpm/pacman via package-type
  const mod = require('electron-updater') as typeof import('electron-updater')
  return mod.autoUpdater
}

export const autoUpdater: AppUpdater = resolveAutoUpdater()

autoUpdater.logger = log
autoUpdater.autoDownload = false
// Keep install explicit via the UI action; avoids surprise auth prompts on plain app close.
autoUpdater.autoInstallOnAppQuit = false

let mainWindow: BrowserWindow | null = null

function send(channel: string, data?: unknown): void {
  if (!channel) return
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send(channel, data)
    } catch (err) {
      log.error('[updater] failed to send IPC event:', channel, err)
    }
  }
}

export function initUpdater(win: BrowserWindow): void {
  mainWindow = win

  autoUpdater.on('update-available', (info) => {
    send(IPC.UPDATE_AVAILABLE, { version: info.version, releaseNotes: info.releaseNotes })
  })

  autoUpdater.on('update-not-available', () => {
    send(IPC.UPDATE_NOT_AVAILABLE)
  })

  autoUpdater.on('error', (err) => {
    send(IPC.UPDATE_ERROR, { message: err.message })
  })

  autoUpdater.on('download-progress', (progress) => {
    send(IPC.UPDATE_PROGRESS, {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send(IPC.UPDATE_DOWNLOADED, { version: info.version })
  })
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err: Error) => {
    log.error('Update check failed:', err)
    send(IPC.UPDATE_ERROR, { message: err.message ?? String(err) })
  })
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch((err) => {
    log.error('Download failed:', err)
    send(IPC.UPDATE_ERROR, { message: err.message ?? String(err) })
  })
}

/** Delay before quit so the renderer can paint “installing” UI after IPC returns. */
const INSTALL_QUIT_DELAY_MS = 500

export function installUpdate(): void {
  send(IPC.UPDATE_INSTALL_STARTED)
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('[updater] quitAndInstall failed:', err)
      send(IPC.UPDATE_ERROR, { message: `Install start failed: ${message}` })
    }
  }, INSTALL_QUIT_DELAY_MS)
}
