/**
 * Full mock of the window.api surface for sim mode.
 * Imported by the preload when VITE_SIM=1 and exposed via contextBridge,
 * so the renderer gets realistic fake data in a real Electron window.
 */

import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  AppAboutInfo,
  AppSettings,
  SymlinkHubOptions,
  SteamAccount, BatchTransformPreviewRequest, BatchTransformApplyRequest,
  BatchTransformResult, RestoreBackupResult,
} from '../shared/types'
import { transformLaunchOptions } from '../shared/launchOptions/compose'
import {
  MOCK_STEAM_INFO,
  MOCK_GAMES,
  MOCK_GPU_INFO,
  MOCK_DLL_INFO,
  MOCK_SETTINGS,
  MOCK_COMPAT_INFO,
  simulateSymlinkStream,
  simulateFsrStream,
} from './mockData'

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Mutable sim state — edits persist within the session
let simSettings: AppSettings = { ...MOCK_SETTINGS }
const simGames = MOCK_GAMES.map((g) => ({ ...g }))
let simSteamRunning = false

// Lightweight event bus for push channels
type AnyFn = (...args: unknown[]) => void
function makeChannel<T extends AnyFn>() {
  const listeners = new Set<T>()
  const emit = (...args: Parameters<T>) => listeners.forEach((cb) => cb(...args))
  const on = (cb: T) => { listeners.add(cb); return () => listeners.delete(cb) }
  return { emit, on }
}

const symlinkCh = makeChannel<(p: import('../shared/types').SymlinkProgress) => void>()
const fsrCh = makeChannel<(p: import('../shared/types').SymlinkProgress) => void>()
const updateAvailCh = makeChannel<(i: { version: string }) => void>()
const updateDoneCh = makeChannel<(i: { version: string }) => void>()
const updateProgCh = makeChannel<(i: { percent: number }) => void>()
function makeVoidListeners() {
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((cb) => cb())
  const on = (cb: () => void) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }
  return { emit, on }
}
const updateNotAvailCh = makeVoidListeners()
const updateErrCh = makeChannel<(i: { message: string }) => void>()

export const mockApi = {
  __simMode: true as const,

  // ── Steam ──────────────────────────────────────────────────────────────────
  getSteamInfo: async () => { await delay(300); return MOCK_STEAM_INFO },
  isSteamRunning: async () => { await delay(80); return simSteamRunning },
  closeSteam: async () => { await delay(900); simSteamRunning = false; return true },
  listAccounts: async (): Promise<SteamAccount[]> => {
    await delay(100)
    return [{ accountId: '76561198012345678', persona: 'arch' }]
  },

  // ── Games ──────────────────────────────────────────────────────────────────
  listGames: async () => { await delay(400); return simGames },
  getLaunchOptions: async (appId: number) => {
    await delay(60)
    return simGames.find((g) => g.appId === appId)?.launchOptions ?? ''
  },
  setLaunchOptions: async (appId: number, options: string) => {
    await delay(200)
    const game = simGames.find((g) => g.appId === appId)
    if (game) game.launchOptions = options
    return { ok: true }
  },
  previewBatchTransform: async (req: BatchTransformPreviewRequest) => {
    await delay(120)
    return req.appIds.map((appId) => {
      const game = simGames.find((g) => g.appId === appId)
      const before = game?.launchOptions ?? ''
      const after = transformLaunchOptions(before, req.params)
      return { appId, name: game?.name ?? String(appId), before, after }
    })
  },
  applyBatchTransform: async (req: BatchTransformApplyRequest): Promise<BatchTransformResult> => {
    await delay(400)
    for (const { appId, after } of req.rows) {
      const game = simGames.find((g) => g.appId === appId)
      if (game) game.launchOptions = after
    }
    return { ok: true, written: req.rows.length, backup: '/home/arch/.steam/steam/userdata/76561198012345678/config/localconfig.vdf.steamtools.bak' }
  },
  restoreBackup: async (_accountId: string): Promise<RestoreBackupResult> => {
    await delay(300)
    return { ok: true, restoredFrom: '/home/arch/.steam/steam/userdata/76561198012345678/config/localconfig.vdf.steamtools.bak' }
  },
  openLocalconfigFolder: async (_accountId: string) => { /* no-op in sim */ },

  // ── Symlink hub ────────────────────────────────────────────────────────────
  runSymlinkHub: async (options: SymlinkHubOptions) => {
    await simulateSymlinkStream(symlinkCh.emit, options.dryRun)
    return { ok: true }
  },
  onSymlinkProgress: symlinkCh.on,

  // ── FSR DLL ────────────────────────────────────────────────────────────────
  analyzeDll: async (_filePath: string) => { await delay(700); return { ok: true, data: MOCK_DLL_INFO } },
  copyDll: async (_dllPath: string) => { await simulateFsrStream(fsrCh.emit); return { ok: true } },
  onFsrProgress: fsrCh.on,

  // ── GPU ────────────────────────────────────────────────────────────────────
  detectGpu: async () => { await delay(150); return MOCK_GPU_INFO },

  // ── Compat tool ────────────────────────────────────────────────────────────
  getCompatInfo: async (appId: number) => {
    await delay(60)
    return MOCK_COMPAT_INFO[appId] ?? { toolName: null, toolDescription: 'global default', sourceLabel: 'global' }
  },
  getGlobalEnvOverrides: async (appId: number): Promise<Record<string, string>> => {
    await delay(60)
    // Return a fixture for ~25% of games (those whose appId % 4 === 0)
    // so the tri-state UI is exercisable in dev:sim
    if (appId % 4 === 0) {
      return { DXVK_ASYNC: '1', PROTON_NO_ESYNC: '1' }
    }
    if (appId % 4 === 1) {
      return { MANGOHUD: '1' }
    }
    return {}
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings: async (): Promise<AppSettings> => { await delay(80); return { ...simSettings } },
  setSettings: async (s: AppSettings) => { await delay(150); simSettings = { ...s }; return { ok: true } },

  // ── Updates ────────────────────────────────────────────────────────────────
  checkForUpdates: async () => {
    await delay(1500)
    updateAvailCh.emit({ version: '1.2.0' })
  },
  downloadUpdate: async () => {
    for (let pct = 0; pct <= 100; pct += 10) {
      await delay(200)
      updateProgCh.emit({ percent: pct })
    }
    await delay(200)
    updateDoneCh.emit({ version: '1.2.0' })
  },
  installUpdate: async () => { /* no-op in sim */ },
  onUpdateAvailable: updateAvailCh.on,
  onUpdateDownloaded: updateDoneCh.on,
  onUpdateProgress: updateProgCh.on,
  onUpdateNotAvailable: updateNotAvailCh.on,
  onUpdateError: updateErrCh.on,

  // ── Dialogs & shell ────────────────────────────────────────────────────────
  openFileDialog: async (_filters?: unknown) => {
    await delay(300)
    return '/home/arch/Downloads/amdxcffx64.dll'
  },
  openDirDialog: async () => { await delay(300); return '/home/arch/SteamToolsCachyOS' },
  openPath: async (_p: string) => { /* no-op */ },

  getAboutInfo: async (): Promise<AppAboutInfo> => ({
    name: 'SteamToolsCachyOS',
    version: '0.0.0-sim',
  }),
  onShowAbout: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.ABOUT_SHOW, handler)
    return () => ipcRenderer.removeListener(IPC.ABOUT_SHOW, handler)
  },
  openExternalUrl: async (_url: string) => { /* no-op in sim */ },
}
