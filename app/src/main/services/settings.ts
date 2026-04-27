import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { AppSettings } from '../../shared/types'

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json')

const DEFAULTS: AppSettings = {
  steamPath: null,
  hubRoot: null,
  gameFilter: 'heuristic',
  autoUpdate: process.env.STEAMTOOLS_NO_AUTO_UPDATE !== '1',
  autoUpdateThrottleHours: parseFloat(process.env.STEAMTOOLS_AUTO_CHECK_INTERVAL_HOURS || '1'),
  theme: 'dark',
}

export function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8')
      return { ...DEFAULTS, ...JSON.parse(raw) }
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULTS }
}

export function saveSettings(settings: AppSettings): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
}
