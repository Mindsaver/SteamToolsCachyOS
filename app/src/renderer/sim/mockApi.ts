/**
 * Simulation mock for window.api.
 * Injected by the preload when VITE_SIM=1 — gives the renderer a full fake
 * backend that returns realistic data and animates progress streams so you
 * can experience the real app feel without a Steam installation.
 */

import type { Api } from '../../preload/index'
import type {
  AppSettings,
  SymlinkHubOptions,
  BatchLaunchUpdate,
  CompatToolInfo,
  SteamCompatSnapshot,
} from '../../shared/types'
import {
  MOCK_STEAM_INFO,
  MOCK_GAMES,
  MOCK_GPU_INFO,
  MOCK_DLL_INFO,
  MOCK_SETTINGS,
  MOCK_COMPAT_INFO,
  MOCK_STEAM_PLAY_DEFAULT,
  simulateSymlinkStream,
  simulateFsrStream,
} from './mockData'

const MOCK_COMPAT_FALLBACK: CompatToolInfo = {
  toolName: MOCK_STEAM_PLAY_DEFAULT.toolName,
  toolDescription: MOCK_STEAM_PLAY_DEFAULT.toolDescription,
  sourceLabel: 'Steam default',
  selectionKind: 'steam_default',
  steamDefaultToolName: MOCK_STEAM_PLAY_DEFAULT.toolName,
  steamDefaultDescription: MOCK_STEAM_PLAY_DEFAULT.toolDescription,
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Mutable state so edits inside the sim persist for the session
let simSettings: AppSettings = { ...MOCK_SETTINGS }
let simGames = MOCK_GAMES.map((g) => ({ ...g }))
let simSteamRunning = false

// Event listener registries for push events
type ProgressCb = (p: import('../../shared/types').SymlinkProgress) => void
const symlinkListeners = new Set<ProgressCb>()
const fsrListeners = new Set<ProgressCb>()
const updateAvailListeners = new Set<(i: { version: string }) => void>()
const updateDoneListeners = new Set<(i: { version: string }) => void>()
const updateProgressListeners = new Set<(i: { percent: number }) => void>()
const updateInstallStartedListeners = new Set<() => void>()

export const mockApi: Api = {
  // ── Steam ──────────────────────────────────────────────────────────────────
  getSteamInfo: async () => { await delay(300); return MOCK_STEAM_INFO },
  isSteamRunning: async () => { await delay(80); return simSteamRunning },
  closeSteam: async () => {
    await delay(800)
    simSteamRunning = false
    return true
  },

  // ── Games ──────────────────────────────────────────────────────────────────
  listGames: async () => { await delay(400); return simGames },
  getLaunchOptions: async (appId) => {
    await delay(60)
    return simGames.find((g) => g.appId === appId)?.launchOptions ?? ''
  },
  setLaunchOptions: async (appId, options) => {
    await delay(200)
    const game = simGames.find((g) => g.appId === appId)
    if (game) game.launchOptions = options
    return { ok: true }
  },
  batchSetLaunchOptions: async ({ snippet, appIds }: BatchLaunchUpdate) => {
    await delay(500)
    for (const id of appIds) {
      const game = simGames.find((g) => g.appId === id)
      if (game) {
        const cur = game.launchOptions || ''
        const sn = snippet.trim()
        if (!cur) game.launchOptions = `${sn} %command%`
        else if (!cur.includes(sn)) game.launchOptions = `${sn} ${cur}`
      }
    }
    return { ok: true }
  },

  // ── Symlink hub ────────────────────────────────────────────────────────────
  runSymlinkHub: async (options: SymlinkHubOptions) => {
    simulateSymlinkStream((p) => {
      for (const cb of symlinkListeners) cb(p)
    }, options.dryRun)
    return { ok: true }
  },
  onSymlinkProgress: (cb) => {
    symlinkListeners.add(cb)
    return () => symlinkListeners.delete(cb)
  },

  // ── FSR DLL ────────────────────────────────────────────────────────────────
  analyzeDll: async (_filePath) => {
    await delay(600)
    return { ok: true, data: MOCK_DLL_INFO }
  },
  copyDll: async (_dllPath) => {
    simulateFsrStream((p) => {
      for (const cb of fsrListeners) cb(p)
    })
    return { ok: true }
  },
  onFsrProgress: (cb) => {
    fsrListeners.add(cb)
    return () => fsrListeners.delete(cb)
  },

  // ── GPU ────────────────────────────────────────────────────────────────────
  detectGpu: async () => { await delay(150); return MOCK_GPU_INFO },

  // ── Compat tool ────────────────────────────────────────────────────────────
  getCompatInfo: async (appId) => {
    await delay(60)
    return MOCK_COMPAT_INFO[appId] ?? MOCK_COMPAT_FALLBACK
  },
  getCompatSnapshot: async (appIds: number[]): Promise<SteamCompatSnapshot> => {
    await delay(80)
    const perApp: Record<string, CompatToolInfo> = {}
    for (const id of appIds) {
      perApp[String(id)] = MOCK_COMPAT_INFO[id] ?? MOCK_COMPAT_FALLBACK
    }
    return { steamPlayDefault: MOCK_STEAM_PLAY_DEFAULT, perApp }
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings: async () => { await delay(80); return { ...simSettings } },
  setSettings: async (s: AppSettings) => { await delay(150); simSettings = { ...s }; return { ok: true } },

  // ── Updates ────────────────────────────────────────────────────────────────
  checkForUpdates: async () => {
    await delay(1500)
    for (const cb of updateAvailListeners) cb({ version: '1.2.0' })
  },
  downloadUpdate: async () => {
    for (let pct = 0; pct <= 100; pct += 10) {
      await delay(200)
      for (const cb of updateProgressListeners) cb({ percent: pct })
    }
    await delay(200)
    for (const cb of updateDoneListeners) cb({ version: '1.2.0' })
  },
  installUpdate: async () => {
    await delay(60)
    for (const cb of updateInstallStartedListeners) cb()
  },
  onUpdateAvailable: (cb) => {
    updateAvailListeners.add(cb)
    return () => updateAvailListeners.delete(cb)
  },
  onUpdateDownloaded: (cb) => {
    updateDoneListeners.add(cb)
    return () => updateDoneListeners.delete(cb)
  },
  onUpdateProgress: (cb) => {
    updateProgressListeners.add(cb)
    return () => updateProgressListeners.delete(cb)
  },
  onUpdateInstallStarted: (cb) => {
    updateInstallStartedListeners.add(cb)
    return () => updateInstallStartedListeners.delete(cb)
  },

  // ── Dialogs & shell ────────────────────────────────────────────────────────
  openFileDialog: async () => { await delay(300); return '/home/arch/Downloads/amdxcffx64.dll' },
  openDirDialog: async () => { await delay(300); return '/home/arch/SteamToolsCachyOS' },
  openPath: async (_p) => { /* no-op */ },
}
