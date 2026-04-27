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
