// Shared types used across main process, preload, and renderer

export interface InstalledGame {
  appId: number
  name: string
  installDir: string
  installPath: string
  libraryPath: string
  compatDataPath: string | null
  system32Path: string | null
  launchOptions: string
}

export interface SteamInfo {
  installPath: string
  libraries: string[]
  games: InstalledGame[]
  userDataPath: string | null
  accounts: string[]
}

export interface GpuInfo {
  vendors: Array<'amd' | 'nvidia' | 'intel' | 'unknown'>
  hasAmd: boolean
  hasNvidia: boolean
  hasIntel: boolean
  primaryVendor: 'amd' | 'nvidia' | 'intel' | 'unknown'
}

export interface DllVersionInfo {
  filePath: string
  fsr: string | null
  ml: string | null
  framegen: string | null
  roles: string[]
  rawVersions: string[]
}

export type SymlinkMode = 'all' | 'folders' | 'dll'
export type GameFilter = 'heuristic' | 'all'

export interface SymlinkHubOptions {
  hubRoot?: string
  mode: SymlinkMode
  filter: GameFilter
  dllPath?: string
  dryRun: boolean
}

export interface SymlinkProgress {
  type: 'log' | 'progress' | 'done' | 'error'
  message: string
  current?: number
  total?: number
  exitCode?: number
}

export interface LaunchOptionsUpdate {
  appId: number
  options: string
}

export interface BatchLaunchUpdate {
  snippet: string
  appIds: number[]
}

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  releaseUrl: string | null
}

export interface AppSettings {
  steamPath: string | null
  hubRoot: string | null
  gameFilter: GameFilter
  autoUpdate: boolean
  autoUpdateThrottleHours: number
  theme: 'dark' | 'light' | 'system'
}

export interface CompatToolInfo {
  toolName: string | null
  toolDescription: string | null
  sourceLabel: string
}
