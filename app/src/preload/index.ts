import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  AppAboutInfo,
  AppSettings,
  SteamCompatSnapshot,
  SymlinkHubOptions,
  SymlinkProgress,
  SteamAccount,
  BatchTransformPreviewRequest,
  BatchTransformPreviewRow,
  BatchTransformApplyRequest,
  BatchTransformResult,
  RestoreBackupResult,
  CompatProviderId,
  CompatGithubReleaseRow,
  InstalledCompatToolRow,
  CompatUpdateCheckResult,
  CompatInstallProgress,
  CompatInstallLayout,
  CompatToolsUpdateAvailablePayload,
  ProtonUserSettingsGetResult,
  ProtonUserSettingsSaveResult,
  ProtonUserSettingsCreateResult,
  ProtonUserSettingsListBackupsResult,
  ProtonUserSettingsReadBackupResult,
  ProtonUserSettingsSaveNamedBackupResult,
  HudDocument,
  HudVersionMeta,
  MongoConnectionProfile,
  MongoHudPreviewRequest,
  MongoHudPreviewResult,
  MangoHudConfigEntry,
  MangoHudListBackupsResult,
  MangoHudReadResult,
  MangoHudReloadResult,
  MangoHudSaveResult,
  MangoHudStatus,
  MangoHudRuntimeTextStyle,
  RunningFsrStatus,
} from '../shared/types'

// VITE_SIM is replaced at build time by electron-vite define.
// When true the mock API is statically bundled in and exposed instead of IPC.
const SIM = (import.meta.env['VITE_SIM'] ?? '') === '1'

// ── Real IPC API ─────────────────────────────────────────────────────────────

const realApi = {
  __simMode: false as boolean,

  getSteamInfo: () => ipcRenderer.invoke(IPC.STEAM_GET_INFO),
  isSteamRunning: () => ipcRenderer.invoke(IPC.STEAM_IS_RUNNING),
  closeSteam: () => ipcRenderer.invoke(IPC.STEAM_CLOSE),
  listAccounts: (): Promise<SteamAccount[]> => ipcRenderer.invoke(IPC.STEAM_LIST_ACCOUNTS),

  listGames: () => ipcRenderer.invoke(IPC.GAMES_LIST),
  getLaunchOptions: (appId: number) => ipcRenderer.invoke(IPC.GAMES_GET_LAUNCH_OPTIONS, appId),
  setLaunchOptions: (appId: number, options: string) =>
    ipcRenderer.invoke(IPC.GAMES_SET_LAUNCH_OPTIONS, { appId, options }),

  previewBatchTransform: (req: BatchTransformPreviewRequest): Promise<BatchTransformPreviewRow[]> =>
    ipcRenderer.invoke(IPC.GAMES_BATCH_TRANSFORM_PREVIEW, req),
  applyBatchTransform: (req: BatchTransformApplyRequest): Promise<BatchTransformResult> =>
    ipcRenderer.invoke(IPC.GAMES_BATCH_TRANSFORM_APPLY, req),

  restoreBackup: (accountId: string): Promise<RestoreBackupResult> =>
    ipcRenderer.invoke(IPC.LOCALCONFIG_RESTORE_BACKUP, { accountId }),
  openLocalconfigFolder: (accountId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.LOCALCONFIG_OPEN_FOLDER, { accountId }),

  runSymlinkHub: (options: SymlinkHubOptions) => ipcRenderer.invoke(IPC.SYMLINK_RUN, options),
  onSymlinkProgress: (cb: (p: SymlinkProgress) => void) => {
    const handler = (_: unknown, p: SymlinkProgress) => cb(p)
    ipcRenderer.on(IPC.SYMLINK_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.SYMLINK_PROGRESS, handler)
  },

  analyzeDll: (filePath: string) => ipcRenderer.invoke(IPC.FSR_ANALYZE_DLL, filePath),
  copyDll: (dllPath: string) => ipcRenderer.invoke(IPC.FSR_COPY_DLL, { dllPath }),
  getRunningFsrStatus: (appId?: number | null): Promise<RunningFsrStatus> =>
    ipcRenderer.invoke(IPC.FSR_RUNTIME_STATUS, { appId: appId ?? null }),
  syncRunningFsrToMangoHud: (
    appId?: number | null,
    style?: MangoHudRuntimeTextStyle
  ): Promise<MangoHudReloadResult> =>
    ipcRenderer.invoke(IPC.FSR_RUNTIME_SYNC_TO_MANGOHUD, { appId: appId ?? null, style: style ?? 'full-stack' }),
  onFsrProgress: (cb: (p: SymlinkProgress) => void) => {
    const handler = (_: unknown, p: SymlinkProgress) => cb(p)
    ipcRenderer.on(IPC.FSR_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.FSR_PROGRESS, handler)
  },

  detectGpu: () => ipcRenderer.invoke(IPC.GPU_DETECT),
  getCompatInfo: (appId: number) => ipcRenderer.invoke(IPC.COMPAT_GET, appId),
  getCompatSnapshot: (appIds: number[]): Promise<SteamCompatSnapshot> =>
    ipcRenderer.invoke(IPC.COMPAT_SNAPSHOT, appIds),
  getGlobalEnvOverrides: (appId: number): Promise<Record<string, string>> =>
    ipcRenderer.invoke(IPC.STEAM_GET_GLOBAL_ENV, appId),

  getProtonUserSettings: (internalName: string): Promise<ProtonUserSettingsGetResult> =>
    ipcRenderer.invoke(IPC.STEAM_PROTON_USER_SETTINGS_GET, internalName),
  saveProtonUserSettings: (payload: {
    internalName: string
    fileText: string
  }): Promise<ProtonUserSettingsSaveResult> =>
    ipcRenderer.invoke(IPC.STEAM_PROTON_USER_SETTINGS_SAVE, payload),
  createProtonUserSettings: (internalName: string): Promise<ProtonUserSettingsCreateResult> =>
    ipcRenderer.invoke(IPC.STEAM_PROTON_USER_SETTINGS_CREATE, internalName),
  listProtonUserSettingsBackups: (internalName: string): Promise<ProtonUserSettingsListBackupsResult> =>
    ipcRenderer.invoke(IPC.STEAM_PROTON_USER_SETTINGS_LIST_BACKUPS, internalName),
  readProtonUserSettingsBackup: (payload: {
    internalName: string
    fileName: string
  }): Promise<ProtonUserSettingsReadBackupResult> =>
    ipcRenderer.invoke(IPC.STEAM_PROTON_USER_SETTINGS_READ_BACKUP, payload),
  saveProtonUserSettingsNamedBackup: (payload: {
    internalName: string
    fileName: string
    fileText: string
  }): Promise<ProtonUserSettingsSaveNamedBackupResult> =>
    ipcRenderer.invoke(IPC.STEAM_PROTON_USER_SETTINGS_SAVE_NAMED_BACKUP, payload),

  listCompatToolsInstalled: (): Promise<InstalledCompatToolRow[]> =>
    ipcRenderer.invoke(IPC.COMPAT_TOOLS_LIST_INSTALLED),
  listCompatReleases: (req: { provider: CompatProviderId; slrOnly?: boolean }): Promise<
    CompatGithubReleaseRow[]
  > => ipcRenderer.invoke(IPC.COMPAT_TOOLS_LIST_RELEASES, req),
  checkCompatToolsUpdate: (provider: CompatProviderId): Promise<CompatUpdateCheckResult> =>
    ipcRenderer.invoke(IPC.COMPAT_TOOLS_CHECK_UPDATE, { provider }),
  installCompatRelease: (req: {
    provider: CompatProviderId
    tag: string
    cachyosArch?: 'x86_64' | 'x86_64_v4'
    installLayout?: CompatInstallLayout
  }) => ipcRenderer.invoke(IPC.COMPAT_TOOLS_INSTALL, req),
  openCompatUserSettings: (internalName: string) =>
    ipcRenderer.invoke(IPC.COMPAT_TOOLS_OPEN_USER_SETTINGS, internalName),
  onCompatToolsProgress: (cb: (p: CompatInstallProgress) => void) => {
    const handler = (_: unknown, p: CompatInstallProgress) => cb(p)
    ipcRenderer.on(IPC.COMPAT_TOOLS_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.COMPAT_TOOLS_PROGRESS, handler)
  },
  onCompatToolsUpdateAvailable: (cb: (p: CompatToolsUpdateAvailablePayload) => void) => {
    const handler = (_: unknown, p: CompatToolsUpdateAvailablePayload) => cb(p)
    ipcRenderer.on(IPC.COMPAT_TOOLS_UPDATE_AVAILABLE, handler)
    return () => ipcRenderer.removeListener(IPC.COMPAT_TOOLS_UPDATE_AVAILABLE, handler)
  },

  getMangoHudStatus: (): Promise<MangoHudStatus> => ipcRenderer.invoke(IPC.MANGOHUD_STATUS),
  getMangoHudConfig: (): Promise<MangoHudReadResult> => ipcRenderer.invoke(IPC.MANGOHUD_CONFIG_GET),
  saveMangoHudConfig: (payload: {
    rawText?: string
    entries?: MangoHudConfigEntry[]
    makeNamedBackup?: string | null
  }): Promise<MangoHudSaveResult> => ipcRenderer.invoke(IPC.MANGOHUD_CONFIG_SAVE, payload),
  reloadMangoHud: (): Promise<MangoHudReloadResult> => ipcRenderer.invoke(IPC.MANGOHUD_RELOAD),
  listMangoHudBackups: (): Promise<MangoHudListBackupsResult> => ipcRenderer.invoke(IPC.MANGOHUD_BACKUPS_LIST),
  readMangoHudBackup: (fileName: string): Promise<{ ok: true; rawText: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.MANGOHUD_BACKUPS_READ, fileName),
  restoreMangoHudBackup: (fileName: string): Promise<MangoHudSaveResult> =>
    ipcRenderer.invoke(IPC.MANGOHUD_BACKUPS_RESTORE, fileName),

  listMongoHudConnections: (): Promise<MongoConnectionProfile[]> =>
    ipcRenderer.invoke(IPC.MONGO_HUD_CONNECTIONS_LIST),
  saveMongoHudConnection: (profile: Pick<MongoConnectionProfile, 'id' | 'name' | 'connectionString' | 'database'>) =>
    ipcRenderer.invoke(IPC.MONGO_HUD_CONNECTIONS_SAVE, profile),
  deleteMongoHudConnection: (id: string) => ipcRenderer.invoke(IPC.MONGO_HUD_CONNECTIONS_DELETE, id),
  testMongoHudConnection: (connectionString: string) =>
    ipcRenderer.invoke(IPC.MONGO_HUD_CONNECTIONS_TEST, { connectionString }),
  listMongoHudDocuments: (): Promise<HudDocument[]> => ipcRenderer.invoke(IPC.MONGO_HUD_DOCS_LIST),
  getMongoHudDocument: (id: string): Promise<HudDocument | null> => ipcRenderer.invoke(IPC.MONGO_HUD_DOCS_GET, id),
  saveMongoHudDocument: (doc: HudDocument): Promise<HudDocument> => ipcRenderer.invoke(IPC.MONGO_HUD_DOCS_SAVE, doc),
  deleteMongoHudDocument: (id: string) => ipcRenderer.invoke(IPC.MONGO_HUD_DOCS_DELETE, id),
  exportMongoHudDocument: (id: string): Promise<{ ok: true; json: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.MONGO_HUD_DOCS_EXPORT, id),
  importMongoHudDocument: (jsonText: string): Promise<{ ok: true; doc: HudDocument } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.MONGO_HUD_DOCS_IMPORT, { jsonText }),
  listMongoHudVersions: (documentId: string): Promise<HudVersionMeta[]> =>
    ipcRenderer.invoke(IPC.MONGO_HUD_VERSIONS_LIST, documentId),
  createMongoHudVersion: (payload: { documentId: string; label: string }) =>
    ipcRenderer.invoke(IPC.MONGO_HUD_VERSIONS_CREATE, payload),
  restoreMongoHudVersion: (
    versionId: string
  ): Promise<{ ok: true; doc: HudDocument } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.MONGO_HUD_VERSIONS_RESTORE, versionId),
  previewMongoHudData: (req: MongoHudPreviewRequest): Promise<MongoHudPreviewResult> =>
    ipcRenderer.invoke(IPC.MONGO_HUD_PREVIEW_QUERY, req),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (settings: AppSettings) => ipcRenderer.invoke(IPC.SETTINGS_SET, settings),

  checkForUpdates: () => ipcRenderer.invoke(IPC.UPDATE_CHECK),
  downloadUpdate: () => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  onUpdateAvailable: (cb: (info: { version: string; releaseNotes?: string }) => void) => {
    const handler = (_: unknown, info: { version: string; releaseNotes?: string }) => cb(info)
    ipcRenderer.on(IPC.UPDATE_AVAILABLE, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_AVAILABLE, handler)
  },
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => {
    const handler = (_: unknown, info: { version: string }) => cb(info)
    ipcRenderer.on(IPC.UPDATE_DOWNLOADED, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_DOWNLOADED, handler)
  },
  onUpdateProgress: (cb: (p: { percent: number }) => void) => {
    const handler = (_: unknown, p: { percent: number }) => cb(p)
    ipcRenderer.on(IPC.UPDATE_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_PROGRESS, handler)
  },
  onUpdateNotAvailable: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.UPDATE_NOT_AVAILABLE, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_NOT_AVAILABLE, handler)
  },
  onUpdateError: (cb: (info: { message: string }) => void) => {
    const handler = (_: unknown, info: { message: string }) => cb(info)
    ipcRenderer.on(IPC.UPDATE_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_ERROR, handler)
  },

  openFileDialog: (filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE, { filters }),
  openDirDialog: () => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIR),
  openPath: (p: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_PATH, p),

  getAboutInfo: (): Promise<AppAboutInfo> => ipcRenderer.invoke(IPC.APP_GET_ABOUT),
  onShowAbout: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.ABOUT_SHOW, handler)
    return () => ipcRenderer.removeListener(IPC.ABOUT_SHOW, handler)
  },
  openExternalUrl: (url: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url),
}

export type Api = typeof realApi

// ── Expose via contextBridge ──────────────────────────────────────────────────
// Static import of mock — when SIM=false, tree-shaking removes it from the bundle.
// We must use a static top-level import (not require()) so electron-vite bundles
// the mock inline rather than trying to resolve it at runtime from disk.
import { mockApi } from '../sim/mockApi'

if (SIM) {
  contextBridge.exposeInMainWorld('api', mockApi)
} else {
  contextBridge.exposeInMainWorld('api', realApi)
}
