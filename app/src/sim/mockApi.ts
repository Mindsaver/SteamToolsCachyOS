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
  CompatToolInfo,
  SteamCompatSnapshot,
  SymlinkHubOptions,
  SteamAccount, BatchTransformPreviewRequest, BatchTransformApplyRequest,
  BatchTransformResult, RestoreBackupResult,
  CompatProviderId,
  CompatGithubReleaseRow,
  InstalledCompatToolRow,
  CompatInstallProgress,
  CompatUpdateCheckResult,
  CompatToolsUpdateAvailablePayload,
  ProtonUserSettingsCreateResult,
  ProtonUserSettingsGetResult,
  ProtonUserSettingsSaveResult,
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
  MangoHudProfilesListResult,
  MangoHudProfileSaveResult,
  MangoHudProfileDeleteResult,
  MangoHudProfileAssignResult,
  MangoHudProfileResolveResult,
  MangoHudProfileApplyMode,
  MangoHudProfileSettingsSaveResult,
  MangoHudProfile,
  RunningFsrStatus,
} from '../shared/types'
import { parseMangoHudConfigText, serializeMangoHudEntries } from '../shared/mangohudConfig'
import { formatUserSettingsPyFile, parseUserSettingsEnvFromText } from '../shared/userSettingsPy'
import { transformLaunchOptions } from '../shared/launchOptions/compose'
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

const MOCK_COMPAT_ROWS: InstalledCompatToolRow[] = [
  {
    dirName: 'GE-Proton10-34',
    installPath: '/home/arch/.local/share/Steam/compatibilitytools.d/GE-Proton10-34',
    internalName: 'GE-Proton10-34',
    displayName: 'GE-Proton10-34',
    provider: 'ge_proton',
  },
  {
    dirName: 'Proton-CachyOS Latest',
    installPath: '/home/arch/.local/share/Steam/compatibilitytools.d/Proton-CachyOS Latest',
    internalName: 'Proton-CachyOS Latest',
    displayName: 'Proton-CachyOS Latest',
    provider: 'proton_cachyos',
  },
]

/** Simulated `user_settings.py` body per internal tool name */
const simProtonUserSettingsText = new Map<string, string>()

/** Named backups per tool: fileName → content + mtime */
const simProtonNamedBackups = new Map<string, Map<string, { content: string; mtimeMs: number }>>()

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
const updateInstallStartedCh = makeVoidListeners()
const compatProgCh = makeChannel<(p: CompatInstallProgress) => void>()
const compatAvailCh = makeChannel<(p: CompatToolsUpdateAvailablePayload) => void>()
const compatCheckResultCh = makeChannel<(p: CompatUpdateCheckResult) => void>()
const simMongoConnections = new Map<string, MongoConnectionProfile>()
const simMongoDocs = new Map<string, HudDocument>()
const simMongoVersions = new Map<string, Array<HudVersionMeta & { snapshot: HudDocument }>>()
let simMangoHudRaw = 'fps=1\nframetime=1\nposition=top-left'
const simMangoHudBackups = new Map<string, { rawText: string; mtimeMs: number }>()
const simMangoHudProfiles = new Map<string, MangoHudProfile>()
const simMangoHudAssignments = new Map<number, string>()
let simMangoHudApplyMode: MangoHudProfileApplyMode = 'manual'
let simMangoHudDefaultProfileId: string | null = null

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
  getRunningFsrStatus: async (_appId?: number | null): Promise<RunningFsrStatus> => {
    await delay(60)
    return {
      indicatorState: 'fsr4-active',
      indicatorRequested: true,
      dllLoaded: true,
      likelyActive: true,
      detectedAppId: 730,
      detectedGamePid: 4242,
      dllPathKind: 'mapped',
      mappedDlls: {
        fsr: ['/home/arch/.steam/steam/steamapps/compatdata/730/pfx/drive_c/windows/system32/amdxcffx64.dll'],
        dlss: [],
        xess: [],
      },
      fsrVersion: '4.1.0',
      mlfiVersion: '4.0.0',
      framegenVersion: '4.1.0',
      confidence: 'inferred',
      label: 'FSR4 active (4.1.0 inferred)',
      sourcePath: '/home/arch/.steam/steam/steamapps/compatdata/730/pfx/drive_c/windows/system32/amdxcffx64.dll',
      updatedAt: Date.now(),
    }
  },
  syncRunningFsrToMangoHud: async (
    _appId?: number | null,
    _style?: MangoHudRuntimeTextStyle
  ): Promise<MangoHudReloadResult> => {
    await delay(40)
    return { ok: true, message: 'Simulated MangoHud runtime FSR text sync' }
  },
  onFsrProgress: fsrCh.on,

  // ── GPU ────────────────────────────────────────────────────────────────────
  detectGpu: async () => { await delay(150); return MOCK_GPU_INFO },

  // ── Compat tool ────────────────────────────────────────────────────────────
  getCompatInfo: async (appId: number) => {
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

  getProtonUserSettings: async (internalName: string): Promise<ProtonUserSettingsGetResult> => {
    await delay(80)
    const trimmed = String(internalName ?? '').trim()
    const row = MOCK_COMPAT_ROWS.find((r) => r.internalName === trimmed)
    if (!row) return { ok: false, error: 'Tool not found' }
    const fileText = simProtonUserSettingsText.get(trimmed) ?? ''
    const fileExists = fileText.length > 0
    const filePath = `${row.installPath}/user_settings.py`
    const env = parseUserSettingsEnvFromText(fileText)
    return {
      ok: true,
      internalName: trimmed,
      displayName: row.displayName,
      installPath: row.installPath,
      filePath,
      fileExists,
      fileText,
      env,
    }
  },
  saveProtonUserSettings: async (payload: {
    internalName: string
    fileText: string
  }): Promise<ProtonUserSettingsSaveResult> => {
    await delay(100)
    const trimmed = String(payload.internalName ?? '').trim()
    if (!MOCK_COMPAT_ROWS.some((r) => r.internalName === trimmed)) {
      return { ok: false, error: 'Tool not found' }
    }
    simProtonUserSettingsText.set(trimmed, payload.fileText)
    return { ok: true }
  },
  createProtonUserSettings: async (internalName: string): Promise<ProtonUserSettingsCreateResult> => {
    await delay(100)
    const trimmed = String(internalName ?? '').trim()
    const row = MOCK_COMPAT_ROWS.find((r) => r.internalName === trimmed)
    if (!row) return { ok: false, error: 'Tool not found' }
    if (simProtonUserSettingsText.has(trimmed) && (simProtonUserSettingsText.get(trimmed) ?? '').length > 0) {
      return { ok: false, error: 'user_settings.py already exists' }
    }
    const fileText = formatUserSettingsPyFile({})
    simProtonUserSettingsText.set(trimmed, fileText)
    const filePath = `${row.installPath}/user_settings.py`
    return {
      ok: true,
      data: {
        ok: true,
        internalName: trimmed,
        displayName: row.displayName,
        installPath: row.installPath,
        filePath,
        fileExists: true,
        fileText,
        env: parseUserSettingsEnvFromText(fileText),
      },
    }
  },
  listProtonUserSettingsBackups: async (internalName: string): Promise<ProtonUserSettingsListBackupsResult> => {
    await delay(40)
    const trimmed = String(internalName ?? '').trim()
    if (!MOCK_COMPAT_ROWS.some((r) => r.internalName === trimmed)) {
      return { ok: false, error: 'Tool not found' }
    }
    const m = simProtonNamedBackups.get(trimmed)
    const entries = m
      ? [...m.entries()]
          .map(([fileName, v]) => ({ fileName, mtimeMs: v.mtimeMs }))
          .sort((a, b) => b.mtimeMs - a.mtimeMs)
      : []
    return { ok: true, entries }
  },
  readProtonUserSettingsBackup: async (payload: {
    internalName: string
    fileName: string
  }): Promise<ProtonUserSettingsReadBackupResult> => {
    await delay(40)
    const trimmed = String(payload.internalName ?? '').trim()
    const m = simProtonNamedBackups.get(trimmed)
    const row = m?.get(payload.fileName)
    if (!row) return { ok: false, error: 'Backup not found' }
    return { ok: true, fileText: row.content }
  },
  saveProtonUserSettingsNamedBackup: async (payload: {
    internalName: string
    fileName: string
    fileText: string
  }): Promise<ProtonUserSettingsSaveNamedBackupResult> => {
    await delay(80)
    const trimmed = String(payload.internalName ?? '').trim()
    if (!MOCK_COMPAT_ROWS.some((r) => r.internalName === trimmed)) {
      return { ok: false, error: 'Tool not found' }
    }
    const fn = payload.fileName.trim()
    if (!fn || fn.includes('/') || fn.includes('..')) return { ok: false, error: 'Invalid file name' }
    let m = simProtonNamedBackups.get(trimmed)
    if (!m) {
      m = new Map()
      simProtonNamedBackups.set(trimmed, m)
    }
    m.set(fn, { content: payload.fileText, mtimeMs: Date.now() })
    return { ok: true }
  },

  // ── Compatibility tools ───────────────────────────────────────────────────
  listCompatToolsInstalled: async (): Promise<InstalledCompatToolRow[]> => {
    await delay(120)
    return MOCK_COMPAT_ROWS.map((r) => ({ ...r }))
  },
  listCompatReleases: async ({
    provider,
  }: {
    provider: CompatProviderId
    slrOnly?: boolean
  }): Promise<CompatGithubReleaseRow[]> => {
    await delay(200)
    if (provider === 'ge_proton') {
      return [
        { tag_name: 'GE-Proton10-34', published_at: '2026-01-01T00:00:00Z' },
        { tag_name: 'GE-Proton10-33', published_at: '2025-12-01T00:00:00Z' },
      ]
    }
    return [{ tag_name: 'cachyos-10.0-20260420-slr', published_at: '2026-04-21T00:00:00Z' }]
  },
  checkCompatToolsUpdate: async (provider: CompatProviderId): Promise<CompatUpdateCheckResult> => {
    await delay(150)
    return {
      provider,
      hasUpdate: false,
      remoteTag: provider === 'ge_proton' ? 'GE-Proton10-34' : 'cachyos-10.0-20260420-slr',
      installedBestTag: 'GE-Proton10-34',
      releaseUrl: 'https://github.com/',
    }
  },
  installCompatRelease: async (_req: {
    provider: CompatProviderId
    tag: string
    installLayout?: 'default' | 'latest_slot'
  }) => {
    await delay(200)
    compatProgCh.emit({ type: 'log', message: 'Simulated download…' })
    compatProgCh.emit({ type: 'progress', message: 'Downloading…', current: 5, total: 10 })
    compatProgCh.emit({ type: 'done', message: 'Simulated install done' })
    return { ok: true as const }
  },
  openCompatUserSettings: async () => ({ ok: true as const }),
  onCompatToolsProgress: compatProgCh.on,
  onCompatToolsUpdateAvailable: compatAvailCh.on,
  onCompatToolsCheckResult: compatCheckResultCh.on,

  getMangoHudStatus: async (): Promise<MangoHudStatus> => {
    await delay(20)
    return {
      configPath: '/home/arch/.config/MangoHud/MangoHud.conf',
      configExists: true,
      baselineBackupExists: true,
    }
  },
  getMangoHudConfig: async (): Promise<MangoHudReadResult> => {
    await delay(30)
    const parsed = parseMangoHudConfigText(simMangoHudRaw)
    return {
      ok: true,
      configPath: '/home/arch/.config/MangoHud/MangoHud.conf',
      fileExists: true,
      rawText: simMangoHudRaw,
      entries: parsed.entries,
    }
  },
  saveMangoHudConfig: async (payload: {
    rawText?: string
    entries?: MangoHudConfigEntry[]
    makeNamedBackup?: string | null
  }): Promise<MangoHudSaveResult> => {
    await delay(40)
    if (payload.makeNamedBackup) {
      simMangoHudBackups.set(payload.makeNamedBackup, { rawText: simMangoHudRaw, mtimeMs: Date.now() })
    }
    simMangoHudRaw =
      typeof payload.rawText === 'string'
        ? payload.rawText
        : serializeMangoHudEntries(payload.entries ?? [])
    return { ok: true, configPath: '/home/arch/.config/MangoHud/MangoHud.conf' }
  },
  reloadMangoHud: async (): Promise<MangoHudReloadResult> => {
    await delay(20)
    return { ok: true, message: 'Simulated MangoHud reload signal' }
  },
  listMangoHudBackups: async (): Promise<MangoHudListBackupsResult> => {
    await delay(20)
    const entries = [...simMangoHudBackups.entries()]
      .map(([fileName, v]) => ({ fileName, mtimeMs: v.mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    return { ok: true, entries }
  },
  readMangoHudBackup: async (fileName: string) => {
    await delay(20)
    const v = simMangoHudBackups.get(fileName)
    if (!v) return { ok: false as const, error: 'Backup not found' }
    return { ok: true as const, rawText: v.rawText }
  },
  restoreMangoHudBackup: async (fileName: string): Promise<MangoHudSaveResult> => {
    await delay(20)
    const v = simMangoHudBackups.get(fileName)
    if (!v) return { ok: false, error: 'Backup not found' }
    simMangoHudRaw = v.rawText
    return { ok: true, configPath: '/home/arch/.config/MangoHud/MangoHud.conf' }
  },
  listMangoHudProfiles: async (): Promise<MangoHudProfilesListResult> => {
    await delay(30)
    const profiles = [...simMangoHudProfiles.values()].sort((a, b) => a.name.localeCompare(b.name))
    const assignments: Record<string, string> = {}
    for (const [appId, profileId] of simMangoHudAssignments.entries()) assignments[String(appId)] = profileId
    if (simMangoHudDefaultProfileId && !simMangoHudProfiles.has(simMangoHudDefaultProfileId)) {
      simMangoHudDefaultProfileId = null
    }
    return {
      ok: true,
      profiles,
      assignments,
      applyMode: simMangoHudApplyMode,
      defaultProfileId: simMangoHudDefaultProfileId,
    }
  },
  saveMangoHudProfile: async (payload: {
    id?: string
    name: string
    entries: MangoHudConfigEntry[]
  }): Promise<MangoHudProfileSaveResult> => {
    await delay(30)
    const trimmed = payload.name.trim()
    if (!trimmed) return { ok: false, error: 'Profile name is required' }
    for (const profile of simMangoHudProfiles.values()) {
      if (profile.name.toLowerCase() === trimmed.toLowerCase() && profile.id !== payload.id) {
        return { ok: false, error: 'A profile with that name already exists' }
      }
    }
    const ts = Date.now()
    if (payload.id) {
      const existing = simMangoHudProfiles.get(payload.id)
      if (!existing) return { ok: false, error: 'Profile not found' }
      const next: MangoHudProfile = { ...existing, name: trimmed, entries: payload.entries, updatedAt: ts }
      simMangoHudProfiles.set(next.id, next)
      return { ok: true, profile: next }
    }
    const created: MangoHudProfile = {
      id: `mhp_${Math.random().toString(36).slice(2, 9)}`,
      name: trimmed,
      entries: payload.entries,
      createdAt: ts,
      updatedAt: ts,
    }
    simMangoHudProfiles.set(created.id, created)
    return { ok: true, profile: created }
  },
  deleteMangoHudProfile: async (profileId: string): Promise<MangoHudProfileDeleteResult> => {
    await delay(20)
    if (!simMangoHudProfiles.has(profileId)) return { ok: false, error: 'Profile not found' }
    simMangoHudProfiles.delete(profileId)
    for (const [appId, assigned] of simMangoHudAssignments.entries()) {
      if (assigned === profileId) simMangoHudAssignments.delete(appId)
    }
    if (simMangoHudDefaultProfileId === profileId) simMangoHudDefaultProfileId = null
    return { ok: true }
  },
  assignMangoHudProfile: async (payload: {
    appId: number
    profileId: string | null
  }): Promise<MangoHudProfileAssignResult> => {
    await delay(20)
    if (payload.appId <= 0 || !Number.isFinite(payload.appId)) return { ok: false, error: 'Invalid app id' }
    if (!payload.profileId) {
      simMangoHudAssignments.delete(payload.appId)
      return { ok: true }
    }
    if (!simMangoHudProfiles.has(payload.profileId)) return { ok: false, error: 'Profile not found' }
    simMangoHudAssignments.set(payload.appId, payload.profileId)
    return { ok: true }
  },
  getMangoHudProfileForApp: async (appId: number): Promise<MangoHudProfileResolveResult> => {
    await delay(20)
    if (simMangoHudApplyMode === 'manual') {
      const profile = simMangoHudDefaultProfileId ? simMangoHudProfiles.get(simMangoHudDefaultProfileId) ?? null : null
      return { ok: true, profile, source: profile ? 'manual' : 'none' }
    }
    const profileId = simMangoHudAssignments.get(appId)
    if (profileId) {
      const specific = simMangoHudProfiles.get(profileId) ?? null
      if (specific) return { ok: true, profile: specific, source: 'specific' }
    }
    const fallback = simMangoHudDefaultProfileId ? simMangoHudProfiles.get(simMangoHudDefaultProfileId) ?? null : null
    return fallback ? { ok: true, profile: fallback, source: 'default' } : { ok: true, profile: null, source: 'none' }
  },
  saveMangoHudProfileSettings: async (payload: {
    applyMode: MangoHudProfileApplyMode
    defaultProfileId: string | null
  }): Promise<MangoHudProfileSettingsSaveResult> => {
    await delay(20)
    if (payload.defaultProfileId && !simMangoHudProfiles.has(payload.defaultProfileId)) {
      return { ok: false, error: 'Default profile not found' }
    }
    simMangoHudApplyMode = payload.applyMode === 'auto-detect' ? 'auto-detect' : 'manual'
    simMangoHudDefaultProfileId = payload.defaultProfileId ?? null
    return { ok: true }
  },

  listMongoHudConnections: async (): Promise<MongoConnectionProfile[]> => {
    await delay(50)
    return [...simMongoConnections.values()]
  },
  saveMongoHudConnection: async (
    profile: Pick<MongoConnectionProfile, 'id' | 'name' | 'connectionString' | 'database'>
  ): Promise<MongoConnectionProfile> => {
    await delay(70)
    const ts = Date.now()
    const id = profile.id || `conn_${Math.random().toString(36).slice(2, 9)}`
    const next: MongoConnectionProfile = {
      id,
      name: profile.name,
      connectionString: profile.connectionString,
      database: profile.database,
      createdAt: simMongoConnections.get(id)?.createdAt ?? ts,
      updatedAt: ts,
    }
    simMongoConnections.set(id, next)
    return next
  },
  deleteMongoHudConnection: async (id: string) => {
    await delay(50)
    return simMongoConnections.delete(id) ? { ok: true } : { ok: false, error: 'Connection not found' }
  },
  testMongoHudConnection: async (_connectionString: string) => {
    await delay(140)
    return { ok: true }
  },
  listMongoHudDocuments: async (): Promise<HudDocument[]> => {
    await delay(50)
    return [...simMongoDocs.values()]
  },
  getMongoHudDocument: async (id: string): Promise<HudDocument | null> => {
    await delay(50)
    return simMongoDocs.get(id) ?? null
  },
  saveMongoHudDocument: async (doc: HudDocument): Promise<HudDocument> => {
    await delay(80)
    const ts = Date.now()
    const id = doc.id || `doc_${Math.random().toString(36).slice(2, 9)}`
    const next = { ...doc, id, createdAt: doc.createdAt || ts, updatedAt: ts }
    simMongoDocs.set(id, next)
    return next
  },
  deleteMongoHudDocument: async (id: string) => {
    await delay(50)
    simMongoDocs.delete(id)
    simMongoVersions.delete(id)
    return { ok: true }
  },
  exportMongoHudDocument: async (id: string) => {
    await delay(40)
    const doc = simMongoDocs.get(id)
    if (!doc) return { ok: false as const, error: 'Document not found' }
    return { ok: true as const, json: JSON.stringify(doc, null, 2) }
  },
  importMongoHudDocument: async (jsonText: string) => {
    await delay(50)
    try {
      const parsed = JSON.parse(jsonText) as HudDocument
      const id = `doc_${Math.random().toString(36).slice(2, 9)}`
      const next = { ...parsed, id, name: parsed.name || 'Imported HUD', createdAt: Date.now(), updatedAt: Date.now() }
      simMongoDocs.set(id, next)
      return { ok: true as const, doc: next }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Invalid JSON' }
    }
  },
  listMongoHudVersions: async (documentId: string): Promise<HudVersionMeta[]> => {
    await delay(30)
    return (simMongoVersions.get(documentId) ?? []).map(({ snapshot: _snapshot, ...meta }) => meta)
  },
  createMongoHudVersion: async (payload: { documentId: string; label: string }) => {
    await delay(60)
    const doc = simMongoDocs.get(payload.documentId)
    if (!doc) return { ok: false, error: 'Document not found' }
    const versions = simMongoVersions.get(payload.documentId) ?? []
    versions.push({
      id: `ver_${Math.random().toString(36).slice(2, 9)}`,
      documentId: payload.documentId,
      label: payload.label || 'Version',
      createdAt: Date.now(),
      snapshot: JSON.parse(JSON.stringify(doc)) as HudDocument,
    })
    simMongoVersions.set(payload.documentId, versions)
    return { ok: true }
  },
  restoreMongoHudVersion: async (versionId: string) => {
    await delay(60)
    for (const [docId, versions] of simMongoVersions.entries()) {
      const version = versions.find((v) => v.id === versionId)
      if (version) {
        const restored = { ...version.snapshot, updatedAt: Date.now(), id: docId }
        simMongoDocs.set(docId, restored)
        return { ok: true as const, doc: restored }
      }
    }
    return { ok: false as const, error: 'Version not found' }
  },
  previewMongoHudData: async (_req: MongoHudPreviewRequest): Promise<MongoHudPreviewResult> => {
    await delay(120)
    return {
      ok: true,
      rows: [
        { fps: 144, frameTimeMs: 6.9, gpuTemp: 62, gpuUtil: 88, cpuUtil: 42, game: 'Demo Game' },
        { fps: 139, frameTimeMs: 7.2, gpuTemp: 64, gpuUtil: 91, cpuUtil: 45, game: 'Demo Game' },
      ],
    }
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
  installUpdate: async () => {
    await delay(60)
    updateInstallStartedCh.emit()
  },
  onUpdateAvailable: updateAvailCh.on,
  onUpdateDownloaded: updateDoneCh.on,
  onUpdateProgress: updateProgCh.on,
  onUpdateNotAvailable: updateNotAvailCh.on,
  onUpdateError: updateErrCh.on,
  onUpdateInstallStarted: updateInstallStartedCh.on,

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
