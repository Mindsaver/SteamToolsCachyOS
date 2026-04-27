import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  AppSettings,
  SymlinkHubOptions,
  BatchLaunchUpdate,
  SymlinkProgress,
} from '../shared/types'

// Expose a typed, sandboxed API to the renderer via contextBridge.
// The renderer never touches ipcRenderer directly.

const api = {
  // ── Steam ──────────────────────────────────────────────────────────────────
  getSteamInfo: () => ipcRenderer.invoke(IPC.STEAM_GET_INFO),
  isSteamRunning: () => ipcRenderer.invoke(IPC.STEAM_IS_RUNNING),
  closeSteam: () => ipcRenderer.invoke(IPC.STEAM_CLOSE),

  // ── Games ──────────────────────────────────────────────────────────────────
  listGames: () => ipcRenderer.invoke(IPC.GAMES_LIST),
  getLaunchOptions: (appId: number) => ipcRenderer.invoke(IPC.GAMES_GET_LAUNCH_OPTIONS, appId),
  setLaunchOptions: (appId: number, options: string) =>
    ipcRenderer.invoke(IPC.GAMES_SET_LAUNCH_OPTIONS, { appId, options }),
  batchSetLaunchOptions: (payload: BatchLaunchUpdate) =>
    ipcRenderer.invoke(IPC.GAMES_BATCH_LAUNCH_OPTIONS, payload),

  // ── Symlink hub ────────────────────────────────────────────────────────────
  runSymlinkHub: (options: SymlinkHubOptions) => ipcRenderer.invoke(IPC.SYMLINK_RUN, options),
  onSymlinkProgress: (cb: (p: SymlinkProgress) => void) => {
    const handler = (_: unknown, p: SymlinkProgress) => cb(p)
    ipcRenderer.on(IPC.SYMLINK_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.SYMLINK_PROGRESS, handler)
  },

  // ── FSR DLL ────────────────────────────────────────────────────────────────
  analyzeDll: (filePath: string) => ipcRenderer.invoke(IPC.FSR_ANALYZE_DLL, filePath),
  copyDll: (dllPath: string) => ipcRenderer.invoke(IPC.FSR_COPY_DLL, { dllPath }),
  onFsrProgress: (cb: (p: SymlinkProgress) => void) => {
    const handler = (_: unknown, p: SymlinkProgress) => cb(p)
    ipcRenderer.on(IPC.FSR_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.FSR_PROGRESS, handler)
  },

  // ── GPU ────────────────────────────────────────────────────────────────────
  detectGpu: () => ipcRenderer.invoke(IPC.GPU_DETECT),

  // ── Compat tool ────────────────────────────────────────────────────────────
  getCompatInfo: (appId: number) => ipcRenderer.invoke(IPC.COMPAT_GET, appId),

  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (settings: AppSettings) => ipcRenderer.invoke(IPC.SETTINGS_SET, settings),

  // ── Updates ────────────────────────────────────────────────────────────────
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

  // ── Dialogs & shell ────────────────────────────────────────────────────────
  openFileDialog: (filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE, { filters }),
  openDirDialog: () => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIR),
  openPath: (p: string) => ipcRenderer.invoke(IPC.SHELL_OPEN_PATH, p),
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
