import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { LEGACY_CACHYOS_LATEST_INTERNAL_TOOL_NAME, latestSlotInternalToolName } from '../../shared/compatToolsPure'

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json')

const DEFAULTS: AppSettings = {
  steamPath: null,
  hubRoot: null,
  gameFilter: 'heuristic',
  autoUpdate: process.env.STEAMTOOLS_NO_AUTO_UPDATE !== '1',
  autoUpdateThrottleHours: parseFloat(process.env.STEAMTOOLS_AUTO_CHECK_INTERVAL_HOURS || '1'),
  theme: 'dark',
  geProtonChannel: 'pinned',
  geProtonAutoUpdate: false,
  geProtonAutoUpdateInternalName: null,
  geProtonPinnedTag: null,
  protonCachyosChannel: 'pinned',
  protonCachyosAutoUpdate: false,
  protonCachyosAutoUpdateInternalName: null,
  protonCachyosPinnedTag: null,
  protonCachyosSlrOnly: true,
  protonCachyosArch: 'x86_64',
  compatToolsCheckThrottleHours: 24,
  compatToolsSilentAutoInstall: false,
  compatGeLastCheckEpoch: 0,
  compatGeLastRemoteTag: null,
  compatCachyosLastCheckEpoch: 0,
  compatCachyosLastRemoteTag: null,
}

/** Migrate pre-rolling/pinned `*Track` fields from older settings.json. */
function migrateRawSettings(raw: Record<string, unknown>): void {
  if (raw.geProtonTrack != null && raw.geProtonChannel == null) {
    const legacy = raw.geProtonTrack
    raw.geProtonChannel = legacy === 'latest' ? 'rolling' : 'pinned'
    raw.geProtonAutoUpdate = legacy === 'latest'
    delete raw.geProtonTrack
  }
  if (raw.protonCachyosTrack != null && raw.protonCachyosChannel == null) {
    const legacy = raw.protonCachyosTrack
    raw.protonCachyosChannel = legacy === 'latest' ? 'rolling' : 'pinned'
    raw.protonCachyosAutoUpdate = legacy === 'latest'
    delete raw.protonCachyosTrack
  }
  if (raw.geProtonChannel != null && raw.geProtonTrack != null) delete raw.geProtonTrack
  if (raw.protonCachyosChannel != null && raw.protonCachyosTrack != null) delete raw.protonCachyosTrack
}

function coerceCompatChannels(s: AppSettings): void {
  if (s.geProtonChannel !== 'rolling' && s.geProtonChannel !== 'pinned') s.geProtonChannel = 'pinned'
  if (s.protonCachyosChannel !== 'rolling' && s.protonCachyosChannel !== 'pinned') {
    s.protonCachyosChannel = 'pinned'
  }
}

/** Match ProtonPlus: auto-update binding used `proton_cachyos_steamtools_latest` before we aligned internal ids. */
function migrateProtonCachyosLatestInternalName(s: AppSettings): void {
  if (s.protonCachyosAutoUpdateInternalName === LEGACY_CACHYOS_LATEST_INTERNAL_TOOL_NAME) {
    s.protonCachyosAutoUpdateInternalName = latestSlotInternalToolName('proton_cachyos')
  }
}

/** Arch is auto-detected at install time; normalize legacy saved values. */
function coerceCachyosArch(s: AppSettings): void {
  const a = s.protonCachyosArch
  if (a !== 'x86_64' && a !== 'x86_64_v3' && a !== 'x86_64_v4') s.protonCachyosArch = 'x86_64'
}

export function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) as Record<string, unknown>
      migrateRawSettings(raw)
      const merged = { ...DEFAULTS, ...raw } as AppSettings
      coerceCompatChannels(merged)
      coerceCachyosArch(merged)
      migrateProtonCachyosLatestInternalName(merged)
      return merged
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULTS }
}

export function saveSettings(settings: AppSettings): void {
  const merged = { ...loadSettings(), ...settings } as AppSettings
  coerceCompatChannels(merged)
  coerceCachyosArch(merged)
  migrateProtonCachyosLatestInternalName(merged)
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8')
}
