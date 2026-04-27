// Shared types used across main process, preload, and renderer

/** From Electron app.getName() / app.getVersion() — version matches packaged release (package.json). */
export interface AppAboutInfo {
  name: string
  version: string
}

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

export interface SteamAccount {
  accountId: string
  persona: string | null
}

export type BatchOp = 'set' | 'prefix' | 'suffix' | 'replace' | 'clear' | 'snippet'

export interface BatchTransformParams {
  op: BatchOp
  setValue?: string
  prefix?: string
  suffix?: string
  find?: string
  replaceWith?: string
  snippet?: string
}

export interface BatchTransformPreviewRequest {
  appIds: number[]
  accountId: string
  params: BatchTransformParams
}

export interface BatchTransformPreviewRow {
  appId: number
  name: string
  before: string
  after: string
}

export interface BatchTransformApplyRequest {
  rows: Array<{ appId: number; after: string }>
  accountId: string
}

export interface BatchTransformResult {
  ok: boolean
  written?: number
  backup?: string
  error?: string
}

export interface RestoreBackupResult {
  ok: boolean
  restoredFrom?: string
  error?: string
}

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  releaseUrl: string | null
}

export type CompatProviderId = 'ge_proton' | 'proton_cachyos'

/** `latest_slot` = stable folder + Steam names like “Proton-CachyOS (Latest)”. `default` = archive layout as shipped. */
export type CompatInstallLayout = 'default' | 'latest_slot'

/** `rolling` = follow newest tag in the list. `pinned` = install only the chosen tag (no background “latest” checks). */
export type CompatReleaseChannel = 'rolling' | 'pinned'

export type CachyosArchChoice = 'x86_64' | 'x86_64_v4'

export interface AppSettings {
  steamPath: string | null
  hubRoot: string | null
  gameFilter: GameFilter
  autoUpdate: boolean
  autoUpdateThrottleHours: number
  theme: 'dark' | 'light' | 'system'
  /** Follow newest GE-Proton tag vs pick a fixed version. */
  geProtonChannel: CompatReleaseChannel
  /** When channel is rolling, allow throttled background GitHub checks + optional silent install. */
  geProtonAutoUpdate: boolean
  /** Installed tool `internalName` that receives GE-Proton background updates (Latest-line install). */
  geProtonAutoUpdateInternalName: string | null
  /** Last tag chosen when channel is pinned (UI restore). */
  geProtonPinnedTag: string | null
  /** Follow newest Proton-CachyOS tag vs pick a fixed version. */
  protonCachyosChannel: CompatReleaseChannel
  protonCachyosAutoUpdate: boolean
  /** Installed tool `internalName` that receives Proton-CachyOS background updates (Latest-line install). */
  protonCachyosAutoUpdateInternalName: string | null
  protonCachyosPinnedTag: string | null
  /** Prefer SLR-tagged CachyOS releases (`-slr` in tag). */
  protonCachyosSlrOnly: boolean
  protonCachyosArch: CachyosArchChoice
  /** Hours between automatic compat-tool update checks (GitHub). */
  compatToolsCheckThrottleHours: number
  /** When true and auto update is on, download+install without prompting (use with care). */
  compatToolsSilentAutoInstall: boolean
  compatGeLastCheckEpoch: number
  compatGeLastRemoteTag: string | null
  compatCachyosLastCheckEpoch: number
  compatCachyosLastRemoteTag: string | null
}

export type CompatSelectionKind = 'steam_default' | 'override' | 'native'

export interface CompatToolInfo {
  toolName: string | null
  toolDescription: string | null
  sourceLabel: string
  /** How this title relates to Steam’s global Steam Play default (CompatToolMapping "0"). */
  selectionKind: CompatSelectionKind
  /** Steam Play default tool id from config, for tooltips / context lines. */
  steamDefaultToolName?: string | null
  steamDefaultDescription?: string | null
}

/** Batch result: one Steam Play default + per installed app. */
export interface SteamCompatSnapshot {
  steamPlayDefault: {
    toolName: string | null
    toolDescription: string | null
  }
  perApp: Record<string, CompatToolInfo>
}

export interface CompatInstallProgress {
  type: 'log' | 'progress' | 'done' | 'error'
  message: string
  current?: number
  total?: number
}

export interface InstalledCompatToolRow {
  dirName: string
  installPath: string
  internalName: string
  displayName: string
  provider: CompatProviderId | 'other'
}

export interface CompatGithubReleaseRow {
  tag_name: string
  published_at: string
}

export interface CompatUpdateCheckResult {
  provider: CompatProviderId
  hasUpdate: boolean
  remoteTag: string | null
  installedBestTag: string | null
  releaseUrl: string | null
}

export interface CompatToolsUpdateAvailablePayload {
  provider: CompatProviderId
  remoteTag: string
  installedBestTag: string | null
  releaseUrl: string | null
}
