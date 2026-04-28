import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  parseMangoHudConfigText,
  serializeMangoHudEntries,
  type MangoHudConfigDoc,
  type MangoHudConfigEntry,
} from '../../../shared/mangohudConfig'
import type {
  MangoHudListBackupsResult,
  MangoHudProfileApplyMode,
  MangoHudProfile,
  MangoHudProfileAssignResult,
  MangoHudProfileDeleteResult,
  MangoHudProfileSettingsSaveResult,
  MangoHudProfileResolveResult,
  MangoHudProfilesListResult,
  MangoHudProfileSaveResult,
  MangoHudReadResult,
  MangoHudReloadResult,
  MangoHudSaveResult,
  MangoHudStatus,
  MangoHudRuntimeTextStyle,
  RunningFsrStatus,
} from '../../../shared/types'

const execFileAsync = promisify(execFile)
const BACKUPS_SUBDIR = 'steamtools-mangohud-backups'
const MAX_BACKUP_BASENAME_LEN = 128
const PROC_DIR = '/proc'

function resolveProfileStorePath(): string {
  const fromEnv = process.env['MANGOHUD_PROFILE_STORE_PATH']?.trim()
  if (fromEnv) return fromEnv
  return path.join(os.homedir(), '.config', 'MangoHud', 'steamtools-mangohud-profiles.json')
}

interface MangoHudProfileStore {
  profiles: MangoHudProfile[]
  assignments: Record<string, string>
  applyMode: MangoHudProfileApplyMode
  defaultProfileId: string | null
}

function resolveConfigPath(): string {
  const fromEnv = process.env['MANGOHUD_CONFIG_PATH']?.trim()
  if (fromEnv) return fromEnv
  return path.join(os.homedir(), '.config', 'MangoHud', 'MangoHud.conf')
}

function backupsDir(configPath: string): string {
  return path.join(path.dirname(configPath), BACKUPS_SUBDIR)
}

function now(): number {
  return Date.now()
}

function makeProfileId(): string {
  return `mhp_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

function readProfileStore(): MangoHudProfileStore {
  const profileStoreFile = resolveProfileStorePath()
  try {
    if (!fs.existsSync(profileStoreFile)) {
      return { profiles: [], assignments: {}, applyMode: 'manual', defaultProfileId: null }
    }
    const parsed = JSON.parse(fs.readFileSync(profileStoreFile, 'utf-8')) as Partial<MangoHudProfileStore>
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      assignments: parsed.assignments && typeof parsed.assignments === 'object' ? parsed.assignments : {},
      applyMode: parsed.applyMode === 'auto-detect' ? 'auto-detect' : 'manual',
      defaultProfileId: typeof parsed.defaultProfileId === 'string' ? parsed.defaultProfileId : null,
    }
  } catch {
    return { profiles: [], assignments: {}, applyMode: 'manual', defaultProfileId: null }
  }
}

function writeProfileStore(store: MangoHudProfileStore): void {
  const profileStoreFile = resolveProfileStorePath()
  fs.mkdirSync(path.dirname(profileStoreFile), { recursive: true })
  const tmpPath = `${profileStoreFile}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8')
  fs.renameSync(tmpPath, profileStoreFile)
}

function cleanProfileName(name: string): string {
  return String(name ?? '').trim().slice(0, 120)
}

function dedupeAssignments(store: MangoHudProfileStore): void {
  const validIds = new Set(store.profiles.map((p) => p.id))
  for (const [appId, profileId] of Object.entries(store.assignments)) {
    if (!/^\d+$/.test(appId) || !validIds.has(profileId)) delete store.assignments[appId]
  }
  if (store.defaultProfileId && !validIds.has(store.defaultProfileId)) {
    store.defaultProfileId = null
  }
}

function safeBackupBasename(fileName: string): { ok: true; name: string } | { ok: false; error: string } {
  const t = fileName.trim()
  if (!t) return { ok: false, error: 'Empty file name' }
  if (t !== path.basename(t)) return { ok: false, error: 'Path separators not allowed' }
  if (t.includes('..')) return { ok: false, error: 'Invalid file name' }
  if (t.length > MAX_BACKUP_BASENAME_LEN) return { ok: false, error: 'File name too long' }
  if (!/^[a-zA-Z0-9._\- ]+$/.test(t)) return { ok: false, error: 'Invalid file name characters' }
  return { ok: true, name: t }
}

function ensureBaselineBackup(configPath: string): void {
  const bakPath = `${configPath}.steamtools.bak`
  if (fs.existsSync(configPath) && !fs.existsSync(bakPath)) {
    fs.copyFileSync(configPath, bakPath)
  }
}

export function getMangoHudStatus(): MangoHudStatus {
  const configPath = resolveConfigPath()
  return {
    configPath,
    configExists: fs.existsSync(configPath),
    baselineBackupExists: fs.existsSync(`${configPath}.steamtools.bak`),
  }
}

export function readMangoHudConfig(): MangoHudReadResult {
  const configPath = resolveConfigPath()
  try {
    const rawText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : ''
    const parsed = parseMangoHudConfigText(rawText)
    return {
      ok: true,
      configPath,
      fileExists: fs.existsSync(configPath),
      rawText,
      entries: parsed.entries,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Read failed' }
  }
}

export function saveMangoHudConfig(payload: {
  rawText?: string
  entries?: MangoHudConfigEntry[]
  makeNamedBackup?: string | null
}): MangoHudSaveResult {
  const configPath = resolveConfigPath()
  try {
    const content =
      typeof payload.rawText === 'string'
        ? payload.rawText
        : serializeMangoHudEntries(payload.entries ?? [])
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    ensureBaselineBackup(configPath)
    if (payload.makeNamedBackup) {
      const safe = safeBackupBasename(payload.makeNamedBackup)
      if (!safe.ok) return safe
      fs.mkdirSync(backupsDir(configPath), { recursive: true })
      const backupContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : ''
      fs.writeFileSync(path.join(backupsDir(configPath), safe.name), backupContent, 'utf-8')
    }
    const tmpPath = `${configPath}.tmp`
    fs.writeFileSync(tmpPath, content, 'utf-8')
    fs.renameSync(tmpPath, configPath)
    return { ok: true, configPath }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Save failed' }
  }
}

export function listMangoHudBackups(): MangoHudListBackupsResult {
  const dir = backupsDir(resolveConfigPath())
  if (!fs.existsSync(dir)) return { ok: true, entries: [] }
  try {
    const entries: Array<{ fileName: string; mtimeMs: number }> = []
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isFile()) continue
      const safe = safeBackupBasename(ent.name)
      if (!safe.ok) continue
      const st = fs.statSync(path.join(dir, ent.name))
      entries.push({ fileName: ent.name, mtimeMs: st.mtimeMs })
    }
    entries.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return { ok: true, entries }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'List failed' }
  }
}

export function readMangoHudBackup(fileName: string): { ok: true; rawText: string } | { ok: false; error: string } {
  const safe = safeBackupBasename(fileName)
  if (!safe.ok) return safe
  const p = path.join(backupsDir(resolveConfigPath()), safe.name)
  if (!fs.existsSync(p)) return { ok: false, error: 'Backup not found' }
  try {
    return { ok: true, rawText: fs.readFileSync(p, 'utf-8') }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Read failed' }
  }
}

export function restoreMangoHudBackup(fileName: string): MangoHudSaveResult {
  const safe = safeBackupBasename(fileName)
  if (!safe.ok) return safe
  const configPath = resolveConfigPath()
  const src = path.join(backupsDir(configPath), safe.name)
  if (!fs.existsSync(src)) return { ok: false, error: 'Backup not found' }
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    ensureBaselineBackup(configPath)
    const tmpPath = `${configPath}.tmp`
    fs.copyFileSync(src, tmpPath)
    fs.renameSync(tmpPath, configPath)
    return { ok: true, configPath }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Restore failed' }
  }
}

export async function reloadMangoHudLive(): Promise<MangoHudReloadResult> {
  // Primary path: MangoHud is commonly injected into game processes rather than
  // running as a standalone "mangohud" process. Signal those PIDs directly.
  try {
    const pids = fs.readdirSync(PROC_DIR).filter((d) => /^\d+$/.test(d))
    let signaled = 0
    for (const pid of pids) {
      const mapsPath = path.join(PROC_DIR, pid, 'maps')
      let maps = ''
      try {
        maps = fs.readFileSync(mapsPath, 'utf-8')
      } catch {
        continue
      }
      if (/mangohud/i.test(maps)) {
        try {
          process.kill(Number(pid), 'SIGUSR1')
          signaled += 1
        } catch {
          // ignore non-owned/dead processes
        }
      }
    }
    if (signaled > 0) {
      return { ok: true, message: `Reload signal sent to ${signaled} MangoHud-attached process(es)` }
    }
  } catch {
    // fall through to legacy methods
  }

  // Fallback: legacy name-based matching.
  const candidates = [
    ['-USR1', '-x', 'mangohud'],
    ['-USR1', '-x', 'MangoHud'],
    ['-USR1', '-f', 'mangohud'],
    ['-USR1', '-f', 'MangoHud'],
  ]
  for (const args of candidates) {
    try {
      await execFileAsync('pkill', args)
      return { ok: true, message: 'Reload signal sent to MangoHud process' }
    } catch {
      // try next strategy
    }
  }
  return { ok: false, error: 'No running MangoHud process found to signal. Start a game with MangoHud first.' }
}

export function parseMangoHudRawText(rawText: string): MangoHudConfigDoc {
  return parseMangoHudConfigText(rawText)
}

export function listMangoHudProfiles(): MangoHudProfilesListResult {
  const store = readProfileStore()
  dedupeAssignments(store)
  const profiles = [...store.profiles].sort((a, b) => a.name.localeCompare(b.name))
  return {
    ok: true,
    profiles,
    assignments: store.assignments,
    applyMode: store.applyMode,
    defaultProfileId: store.defaultProfileId,
  }
}

export function saveMangoHudProfileSettings(payload: {
  applyMode: MangoHudProfileApplyMode
  defaultProfileId: string | null
}): MangoHudProfileSettingsSaveResult {
  const store = readProfileStore()
  dedupeAssignments(store)
  if (payload.defaultProfileId) {
    const exists = store.profiles.some((profile) => profile.id === payload.defaultProfileId)
    if (!exists) return { ok: false, error: 'Default profile not found' }
  }
  store.applyMode = payload.applyMode === 'auto-detect' ? 'auto-detect' : 'manual'
  store.defaultProfileId = payload.defaultProfileId ?? null
  writeProfileStore(store)
  return { ok: true }
}

export function saveMangoHudProfile(payload: {
  id?: string
  name: string
  entries: MangoHudConfigEntry[]
}): MangoHudProfileSaveResult {
  const store = readProfileStore()
  const trimmed = cleanProfileName(payload.name)
  if (!trimmed) return { ok: false, error: 'Profile name is required' }
  const duplicate = store.profiles.find(
    (profile) =>
      profile.name.toLowerCase() === trimmed.toLowerCase() &&
      (!payload.id || profile.id !== payload.id)
  )
  if (duplicate) return { ok: false, error: 'A profile with that name already exists' }
  const ts = now()
  const nextEntries = [...(payload.entries ?? [])]
  if (payload.id) {
    const idx = store.profiles.findIndex((p) => p.id === payload.id)
    if (idx < 0) return { ok: false, error: 'Profile not found' }
    const existing = store.profiles[idx]
    const next: MangoHudProfile = {
      ...existing,
      name: trimmed,
      entries: nextEntries,
      updatedAt: ts,
    }
    store.profiles[idx] = next
    writeProfileStore(store)
    return { ok: true, profile: next }
  }
  const created: MangoHudProfile = {
    id: makeProfileId(),
    name: trimmed,
    entries: nextEntries,
    createdAt: ts,
    updatedAt: ts,
  }
  store.profiles.push(created)
  writeProfileStore(store)
  return { ok: true, profile: created }
}

export function deleteMangoHudProfile(profileId: string): MangoHudProfileDeleteResult {
  const store = readProfileStore()
  const before = store.profiles.length
  store.profiles = store.profiles.filter((p) => p.id !== profileId)
  if (before === store.profiles.length) return { ok: false, error: 'Profile not found' }
  for (const appId of Object.keys(store.assignments)) {
    if (store.assignments[appId] === profileId) delete store.assignments[appId]
  }
  writeProfileStore(store)
  return { ok: true }
}

export function assignMangoHudProfile(appId: number, profileId: string | null): MangoHudProfileAssignResult {
  if (!Number.isInteger(appId) || appId <= 0) return { ok: false, error: 'Invalid app id' }
  const store = readProfileStore()
  const appKey = String(appId)
  if (!profileId) {
    delete store.assignments[appKey]
    writeProfileStore(store)
    return { ok: true }
  }
  const profile = store.profiles.find((p) => p.id === profileId)
  if (!profile) return { ok: false, error: 'Profile not found' }
  store.assignments[appKey] = profile.id
  writeProfileStore(store)
  return { ok: true }
}

export function resolveMangoHudProfileForApp(appId: number): MangoHudProfileResolveResult {
  if (!Number.isInteger(appId) || appId <= 0) return { ok: false, error: 'Invalid app id' }
  const store = readProfileStore()
  dedupeAssignments(store)
  if (store.applyMode === 'manual') {
    const manual = store.defaultProfileId ? store.profiles.find((p) => p.id === store.defaultProfileId) ?? null : null
    return manual ? { ok: true, profile: manual, source: 'manual' } : { ok: true, profile: null, source: 'none' }
  }
  const specificProfileId = store.assignments[String(appId)]
  if (specificProfileId) {
    const profile = store.profiles.find((p) => p.id === specificProfileId) ?? null
    if (profile) return { ok: true, profile, source: 'specific' }
  }
  if (store.defaultProfileId) {
    const fallback = store.profiles.find((p) => p.id === store.defaultProfileId) ?? null
    if (fallback) return { ok: true, profile: fallback, source: 'default' }
  }
  return { ok: true, profile: null, source: 'none' }
}

function formatRuntimeHudText(status: RunningFsrStatus, style: MangoHudRuntimeTextStyle): string {
  if (style === 'compact') {
    return status.fsrVersion ? `ST:${status.fsrVersion}` : `ST:${status.label}`
  }
  if (style === 'status-only') {
    return `SteamTools: ${status.label}`
  }
  if (style === 'fsr-only') {
    return status.fsrVersion
      ? `SteamTools: ${status.label} | FSR ${status.fsrVersion}`
      : `SteamTools: ${status.label}`
  }
  const parts = [
    status.fsrVersion ? `FSR ${status.fsrVersion}` : null,
    status.mlfiVersion ? `MLFI ${status.mlfiVersion}` : null,
    status.framegenVersion ? `FG ${status.framegenVersion}` : null,
  ].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? `SteamTools: ${status.label} | ${parts.join(' | ')}` : `SteamTools: ${status.label}`
}

export async function syncRuntimeFsrTextToMangoHud(
  status: RunningFsrStatus,
  style: MangoHudRuntimeTextStyle = 'full-stack'
): Promise<MangoHudReloadResult> {
  const current = readMangoHudConfig()
  if (!current.ok) return { ok: false, error: current.error }
  const doc = parseMangoHudConfigText(current.rawText)
  const managedKey = 'custom_text'
  const managedValue = formatRuntimeHudText(status, style)
  const next = [...doc.entries]
  const idx = next.findIndex((e) => e.key === managedKey)
  if (idx >= 0 && next[idx].value === managedValue) {
    return { ok: true, message: 'Runtime HUD text unchanged; skipped config write/reload' }
  }
  if (idx >= 0) next[idx] = { key: managedKey, value: managedValue }
  else next.push({ key: managedKey, value: managedValue })
  const saved = saveMangoHudConfig({ entries: next })
  if (!saved.ok) return { ok: false, error: saved.error }
  return reloadMangoHudLive()
}
