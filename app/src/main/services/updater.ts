import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import type { AppUpdater } from 'electron-updater'
import { PacmanUpdater } from 'electron-updater'
import { IPC } from '../../shared/ipc-channels'
import log from 'electron-log'

/**
 * Linux: electron-updater defaults to AppImageUpdater, which logs a warning whenever
 * `APPIMAGE` is unset — including dev (`!app.isPackaged`) and extracted `--appimage-extract` installs.
 * Use PacmanUpdater when there is no AppImage layout and no distro package marker (`package-type`).
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

  if (process.env.APPIMAGE == null && pkgType == null) {
    log.info('[updater] Linux without APPIMAGE / package-type — using PacmanUpdater (dev or extracted layout)')
    return new PacmanUpdater()
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- AppImage (.AppImage + APPIMAGE) or deb/rpm/pacman via package-type
  const mod = require('electron-updater') as typeof import('electron-updater')
  return mod.autoUpdater
}

export const autoUpdater: AppUpdater = resolveAutoUpdater()

autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let mainWindow: BrowserWindow | null = null

function send(channel: string, data?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
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

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}
