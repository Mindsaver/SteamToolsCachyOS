import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import path from 'path'
import os from 'os'
import { IPC } from '../shared/ipc-channels'
import { resolveSteamInstall, parseLibraryPaths, resolveUserDataPath, listSteamAccounts } from './services/steam/install'
import { collectGames } from './services/steam/manifests'
import { findLocalconfigs, readLaunchOptions, writeLaunchOption } from './services/steam/localconfig'
import { isSteamRunning, closeSteam } from './services/steam/processes'
import { loadCompatMappings, getCompatInfo } from './services/steam/compat'
import { runSymlinkHub } from './services/symlink/hub'
import { analyzeDll } from './services/fsr/ffx'
import { copyDllToGames } from './services/fsr/copy'
import { detectGpuVendors } from './services/gpu/detect'
import { mergeSnippetPrefix, removeSnippet } from './services/launchOptions/compose'
import { loadSettings, saveSettings } from './services/settings'
import { checkForUpdates, downloadUpdate, installUpdate } from './services/updater'
import type { SymlinkHubOptions, BatchLaunchUpdate } from '../shared/types'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ── Steam ──────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.STEAM_GET_INFO, async () => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return null

    const libraries = parseLibraryPaths(installPath)
    const userDataPath = resolveUserDataPath(installPath)
    const accounts = userDataPath ? listSteamAccounts(userDataPath) : []

    return { installPath, libraries, userDataPath, accounts }
  })

  ipcMain.handle(IPC.STEAM_IS_RUNNING, () => isSteamRunning())

  ipcMain.handle(IPC.STEAM_CLOSE, async () => {
    await closeSteam()
    return !isSteamRunning()
  })

  // ── Games ──────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.GAMES_LIST, async () => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return []

    const libraries = parseLibraryPaths(installPath)
    const games = collectGames(libraries, settings.gameFilter)

    // Attach launch options from localconfig
    const userDataPath = resolveUserDataPath(installPath)
    if (userDataPath) {
      const localconfigs = findLocalconfigs(userDataPath)
      if (localconfigs.length > 0) {
        // Use the most recently modified localconfig
        const { filePath } = localconfigs[0]
        const loMap = readLaunchOptions(filePath)
        for (const game of games) {
          game.launchOptions = loMap.get(String(game.appId)) ?? ''
        }
      }
    }

    return games
  })

  ipcMain.handle(IPC.GAMES_GET_LAUNCH_OPTIONS, async (_e, appId: number) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return ''

    const userDataPath = resolveUserDataPath(installPath)
    if (!userDataPath) return ''

    const localconfigs = findLocalconfigs(userDataPath)
    if (!localconfigs.length) return ''

    const loMap = readLaunchOptions(localconfigs[0].filePath)
    return loMap.get(String(appId)) ?? ''
  })

  ipcMain.handle(IPC.GAMES_SET_LAUNCH_OPTIONS, async (_e, { appId, options }: { appId: number; options: string }) => {
    if (isSteamRunning()) {
      return { ok: false, error: 'Steam is running. Close Steam before writing launch options.' }
    }
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return { ok: false, error: 'Steam not found' }

    const userDataPath = resolveUserDataPath(installPath)
    if (!userDataPath) return { ok: false, error: 'No userdata path' }

    const localconfigs = findLocalconfigs(userDataPath)
    if (!localconfigs.length) return { ok: false, error: 'No localconfig.vdf found' }

    try {
      for (const { filePath } of localconfigs) {
        writeLaunchOption(filePath, String(appId), options)
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle(IPC.GAMES_BATCH_LAUNCH_OPTIONS, async (_e, { snippet, appIds }: BatchLaunchUpdate) => {
    if (isSteamRunning()) {
      return { ok: false, error: 'Steam is running. Close Steam before writing launch options.' }
    }
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return { ok: false, error: 'Steam not found' }

    const userDataPath = resolveUserDataPath(installPath)
    if (!userDataPath) return { ok: false, error: 'No userdata path' }

    const localconfigs = findLocalconfigs(userDataPath)
    if (!localconfigs.length) return { ok: false, error: 'No localconfig.vdf found' }

    try {
      for (const { filePath } of localconfigs) {
        const loMap = readLaunchOptions(filePath)
        for (const appId of appIds) {
          const current = loMap.get(String(appId)) ?? ''
          const updated = mergeSnippetPrefix(current, snippet)
          writeLaunchOption(filePath, String(appId), updated)
        }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Symlink hub ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.SYMLINK_RUN, async (_e, options: SymlinkHubOptions) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return { ok: false, error: 'Steam not found' }

    try {
      await runSymlinkHub(installPath, options, (progress) => {
        mainWindow.webContents.send(IPC.SYMLINK_PROGRESS, progress)
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ── FSR DLL ────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.FSR_ANALYZE_DLL, async (_e, filePath: string) => {
    try {
      return { ok: true, data: analyzeDll(filePath) }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle(IPC.FSR_COPY_DLL, async (_e, { dllPath }: { dllPath: string }) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return { ok: false, error: 'Steam not found' }

    const libraries = parseLibraryPaths(installPath)
    const games = collectGames(libraries, settings.gameFilter)

    try {
      copyDllToGames(dllPath, games, (progress) => {
        mainWindow.webContents.send(IPC.FSR_PROGRESS, progress)
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ── GPU ────────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.GPU_DETECT, async () => {
    return detectGpuVendors()
  })

  // ── Compat context ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC.COMPAT_GET, async (_e, appId: number) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return null
    const mappings = loadCompatMappings(installPath)
    return getCompatInfo(mappings, appId)
  })

  // ── Settings ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.SETTINGS_GET, () => loadSettings())
  ipcMain.handle(IPC.SETTINGS_SET, (_e, settings) => {
    saveSettings(settings)
    return { ok: true }
  })

  // ── Updates ────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.UPDATE_CHECK, () => checkForUpdates())
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, () => downloadUpdate())
  ipcMain.handle(IPC.UPDATE_INSTALL, () => installUpdate())

  // ── Dialogs & shell ────────────────────────────────────────────────────────

  ipcMain.handle(IPC.DIALOG_OPEN_FILE, async (_e, { filters }: { filters?: Electron.FileFilter[] }) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters,
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.DIALOG_OPEN_DIR, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.SHELL_OPEN_PATH, async (_e, targetPath: string) => {
    await shell.openPath(targetPath)
  })
}
