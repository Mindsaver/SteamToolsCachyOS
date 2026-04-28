import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { IPC } from '../shared/ipc-channels'
import { resolveSteamInstall, parseLibraryPaths, resolveUserDataPath, listSteamAccounts } from './services/steam/install'
import { collectGames } from './services/steam/manifests'
import {
  findLocalconfigs, readLaunchOptions, writeLaunchOption,
  listAccounts, readAllLaunchOptionsForAccount, batchWriteLaunchOptions,
  latestBackupPath, restoreBackup,
} from './services/steam/localconfig'
import { isSteamRunning, closeSteam } from './services/steam/processes'
import { loadCompatMappings, getCompatInfo, getSteamPlayDefault } from './services/steam/compat'
import {
  getGlobalEnvOverridesForApp,
  resolveToolInstallDir,
  readUserSettingsFileText,
  writeUserSettingsPyFile,
  createMinimalUserSettingsPy,
  listUserSettingsBackups,
  readUserSettingsBackupFile,
  writeUserSettingsBackupFile,
} from './services/steam/userSettings'
import {
  getInstalledCompatRows,
  listGeReleasesForUi,
  listCachyosReleasesForUi,
  installCompatRelease,
  checkGeProtonUpdate,
  checkCachyosUpdate,
} from './services/steam/compatInstall'
import type {
  CompatProviderId,
  CompatGithubReleaseRow,
  CompatInstallLayout,
  AppAboutInfo,
  AppSettings,
  SteamCompatSnapshot,
  SymlinkHubOptions,
  BatchTransformPreviewRequest,
  BatchTransformApplyRequest,
  ProtonUserSettingsCreateResult,
  ProtonUserSettingsGetResult,
  ProtonUserSettingsSaveResult,
  ProtonUserSettingsListBackupsResult,
  ProtonUserSettingsReadBackupResult,
  ProtonUserSettingsSaveNamedBackupResult,
  HudDocument,
  MangoHudConfigEntry,
  MongoConnectionProfile,
  MongoHudPreviewRequest,
  RunningFsrStatus,
  MangoHudRuntimeTextStyle,
} from '../shared/types'
import { parseUserSettingsEnvFromText } from '../shared/userSettingsPy'
import { runSymlinkHub } from './services/symlink/hub'
import { analyzeDll } from './services/fsr/ffx'
import { copyDllToGames } from './services/fsr/copy'
import { getRunningFsrStatus } from './services/fsr/runtime'
import { detectGpuVendors } from './services/gpu/detect'
import { transformLaunchOptions } from '../shared/launchOptions/compose'
import { loadSettings, saveSettings } from './services/settings'
import { checkForUpdates, downloadUpdate, installUpdate } from './services/updater'
import {
  createMongoHudVersion,
  deleteMongoHudConnection,
  deleteMongoHudDocument,
  exportMongoHudDocument,
  getMongoHudDocument,
  importMongoHudDocument,
  listMongoHudConnections,
  listMongoHudDocuments,
  listMongoHudVersions,
  restoreMongoHudVersion,
  runMongoHudPreviewQuery,
  saveMongoHudConnection,
  saveMongoHudDocument,
  testMongoHudConnection,
} from './services/mongoHud'
import {
  getMangoHudStatus,
  listMangoHudBackups,
  readMangoHudBackup,
  readMangoHudConfig,
  reloadMangoHudLive,
  restoreMangoHudBackup,
  saveMangoHudConfig,
  syncRuntimeFsrTextToMangoHud,
} from './services/mangohud'
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

  ipcMain.handle(IPC.STEAM_LIST_ACCOUNTS, async () => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return []
    const userDataPath = resolveUserDataPath(installPath)
    if (!userDataPath) return []
    return listAccounts(userDataPath)
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

  ipcMain.handle(IPC.GAMES_BATCH_TRANSFORM_PREVIEW, async (_e, req: BatchTransformPreviewRequest) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return []
    const userDataPath = resolveUserDataPath(installPath)
    if (!userDataPath) return []

    const games = collectGames(parseLibraryPaths(installPath), settings.gameFilter)
    const loMap = readAllLaunchOptionsForAccount(userDataPath, req.accountId)
    const nameMap = new Map(games.map((g) => [g.appId, g.name]))

    return req.appIds.map((appId) => {
      const before = loMap.get(String(appId)) ?? ''
      const after = transformLaunchOptions(before, req.params)
      return { appId, name: nameMap.get(appId) ?? String(appId), before, after }
    })
  })

  ipcMain.handle(IPC.GAMES_BATCH_TRANSFORM_APPLY, async (_e, req: BatchTransformApplyRequest) => {
    if (isSteamRunning()) {
      return { ok: false, error: 'Steam is running. Close Steam before writing launch options.' }
    }
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return { ok: false, error: 'Steam not found' }
    const userDataPath = resolveUserDataPath(installPath)
    if (!userDataPath) return { ok: false, error: 'No userdata path' }

    try {
      const updates = new Map(req.rows.map(({ appId, after }) => [String(appId), after]))
      const backup = batchWriteLaunchOptions(userDataPath, req.accountId, updates)
      return { ok: true, written: req.rows.length, backup }
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

  ipcMain.handle(IPC.FSR_RUNTIME_STATUS, async (_e, payload?: { appId?: number | null }) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    const appId = payload?.appId ?? null
    return getRunningFsrStatus(installPath, typeof appId === 'number' ? appId : null)
  })
  ipcMain.handle(
    IPC.FSR_RUNTIME_SYNC_TO_MANGOHUD,
    async (_e, payload?: { appId?: number | null; style?: MangoHudRuntimeTextStyle }) => {
      const settings = loadSettings()
      const installPath = settings.steamPath || resolveSteamInstall()
      const appId = payload?.appId ?? null
      const style = payload?.style ?? 'full-stack'
      const status: RunningFsrStatus = getRunningFsrStatus(
        installPath,
        typeof appId === 'number' ? appId : null
      )
      return syncRuntimeFsrTextToMangoHud(status, style)
    }
  )

  // ── Localconfig backup ─────────────────────────────────────────────────────

  ipcMain.handle(IPC.LOCALCONFIG_RESTORE_BACKUP, async (_e, { accountId }: { accountId: string }) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return { ok: false, error: 'Steam not found' }
    const userDataPath = resolveUserDataPath(installPath)
    if (!userDataPath) return { ok: false, error: 'No userdata path' }
    try {
      const restoredFrom = restoreBackup(userDataPath, accountId)
      return { ok: true, restoredFrom }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle(IPC.LOCALCONFIG_OPEN_FOLDER, async (_e, { accountId }: { accountId: string }) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return
    const userDataPath = resolveUserDataPath(installPath)
    if (!userDataPath) return
    const configDir = path.join(userDataPath, accountId, 'config')
    await shell.openPath(configDir)
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

  ipcMain.handle(IPC.COMPAT_SNAPSHOT, async (_e, appIds: number[]): Promise<SteamCompatSnapshot> => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    const empty: SteamCompatSnapshot = {
      steamPlayDefault: { toolName: null, toolDescription: null },
      perApp: {},
    }
    if (!installPath) return empty

    const mappings = loadCompatMappings(installPath)
    const steamPlayDefault = getSteamPlayDefault(mappings)
    const perApp: SteamCompatSnapshot['perApp'] = {}
    for (const id of appIds) {
      perApp[String(id)] = getCompatInfo(mappings, id)
    }
    return { steamPlayDefault, perApp }
  })

  ipcMain.handle(IPC.STEAM_GET_GLOBAL_ENV, async (_e, appId: number) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return {}
    return getGlobalEnvOverridesForApp(installPath, appId)
  })

  ipcMain.handle(IPC.STEAM_PROTON_USER_SETTINGS_GET, async (_e, internalName: string): Promise<ProtonUserSettingsGetResult> => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return { ok: false, error: 'Steam not found' }
    const trimmed = String(internalName ?? '').trim()
    if (!trimmed) return { ok: false, error: 'Missing tool id' }
    const dir = resolveToolInstallDir(installPath, trimmed)
    if (!dir) return { ok: false, error: 'Tool not found' }
    const rows = getInstalledCompatRows(installPath)
    const row = rows.find((r) => r.internalName === trimmed)
    const filePath = path.join(dir, 'user_settings.py')
    const fileExists = fs.existsSync(filePath)
    const fileText = readUserSettingsFileText(dir)
    const env = parseUserSettingsEnvFromText(fileText)
    return {
      ok: true,
      internalName: trimmed,
      displayName: row?.displayName ?? null,
      installPath: dir,
      filePath,
      fileExists,
      fileText,
      env,
    }
  })

  ipcMain.handle(
    IPC.STEAM_PROTON_USER_SETTINGS_SAVE,
    async (_e, payload: { internalName: string; fileText: string }): Promise<ProtonUserSettingsSaveResult> => {
      const settings = loadSettings()
      const installPath = settings.steamPath || resolveSteamInstall()
      if (!installPath) return { ok: false, error: 'Steam not found' }
      const trimmed = String(payload.internalName ?? '').trim()
      if (!trimmed) return { ok: false, error: 'Missing tool id' }
      const dir = resolveToolInstallDir(installPath, trimmed)
      if (!dir) return { ok: false, error: 'Tool not found' }
      try {
        writeUserSettingsPyFile(dir, payload.fileText)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Write failed' }
      }
    }
  )

  ipcMain.handle(
    IPC.STEAM_PROTON_USER_SETTINGS_CREATE,
    async (_e, internalName: string): Promise<ProtonUserSettingsCreateResult> => {
      const settings = loadSettings()
      const installPath = settings.steamPath || resolveSteamInstall()
      if (!installPath) return { ok: false, error: 'Steam not found' }
      const trimmed = String(internalName ?? '').trim()
      if (!trimmed) return { ok: false, error: 'Missing tool id' }
      const dir = resolveToolInstallDir(installPath, trimmed)
      if (!dir) return { ok: false, error: 'Tool not found' }
      const created = createMinimalUserSettingsPy(dir)
      if (!created.ok) return { ok: false, error: created.error }
      const rows = getInstalledCompatRows(installPath)
      const row = rows.find((r) => r.internalName === trimmed)
      const filePath = path.join(dir, 'user_settings.py')
      const fileText = readUserSettingsFileText(dir)
      const env = parseUserSettingsEnvFromText(fileText)
      return {
        ok: true,
        data: {
          ok: true,
          internalName: trimmed,
          displayName: row?.displayName ?? null,
          installPath: dir,
          filePath,
          fileExists: true,
          fileText,
          env,
        },
      }
    }
  )

  ipcMain.handle(
    IPC.STEAM_PROTON_USER_SETTINGS_LIST_BACKUPS,
    async (_e, internalName: string): Promise<ProtonUserSettingsListBackupsResult> => {
      const settings = loadSettings()
      const installPath = settings.steamPath || resolveSteamInstall()
      if (!installPath) return { ok: false, error: 'Steam not found' }
      const trimmed = String(internalName ?? '').trim()
      if (!trimmed) return { ok: false, error: 'Missing tool id' }
      const dir = resolveToolInstallDir(installPath, trimmed)
      if (!dir) return { ok: false, error: 'Tool not found' }
      return { ok: true, entries: listUserSettingsBackups(dir) }
    }
  )

  ipcMain.handle(
    IPC.STEAM_PROTON_USER_SETTINGS_READ_BACKUP,
    async (
      _e,
      payload: { internalName: string; fileName: string }
    ): Promise<ProtonUserSettingsReadBackupResult> => {
      const settings = loadSettings()
      const installPath = settings.steamPath || resolveSteamInstall()
      if (!installPath) return { ok: false, error: 'Steam not found' }
      const trimmed = String(payload.internalName ?? '').trim()
      if (!trimmed) return { ok: false, error: 'Missing tool id' }
      const dir = resolveToolInstallDir(installPath, trimmed)
      if (!dir) return { ok: false, error: 'Tool not found' }
      return readUserSettingsBackupFile(dir, payload.fileName)
    }
  )

  ipcMain.handle(
    IPC.STEAM_PROTON_USER_SETTINGS_SAVE_NAMED_BACKUP,
    async (
      _e,
      payload: { internalName: string; fileName: string; fileText: string }
    ): Promise<ProtonUserSettingsSaveNamedBackupResult> => {
      const settings = loadSettings()
      const installPath = settings.steamPath || resolveSteamInstall()
      if (!installPath) return { ok: false, error: 'Steam not found' }
      const trimmed = String(payload.internalName ?? '').trim()
      if (!trimmed) return { ok: false, error: 'Missing tool id' }
      const dir = resolveToolInstallDir(installPath, trimmed)
      if (!dir) return { ok: false, error: 'Tool not found' }
      return writeUserSettingsBackupFile(dir, payload.fileName, payload.fileText)
    }
  )

  // ── Compatibility tools (GE-Proton / Proton-CachyOS) ───────────────────────

  ipcMain.handle(IPC.COMPAT_TOOLS_LIST_INSTALLED, async () => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return []
    return getInstalledCompatRows(installPath)
  })

  ipcMain.handle(
    IPC.COMPAT_TOOLS_LIST_RELEASES,
    async (_e, payload: { provider: CompatProviderId; slrOnly?: boolean }) => {
      const settings = loadSettings()
      const rows: CompatGithubReleaseRow[] = []
      if (payload.provider === 'ge_proton') {
        const rel = await listGeReleasesForUi()
        for (const r of rel) rows.push({ tag_name: r.tag_name, published_at: r.published_at })
      } else {
        const slrOnly = payload.slrOnly ?? settings.protonCachyosSlrOnly
        const rel = await listCachyosReleasesForUi(slrOnly)
        for (const r of rel) rows.push({ tag_name: r.tag_name, published_at: r.published_at })
      }
      return rows
    }
  )

  ipcMain.handle(IPC.COMPAT_TOOLS_CHECK_UPDATE, async (_e, payload: { provider: CompatProviderId }) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) {
      return {
        provider: payload.provider,
        hasUpdate: false,
        remoteTag: null,
        installedBestTag: null,
        releaseUrl: null,
      }
    }
    if (payload.provider === 'ge_proton') return checkGeProtonUpdate(installPath)
    return checkCachyosUpdate(
      installPath,
      settings.protonCachyosSlrOnly,
      settings.protonCachyosArch
    )
  })

  ipcMain.handle(
    IPC.COMPAT_TOOLS_INSTALL,
    async (
      _e,
      payload: {
        provider: CompatProviderId
        tag: string
        cachyosArch?: 'x86_64' | 'x86_64_v4'
        installLayout?: CompatInstallLayout
      }
    ) => {
      const settings = loadSettings()
      const installPath = settings.steamPath || resolveSteamInstall()
      if (!installPath) return { ok: false, error: 'Steam not found' }
      const arch = payload.cachyosArch ?? settings.protonCachyosArch
      return installCompatRelease({
        provider: payload.provider,
        tag: payload.tag,
        steamInstall: installPath,
        cachyosArch: arch,
        installLayout: payload.installLayout ?? 'default',
        onProgress: (p) => mainWindow.webContents.send(IPC.COMPAT_TOOLS_PROGRESS, p),
      })
    }
  )

  ipcMain.handle(IPC.COMPAT_TOOLS_OPEN_USER_SETTINGS, async (_e, internalName: string) => {
    const settings = loadSettings()
    const installPath = settings.steamPath || resolveSteamInstall()
    if (!installPath) return { ok: false, error: 'Steam not found' }
    const dir = resolveToolInstallDir(installPath, internalName)
    if (!dir) return { ok: false, error: 'Tool not found' }
    const p = path.join(dir, 'user_settings.py')
    await shell.openPath(fs.existsSync(p) ? p : dir)
    return { ok: true }
  })

  // ── Settings ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.SETTINGS_GET, () => loadSettings())
  ipcMain.handle(IPC.SETTINGS_SET, (_e, settings: Partial<AppSettings> & Record<string, unknown>) => {
    saveSettings({ ...loadSettings(), ...settings } as AppSettings)
    return { ok: true }
  })

  ipcMain.handle(IPC.APP_GET_ABOUT, (): AppAboutInfo => ({
    name: app.getName(),
    version: app.getVersion(),
  }))

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

  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, async (_e, url: string) => {
    await shell.openExternal(url)
  })

  // ── MangoHud system config ─────────────────────────────────────────────────

  ipcMain.handle(IPC.MANGOHUD_STATUS, () => getMangoHudStatus())
  ipcMain.handle(IPC.MANGOHUD_CONFIG_GET, () => readMangoHudConfig())
  ipcMain.handle(
    IPC.MANGOHUD_CONFIG_SAVE,
    (_e, payload: { rawText?: string; entries?: MangoHudConfigEntry[]; makeNamedBackup?: string | null }) =>
      saveMangoHudConfig(payload)
  )
  ipcMain.handle(IPC.MANGOHUD_RELOAD, () => reloadMangoHudLive())
  ipcMain.handle(IPC.MANGOHUD_BACKUPS_LIST, () => listMangoHudBackups())
  ipcMain.handle(IPC.MANGOHUD_BACKUPS_READ, (_e, fileName: string) => readMangoHudBackup(fileName))
  ipcMain.handle(IPC.MANGOHUD_BACKUPS_RESTORE, (_e, fileName: string) => restoreMangoHudBackup(fileName))

  // ── Mongo HUD editor ────────────────────────────────────────────────────────

  ipcMain.handle(IPC.MONGO_HUD_CONNECTIONS_LIST, () => listMongoHudConnections())
  ipcMain.handle(
    IPC.MONGO_HUD_CONNECTIONS_SAVE,
    async (_e, profile: Pick<MongoConnectionProfile, 'id' | 'name' | 'connectionString' | 'database'>) =>
      saveMongoHudConnection(profile)
  )
  ipcMain.handle(IPC.MONGO_HUD_CONNECTIONS_DELETE, async (_e, id: string) => deleteMongoHudConnection(id))
  ipcMain.handle(
    IPC.MONGO_HUD_CONNECTIONS_TEST,
    async (_e, payload: { connectionString: string }) => testMongoHudConnection(payload.connectionString)
  )
  ipcMain.handle(IPC.MONGO_HUD_DOCS_LIST, () => listMongoHudDocuments())
  ipcMain.handle(IPC.MONGO_HUD_DOCS_GET, (_e, id: string) => getMongoHudDocument(id))
  ipcMain.handle(IPC.MONGO_HUD_DOCS_SAVE, (_e, doc: HudDocument) => saveMongoHudDocument(doc))
  ipcMain.handle(IPC.MONGO_HUD_DOCS_DELETE, (_e, id: string) => deleteMongoHudDocument(id))
  ipcMain.handle(IPC.MONGO_HUD_DOCS_EXPORT, (_e, id: string) => exportMongoHudDocument(id))
  ipcMain.handle(IPC.MONGO_HUD_DOCS_IMPORT, (_e, payload: { jsonText: string }) => importMongoHudDocument(payload.jsonText))
  ipcMain.handle(IPC.MONGO_HUD_VERSIONS_LIST, (_e, documentId: string) => listMongoHudVersions(documentId))
  ipcMain.handle(
    IPC.MONGO_HUD_VERSIONS_CREATE,
    (_e, payload: { documentId: string; label: string }) => createMongoHudVersion(payload.documentId, payload.label)
  )
  ipcMain.handle(IPC.MONGO_HUD_VERSIONS_RESTORE, (_e, versionId: string) => restoreMongoHudVersion(versionId))
  ipcMain.handle(IPC.MONGO_HUD_PREVIEW_QUERY, (_e, req: MongoHudPreviewRequest) => runMongoHudPreviewQuery(req))
}
