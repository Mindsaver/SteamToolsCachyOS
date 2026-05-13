import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Save, ArchiveRestore, Plus, Trash2, WandSparkles } from 'lucide-react'
import { api } from '../lib/ipc'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Switch } from '../components/ui/switch'
import { Badge } from '../components/ui/badge'
import { parseMangoHudConfigText, mergeMangoHudEntry, serializeMangoHudEntries } from '../../shared/mangohudConfig'
import type {
  InstalledGame,
  MangoHudConfigEntry,
  MangoHudProfile,
  MangoHudProfileApplyMode,
  MangoHudProfilesListResult,
  MangoHudRuntimeTextStyle,
  RunningFsrStatus,
} from '../../shared/types'

type MangoHudProfilesListOk = Extract<MangoHudProfilesListResult, { ok: true }>

function profileResolutionSourceLabel(source: 'specific' | 'default' | 'manual' | 'none'): { short: string; title: string } {
  switch (source) {
    case 'specific':
      return { short: 'Per game', title: 'This game has its own linked profile.' }
    case 'default':
      return { short: 'Fallback', title: 'No per-game link; using the fallback profile.' }
    case 'manual':
      return { short: 'Fixed (all games)', title: 'Single-profile mode: every game uses the same profile.' }
    case 'none':
      return { short: 'None', title: 'No profile applies for this game in the current mode.' }
  }
}

type FieldType = 'boolean' | 'number' | 'string' | 'list' | 'color' | 'select'
type ListKind = 'color-list' | 'number-list' | 'string-list'
interface CatalogItem {
  key: string
  label: string
  section: string
  type: FieldType
  listKind?: ListKind
  pairWith?: string
  pairRole?: 'threshold' | 'color'
  options?: string[]
  min?: number
  max?: number
  step?: number
  help?: string
}

const MANGOHUD_AUTO_SYNC_KEY = 'mangohudAutoSyncEnabled'
const MANGOHUD_AUTO_SYNC_EVENT = 'mangohud-auto-sync-changed'
const MANGOHUD_TEXT_STYLE_KEY = 'mangohudRuntimeTextStyle'

const CATALOG: CatalogItem[] = [
  { section: 'General', key: 'legacy_layout', label: 'Legacy layout', type: 'boolean' },
  { section: 'General', key: 'gpu_list', label: 'GPU list', type: 'string' },
  { section: 'General', key: 'horizontal', label: 'Horizontal layout', type: 'boolean' },
  { section: 'General', key: 'horizontal_stretch', label: 'Horizontal stretch', type: 'number' },
  { section: 'General', key: 'hud_compact', label: 'Compact HUD', type: 'boolean' },
  { section: 'General', key: 'hud_no_margin', label: 'No margin', type: 'boolean' },
  { section: 'General', key: 'table_columns', label: 'Table columns', type: 'number' },
  {
    section: 'General',
    key: 'position',
    label: 'Overlay position',
    type: 'select',
    options: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center'],
  },
  { section: 'General', key: 'offset_x', label: 'Offset X', type: 'number' },
  { section: 'General', key: 'offset_y', label: 'Offset Y', type: 'number' },
  { section: 'General', key: 'round_corners', label: 'Round corners', type: 'number' },
  { section: 'General', key: 'alpha', label: 'Global alpha', type: 'number' },
  { section: 'General', key: 'background_alpha', label: 'Background alpha', type: 'number' },
  { section: 'General', key: 'background_color', label: 'Background color', type: 'color' },
  { section: 'General', key: 'font_file', label: 'Font file', type: 'string' },
  { section: 'General', key: 'font_size', label: 'Primary font size', type: 'number' },
  { section: 'General', key: 'font_size_text', label: 'Text font size', type: 'number' },
  { section: 'General', key: 'font_size_secondary', label: 'Secondary font size', type: 'number' },

  { section: 'Overlay', key: 'fps', label: 'Show FPS', type: 'boolean' },
  { section: 'Overlay', key: 'frametime', label: 'Show frame time', type: 'boolean' },
  { section: 'Overlay', key: 'frame_timing', label: 'Frame timing graph', type: 'boolean' },
  { section: 'Overlay', key: 'histogram', label: 'Histogram', type: 'boolean' },
  { section: 'Overlay', key: 'fps_only', label: 'FPS only', type: 'boolean' },
  { section: 'Overlay', key: 'fps_color_change', label: 'FPS color change', type: 'boolean' },
  {
    section: 'Overlay',
    key: 'fps_value',
    label: 'FPS thresholds',
    type: 'list',
    listKind: 'number-list',
    pairWith: 'fps_color',
    pairRole: 'threshold',
    help: 'Nth threshold uses Nth color.',
  },
  {
    section: 'Overlay',
    key: 'fps_color',
    label: 'FPS colors',
    type: 'list',
    listKind: 'color-list',
    pairWith: 'fps_value',
    pairRole: 'color',
  },
  { section: 'Overlay', key: 'frametime_color', label: 'Frame time color', type: 'color' },
  { section: 'Overlay', key: 'frame_count', label: 'Frame count', type: 'boolean' },
  { section: 'Overlay', key: 'toggle_hud', label: 'Toggle HUD hotkey', type: 'string' },
  { section: 'Overlay', key: 'toggle_hud_position', label: 'Toggle position hotkey', type: 'string' },
  { section: 'Overlay', key: 'toggle_fps_limit', label: 'Toggle FPS limit hotkey', type: 'string' },
  { section: 'Overlay', key: 'toggle_logging', label: 'Toggle logging hotkey', type: 'string' },
  { section: 'Overlay', key: 'reload_cfg', label: 'Reload config hotkey', type: 'string' },

  { section: 'GPU', key: 'gpu_stats', label: 'GPU stats', type: 'boolean' },
  { section: 'GPU', key: 'gpu_temp', label: 'GPU temperature', type: 'boolean' },
  { section: 'GPU', key: 'gpu_core_clock', label: 'GPU core clock', type: 'boolean' },
  { section: 'GPU', key: 'gpu_mem_clock', label: 'GPU memory clock', type: 'boolean' },
  { section: 'GPU', key: 'gpu_power', label: 'GPU power', type: 'boolean' },
  { section: 'GPU', key: 'gpu_name', label: 'GPU name', type: 'boolean' },
  { section: 'GPU', key: 'gpu_junction_temp', label: 'GPU junction temp', type: 'boolean' },
  { section: 'GPU', key: 'gpu_fan', label: 'GPU fan', type: 'boolean' },
  {
    section: 'GPU',
    key: 'gpu_load_value',
    label: 'GPU load thresholds',
    type: 'list',
    listKind: 'number-list',
    pairWith: 'gpu_load_color',
    pairRole: 'threshold',
    help: 'Nth threshold uses Nth color.',
  },
  {
    section: 'GPU',
    key: 'gpu_load_color',
    label: 'GPU load colors',
    type: 'list',
    listKind: 'color-list',
    pairWith: 'gpu_load_value',
    pairRole: 'color',
  },
  { section: 'GPU', key: 'gpu_text', label: 'GPU label', type: 'string' },
  { section: 'GPU', key: 'gpu_color', label: 'GPU label color', type: 'color' },

  { section: 'CPU', key: 'cpu_stats', label: 'CPU stats', type: 'boolean' },
  { section: 'CPU', key: 'cpu_temp', label: 'CPU temperature', type: 'boolean' },
  { section: 'CPU', key: 'cpu_power', label: 'CPU power', type: 'boolean' },
  { section: 'CPU', key: 'cpu_mhz', label: 'CPU MHz', type: 'boolean' },
  { section: 'CPU', key: 'cpu_load_change', label: 'CPU load change', type: 'boolean' },
  { section: 'CPU', key: 'core_load', label: 'Per-core load', type: 'boolean' },
  { section: 'CPU', key: 'core_bars', label: 'Core bars', type: 'boolean' },
  {
    section: 'CPU',
    key: 'cpu_load_value',
    label: 'CPU load thresholds',
    type: 'list',
    listKind: 'number-list',
    pairWith: 'cpu_load_color',
    pairRole: 'threshold',
    help: 'Nth threshold uses Nth color.',
  },
  {
    section: 'CPU',
    key: 'cpu_load_color',
    label: 'CPU load colors',
    type: 'list',
    listKind: 'color-list',
    pairWith: 'cpu_load_value',
    pairRole: 'color',
  },
  { section: 'CPU', key: 'cpu_text', label: 'CPU label', type: 'string' },
  { section: 'CPU', key: 'cpu_color', label: 'CPU label color', type: 'color' },

  { section: 'Memory', key: 'ram', label: 'RAM usage', type: 'boolean' },
  { section: 'Memory', key: 'vram', label: 'VRAM usage', type: 'boolean' },
  { section: 'Memory', key: 'swap', label: 'Swap usage', type: 'boolean' },
  { section: 'Memory', key: 'ram_color', label: 'RAM color', type: 'color' },
  { section: 'Memory', key: 'vram_color', label: 'VRAM color', type: 'color' },
  { section: 'Memory', key: 'wine_color', label: 'Wine color', type: 'color' },

  { section: 'Frames', key: 'fps_limit', label: 'FPS limit', type: 'list', listKind: 'number-list' },
  {
    section: 'Frames',
    key: 'fps_limit_method',
    label: 'FPS limit method',
    type: 'select',
    options: ['early', 'late', 'fifo', 'mailbox'],
  },
  { section: 'Frames', key: 'fps_sampling_period', label: 'FPS sampling period', type: 'number' },
  { section: 'Frames', key: 'vsync', label: 'Vsync', type: 'boolean' },
  { section: 'Frames', key: 'gl_vsync', label: 'OpenGL vsync', type: 'number' },

  { section: 'Style', key: 'background_alpha', label: 'Background alpha', type: 'number' },
  { section: 'Style', key: 'text_color', label: 'Text color', type: 'color' },
  { section: 'Style', key: 'engine_color', label: 'Engine color', type: 'color' },
  { section: 'Style', key: 'media_player_color', label: 'Media player color', type: 'color' },
  { section: 'Style', key: 'network_color', label: 'Network color', type: 'color' },
  { section: 'Style', key: 'battery_color', label: 'Battery color', type: 'color' },
  { section: 'Style', key: 'horizontal_separator_color', label: 'Separator color', type: 'color' },
  { section: 'Style', key: 'gpu_color', label: 'GPU color', type: 'color' },
  { section: 'Style', key: 'cpu_color', label: 'CPU color', type: 'color' },
  { section: 'Style', key: 'io_color', label: 'IO color', type: 'color' },

  { section: 'System', key: 'io_stats', label: 'IO stats', type: 'boolean' },
  { section: 'System', key: 'network', label: 'Network stats', type: 'boolean' },
  { section: 'System', key: 'battery', label: 'Battery', type: 'boolean' },
  { section: 'System', key: 'time', label: 'Clock time', type: 'boolean' },
  { section: 'System', key: 'arch', label: 'Architecture', type: 'boolean' },
  { section: 'System', key: 'wine', label: 'Wine version', type: 'boolean' },
  { section: 'System', key: 'engine_short_names', label: 'Short engine names', type: 'boolean' },
  { section: 'System', key: 'media_player', label: 'Media player integration', type: 'boolean' },
  { section: 'System', key: 'media_player_name', label: 'Media player name', type: 'string' },
  { section: 'System', key: 'media_player_format', label: 'Media player format', type: 'string' },
  { section: 'System', key: 'exec_name', label: 'Executable name', type: 'boolean' },
  { section: 'System', key: 'gamemode', label: 'Gamemode status', type: 'boolean' },

  { section: 'Advanced', key: 'log_duration', label: 'Log duration', type: 'number' },
  { section: 'Advanced', key: 'autostart_log', label: 'Autostart logging', type: 'number' },
  { section: 'Advanced', key: 'log_interval', label: 'Log interval', type: 'number' },
  { section: 'Advanced', key: 'output_folder', label: 'Log output folder', type: 'string' },
  { section: 'Advanced', key: 'pci_dev', label: 'PCI device index', type: 'number' },
  { section: 'Advanced', key: 'debug', label: 'Debug mode', type: 'boolean' },
  { section: 'Advanced', key: 'benchmark', label: 'Benchmark mode', type: 'boolean' },
  { section: 'Advanced', key: 'benchmark_percentiles', label: 'Benchmark percentiles', type: 'string' },
  { section: 'Advanced', key: 'blacklist', label: 'Blacklist', type: 'string' },
]

function groupedCatalog() {
  const map = new Map<string, CatalogItem[]>()
  for (const item of CATALOG) {
    const list = map.get(item.section) ?? []
    list.push(item)
    map.set(item.section, list)
  }
  return [...map.entries()]
}

function normalizeEntryValue(type: FieldType, value: string): string {
  if (type === 'boolean') return value === '0' ? '0' : '1'
  if (type === 'number') return value.replace(/[^\d.-]/g, '')
  if (type === 'color') {
    const cleaned = value.trim().replace(/^#/, '').replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
    return cleaned
  }
  return value
}

function toColorHex(value: string): string {
  const cleaned = normalizeEntryValue('color', value)
  if (cleaned.length === 3 || cleaned.length === 6) return `#${cleaned}`
  return '#ffffff'
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function joinCsv(values: string[]): string {
  return values
    .map((v) => v.trim())
    .filter(Boolean)
    .join(',')
}

function normalizeNumberToken(value: string): string {
  return value.replace(/[^\d.-]/g, '')
}

export function MangoHudLive() {
  const [entries, setEntries] = useState<MangoHudConfigEntry[]>([])
  const [rawText, setRawText] = useState('')
  const [games, setGames] = useState<InstalledGame[]>([])
  const [statusText, setStatusText] = useState('Checking status…')
  const [configPath, setConfigPath] = useState('')
  const [backups, setBackups] = useState<Array<{ fileName: string; mtimeMs: number }>>([])
  const [selectedBackup, setSelectedBackup] = useState('')
  const [backupName, setBackupName] = useState('')
  const [profiles, setProfiles] = useState<MangoHudProfile[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [profileApplyMode, setProfileApplyMode] = useState<MangoHudProfileApplyMode>('manual')
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [profileNameInput, setProfileNameInput] = useState('')
  const [quickAppId, setQuickAppId] = useState('')
  const [profilesExpanded, setProfilesExpanded] = useState(false)
  const [createSuccess, setCreateSuccess] = useState<{ profileId: string; appId: number } | null>(null)
  const syncingFromRawRef = useRef(false)
  const [runtimeFsr, setRuntimeFsr] = useState<RunningFsrStatus | null>(null)
  const [autoRefreshRuntime, setAutoRefreshRuntime] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(MANGOHUD_AUTO_SYNC_KEY) === '1'
    } catch {
      return false
    }
  })
  const [runtimeTextStyle, setRuntimeTextStyle] = useState<MangoHudRuntimeTextStyle>(() => {
    try {
      const saved = window.localStorage.getItem(MANGOHUD_TEXT_STYLE_KEY) as MangoHudRuntimeTextStyle | null
      return saved ?? 'full-stack'
    } catch {
      return 'full-stack'
    }
  })

  const refreshRuntime = async () => {
    const s = await api.getRunningFsrStatus()
    setRuntimeFsr(s)
  }

  const listProfiles = async (): Promise<MangoHudProfilesListOk | null> => {
    const result = await api.listMangoHudProfiles()
    if (!result.ok) {
      toast.error(result.error)
      return null
    }
    setProfiles(result.profiles)
    setAssignments(result.assignments)
    setProfileApplyMode(result.applyMode)
    setDefaultProfileId(result.defaultProfileId)
    setSelectedProfileId((prev) => {
      if (result.applyMode === 'manual') {
        if (result.defaultProfileId && result.profiles.some((p) => p.id === result.defaultProfileId)) {
          return result.defaultProfileId
        }
        return ''
      }
      if (prev && result.profiles.some((profile) => profile.id === prev)) return prev
      return result.profiles[0]?.id ?? ''
    })
    return result
  }

  const saveThenReload = async (payload: {
    rawText?: string
    entries?: MangoHudConfigEntry[]
    makeNamedBackup?: string | null
  }) => {
    const save = await api.saveMangoHudConfig(payload)
    if (!save.ok) {
      toast.error(save.error)
      return
    }

    const reload = await api.reloadMangoHud()
    if (reload.ok) {
      toast.success('Saved and reloaded MangoHud live')
    } else {
      toast.message('Saved config. Reload manually in-game with Shift_L+F4', {
        description: reload.error,
      })
    }
  }

  const loadAll = async () => {
    const [status, cfg, b, listedGames] = await Promise.all([
      api.getMangoHudStatus(),
      api.getMangoHudConfig(),
      api.listMangoHudBackups(),
      api.listGames(),
    ])
    setStatusText(
      status.configExists
        ? `Active config found (${status.baselineBackupExists ? 'backup ready' : 'no baseline backup yet'})`
        : 'No MangoHud.conf yet (will be created on save)'
    )
    setConfigPath(status.configPath)
    if (cfg.ok) {
      setRawText(cfg.rawText)
      setEntries(cfg.entries)
    } else {
      toast.error(cfg.error)
    }
    if (b.ok) setBackups(b.entries)
    setGames(listedGames)
  }

  useEffect(() => {
    void loadAll()
    void refreshRuntime()
    void listProfiles()
  }, [])

  useEffect(() => {
    if (runtimeFsr?.detectedAppId && !quickAppId) {
      setQuickAppId(String(runtimeFsr.detectedAppId))
    }
  }, [runtimeFsr?.detectedAppId, quickAppId])

  useEffect(() => {
    if (!autoRefreshRuntime) return
    const t = setInterval(() => {
      void refreshRuntime()
    }, 5000)
    return () => clearInterval(t)
  }, [autoRefreshRuntime])

  const toggleAutoSync = () => {
    setAutoRefreshRuntime((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(MANGOHUD_AUTO_SYNC_KEY, next ? '1' : '0')
      } catch {
        // ignore storage failures
      }
      window.dispatchEvent(new Event(MANGOHUD_AUTO_SYNC_EVENT))
      return next
    })
  }

  const setKey = (item: CatalogItem, nextValue: string) => {
    const value = normalizeEntryValue(item.type, nextValue)
    setEntries((prev) => mergeMangoHudEntry(prev, item.key, value))
  }

  useEffect(() => {
    if (syncingFromRawRef.current) {
      syncingFromRawRef.current = false
      return
    }
    const nextRaw = serializeMangoHudEntries(entries)
    if (nextRaw !== rawText) setRawText(nextRaw)
  }, [entries, rawText])

  const getWarning = (item: CatalogItem, value: string): string | null => {
    if (!value) return null
    if (item.type === 'number') {
      const n = Number(value)
      if (!Number.isFinite(n)) return 'Invalid number'
      if (typeof item.min === 'number' && n < item.min) return `Must be >= ${item.min}`
      if (typeof item.max === 'number' && n > item.max) return `Must be <= ${item.max}`
    }
    if (item.type === 'color') {
      const v = normalizeEntryValue('color', value)
      if (!(v.length === 3 || v.length === 6)) return 'Use 3 or 6 digit hex color'
    }
    return null
  }

  const entryMap = useMemo(() => new Map(entries.map((e) => [e.key, e.value])), [entries])
  const catalogByKey = useMemo(() => new Map(CATALOG.map((item) => [item.key, item])), [])
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  )
  const sortedGames = useMemo(() => [...games].sort((a, b) => a.name.localeCompare(b.name)), [games])
  const appIdNumber = Number(quickAppId)
  const appIdValid = Number.isInteger(appIdNumber) && appIdNumber > 0
  const assignedProfileId = appIdValid ? assignments[String(appIdNumber)] ?? '' : ''
  const assignedProfileName = profiles.find((profile) => profile.id === assignedProfileId)?.name ?? null
  const defaultProfileName = defaultProfileId
    ? profiles.find((profile) => profile.id === defaultProfileId)?.name ?? null
    : null

  const suggestUniqueProfileName = (baseName: string): string => {
    const base = baseName.trim() || 'New profile'
    const names = new Set(profiles.map((profile) => profile.name.toLowerCase()))
    if (!names.has(base.toLowerCase())) return base
    let idx = 2
    let candidate = `${base} (${idx})`
    while (names.has(candidate.toLowerCase())) {
      idx += 1
      candidate = `${base} (${idx})`
    }
    return candidate
  }

  const applyProfile = (profile: MangoHudProfile) => {
    setEntries(profile.entries)
    setRawText(serializeMangoHudEntries(profile.entries))
    setSelectedProfileId(profile.id)
    setProfileNameInput(profile.name)
  }

  const createProfile = async (payload: { name: string; source: MangoHudConfigEntry[] }) => {
    const suggested = suggestUniqueProfileName(payload.name)
    const saved = await api.saveMangoHudProfile({
      name: suggested,
      entries: payload.source,
    })
    if (!saved.ok) {
      toast.error(saved.error)
      return null
    }
    await listProfiles()
    setSelectedProfileId(saved.profile.id)
    setProfileNameInput(saved.profile.name)
    return saved.profile
  }

  const handleSaveProfileFromCurrent = async () => {
    if (!selectedProfile) {
      toast.error('Select a profile first')
      return
    }
    const save = await api.saveMangoHudProfile({
      id: selectedProfile.id,
      name: profileNameInput.trim() || selectedProfile.name,
      entries,
    })
    if (!save.ok) return toast.error(save.error)
    toast.success('Profile saved from current structured settings')
    await listProfiles()
  }

  const handleRenameProfile = async () => {
    if (!selectedProfile) {
      toast.error('Select a profile first')
      return
    }
    const name = profileNameInput.trim()
    if (!name) {
      toast.error('Profile name is required')
      return
    }
    const save = await api.saveMangoHudProfile({
      id: selectedProfile.id,
      name,
      entries: selectedProfile.entries,
    })
    if (!save.ok) return toast.error(save.error)
    toast.success('Profile renamed')
    await listProfiles()
  }

  const handleDeleteProfile = async () => {
    if (!selectedProfile) {
      toast.error('Select a profile first')
      return
    }
    const confirmed = window.confirm(
      `Delete profile "${selectedProfile.name}"? Assigned games will be unassigned.`
    )
    if (!confirmed) return
    const result = await api.deleteMangoHudProfile(selectedProfile.id)
    if (!result.ok) return toast.error(result.error)
    toast.success('Profile deleted')
    setProfileNameInput('')
    await listProfiles()
  }

  const handleAssignProfile = async (profileId: string | null) => {
    if (!appIdValid) {
      toast.error('Enter a valid AppID first')
      return
    }
    const result = await api.assignMangoHudProfile({ appId: appIdNumber, profileId })
    if (!result.ok) return toast.error(result.error)
    toast.success(profileId ? 'Profile assigned to game' : 'Profile unassigned from game')
    await listProfiles()
  }

  const handleSaveProfileSettings = async (
    nextMode: MangoHudProfileApplyMode,
    nextDefaultProfileId: string | null
  ): Promise<MangoHudProfilesListOk | null> => {
    const result = await api.saveMangoHudProfileSettings({
      applyMode: nextMode,
      defaultProfileId: nextDefaultProfileId,
    })
    if (!result.ok) {
      toast.error(result.error)
      return null
    }
    return listProfiles()
  }

  const handleModeChange = async (nextMode: MangoHudProfileApplyMode) => {
    const listed = await handleSaveProfileSettings(nextMode, defaultProfileId)
    if (!listed) return
    toast.success(
      nextMode === 'manual' ? 'Using one profile for all games' : 'Using per-game links with fallback'
    )
    if (nextMode === 'manual' && listed.defaultProfileId) {
      const p = listed.profiles.find((x) => x.id === listed.defaultProfileId)
      if (p) applyProfile(p)
    }
  }

  const handleDefaultProfileChange = async (nextDefaultProfileId: string | null) => {
    const modeBefore = profileApplyMode
    const listed = await handleSaveProfileSettings(profileApplyMode, nextDefaultProfileId)
    if (!listed) return
    toast.success(
      modeBefore === 'manual'
        ? nextDefaultProfileId
          ? 'Profile in use updated'
          : 'Cleared profile in use'
        : nextDefaultProfileId
          ? 'Fallback profile updated'
          : 'Fallback cleared'
    )
    if (modeBefore === 'manual' && nextDefaultProfileId) {
      const p = listed.profiles.find((x) => x.id === nextDefaultProfileId)
      if (p) applyProfile(p)
    }
  }

  const handleAutoAssignDetected = async () => {
    if (!selectedProfileId) {
      toast.error('Select a profile first')
      return
    }
    const detectedAppId = runtimeFsr?.detectedAppId
    if (!detectedAppId) {
      toast.error('No detected AppID available')
      return
    }
    const result = await api.assignMangoHudProfile({ appId: detectedAppId, profileId: selectedProfileId })
    if (!result.ok) return toast.error(result.error)
    toast.success(`Assigned profile to detected AppID ${detectedAppId}`)
    setQuickAppId(String(detectedAppId))
    await listProfiles()
  }

  const handleQuickCreateForGame = async () => {
    if (!appIdValid) {
      toast.error('Enter a valid AppID first')
      return
    }
    const gameLabel = sortedGames.find((game) => game.appId === appIdNumber)?.name ?? `App ${appIdNumber}`
    const customName = profileNameInput.trim()
    const baseName = customName ? `${gameLabel} - ${customName}` : `${gameLabel} - Profile`
    const profile = await createProfile({ name: baseName, source: entries })
    if (!profile) return
    const assigned = await api.assignMangoHudProfile({ appId: appIdNumber, profileId: profile.id })
    if (!assigned.ok) return toast.error(assigned.error)
    setCreateSuccess({ profileId: profile.id, appId: appIdNumber })
    toast.success('Profile created and assigned')
    if (profileApplyMode === 'manual') {
      const listed = await handleSaveProfileSettings('manual', profile.id)
      if (listed?.defaultProfileId) {
        const p = listed.profiles.find((x) => x.id === listed.defaultProfileId)
        if (p) applyProfile(p)
      }
    } else {
      await listProfiles()
    }
  }

  useEffect(() => {
    if (selectedProfile && !profileNameInput.trim()) {
      setProfileNameInput(selectedProfile.name)
    }
  }, [selectedProfile, profileNameInput])

  const mappingRows = useMemo(() => {
    return sortedGames.map((game) => {
      const specificId = assignments[String(game.appId)] ?? null
      const specificProfile = specificId ? profiles.find((profile) => profile.id === specificId) ?? null : null
      let resolved: MangoHudProfile | null = null
      let source: 'specific' | 'default' | 'manual' | 'none' = 'none'
      if (profileApplyMode === 'manual') {
        resolved = defaultProfileId ? profiles.find((profile) => profile.id === defaultProfileId) ?? null : null
        source = resolved ? 'manual' : 'none'
      } else {
        if (specificProfile) {
          resolved = specificProfile
          source = 'specific'
        } else if (defaultProfileId) {
          resolved = profiles.find((profile) => profile.id === defaultProfileId) ?? null
          source = resolved ? 'default' : 'none'
        }
      }
      return {
        appId: game.appId,
        gameName: game.name,
        specificProfileName: specificProfile?.name ?? '—',
        resolvedProfileName: resolved?.name ?? '—',
        source,
      }
    })
  }, [assignments, defaultProfileId, profileApplyMode, profiles, sortedGames])

  const setListTokens = (item: CatalogItem, tokens: string[]) => {
    const normalized = tokens.map((token) => {
      if (item.listKind === 'color-list') return normalizeEntryValue('color', token)
      if (item.listKind === 'number-list') return normalizeNumberToken(token)
      return token.trim()
    })
    setKey(item, joinCsv(normalized))
  }

  const renderNumberListField = (item: CatalogItem, value: string) => {
    const tokens = splitCsv(value)
    return (
      <div className="space-y-1">
        {tokens.map((token, idx) => (
          <div key={`${item.key}-${idx}`} className="flex gap-2">
            <Input
              type="number"
              value={token}
              onChange={(e) => {
                const next = [...tokens]
                next[idx] = normalizeNumberToken(e.target.value)
                setListTokens(item, next)
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = tokens.filter((_, i) => i !== idx)
                setListTokens(item, next)
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setListTokens(item, [...tokens, item.listKind === 'number-list' ? '0' : ''])}
        >
          Add value
        </Button>
      </div>
    )
  }

  const renderColorListField = (item: CatalogItem, value: string) => {
    const tokens = splitCsv(value)
    return (
      <div className="space-y-1">
        {tokens.map((token, idx) => {
          const normalized = normalizeEntryValue('color', token)
          const valid = normalized.length === 3 || normalized.length === 6
          return (
            <div key={`${item.key}-${idx}`} className="flex gap-2 items-center">
              <Input
                type="color"
                className="h-9 w-12 p-1"
                value={toColorHex(token)}
                onChange={(e) => {
                  const next = [...tokens]
                  next[idx] = normalizeEntryValue('color', e.target.value)
                  setListTokens(item, next)
                }}
              />
              <Input
                value={token}
                onChange={(e) => {
                  const next = [...tokens]
                  next[idx] = e.target.value
                  setListTokens(item, next)
                }}
                placeholder="RRGGBB"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const next = tokens.filter((_, i) => i !== idx)
                  setListTokens(item, next)
                }}
              >
                Remove
              </Button>
              {!valid && <span className="text-[11px] text-amber-600">Invalid hex</span>}
            </div>
          )
        })}
        <Button size="sm" variant="outline" onClick={() => setListTokens(item, [...tokens, 'ffffff'])}>
          Add color
        </Button>
      </div>
    )
  }

  const renderPairedThresholdColorField = (thresholdItem: CatalogItem, thresholdValue: string) => {
    const colorKey = thresholdItem.pairWith
    if (!colorKey) return null
    const colorItem = catalogByKey.get(colorKey)
    if (!colorItem) return null
    const colorValue = entryMap.get(colorKey) ?? ''
    const thresholds = splitCsv(thresholdValue)
    const colors = splitCsv(colorValue)
    const rows = Math.max(thresholds.length, Math.min(colors.length, thresholds.length + 1))
    const hasFallback = colors.length === thresholds.length + 1
    const mismatch = !(colors.length === thresholds.length || hasFallback)

    return (
      <div className="space-y-2 rounded border border-border/60 p-2">
        <div>
          <p className="text-xs text-muted-foreground">{thresholdItem.label}</p>
          <p className="text-[11px] text-muted-foreground">Nth threshold uses Nth color.</p>
          {mismatch && (
            <p className="text-[11px] text-amber-600">
              Threshold/color count mismatch. Recommended: same count, or one extra color as fallback.
            </p>
          )}
        </div>
        {Array.from({ length: rows }).map((_, idx) => {
          const isFallbackRow = hasFallback && idx === thresholds.length
          const thresholdToken = thresholds[idx] ?? ''
          const colorToken = colors[idx] ?? ''
          const colorNorm = normalizeEntryValue('color', colorToken)
          const colorValid = colorNorm.length === 3 || colorNorm.length === 6
          return (
            <div
              key={`${thresholdItem.key}-row-${idx}`}
              className="grid grid-cols-1 md:grid-cols-[120px_1fr_40px_1fr_auto] gap-2 items-center"
            >
              <span className="text-[11px] text-muted-foreground">{isFallbackRow ? 'Fallback' : `#${idx + 1}`}</span>
              {isFallbackRow ? (
                <span className="text-xs text-muted-foreground">else</span>
              ) : (
                <Input
                  type="number"
                  value={thresholdToken}
                  onChange={(e) => {
                    const next = [...thresholds]
                    next[idx] = normalizeNumberToken(e.target.value)
                    setListTokens(thresholdItem, next)
                  }}
                />
              )}
              <span className="text-xs text-muted-foreground">→</span>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-9 w-12 p-1"
                  value={toColorHex(colorToken)}
                  onChange={(e) => {
                    const next = [...colors]
                    next[idx] = normalizeEntryValue('color', e.target.value)
                    setListTokens(colorItem, next)
                  }}
                />
                <Input
                  value={colorToken}
                  onChange={(e) => {
                    const next = [...colors]
                    next[idx] = e.target.value
                    setListTokens(colorItem, next)
                  }}
                  placeholder="RRGGBB"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const nextColors = colors.filter((_, i) => i !== idx)
                  setListTokens(colorItem, nextColors)
                  if (!isFallbackRow) {
                    const nextThresholds = thresholds.filter((_, i) => i !== idx)
                    setListTokens(thresholdItem, nextThresholds)
                  }
                }}
              >
                Remove
              </Button>
              {!colorValid && <p className="col-span-5 text-[11px] text-amber-600">Row color is not a valid hex token.</p>}
            </div>
          )
        })}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setListTokens(thresholdItem, [...thresholds, '0'])
              setListTokens(colorItem, [...colors, 'ffffff'])
            }}
          >
            Add threshold row
          </Button>
          <Button size="sm" variant="outline" onClick={() => setListTokens(colorItem, [...colors, 'ffffff'])}>
            Add fallback color
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col p-4 gap-3 overflow-y-auto bg-muted/20">
      <Card className="sticky top-0 z-20 border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-lg">MangoHud Live Config</CardTitle>
            <Badge variant="secondary">Catalog editor</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{statusText}</p>
          <p className="text-xs font-mono text-muted-foreground break-all">{configPath}</p>
          <div className="rounded-lg border border-border/70 bg-background p-2.5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Save controls</p>
            <div className="flex gap-2 flex-wrap items-center">
              <Button size="sm" variant="outline" onClick={() => void loadAll()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  void saveThenReload({ entries, makeNamedBackup: backupName.trim() || null })
                    .then(() => loadAll())
                }
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Save structured
              </Button>
              <Input
                className="h-8 w-56"
                value={backupName}
                onChange={(e) => setBackupName(e.target.value)}
                placeholder="Optional backup name"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Profiles</p>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setProfilesExpanded((v) => !v)}
              >
                {profilesExpanded ? 'Hide advanced' : 'Expand'}
              </button>
            </div>
            {!profilesExpanded ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Expand to manage the profile library, per-game assignments, detection shortcuts, and the mapping table.
              </p>
            ) : null}
            {profilesExpanded ? (
              <div className="space-y-3 pt-0.5">
                <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                  <label className="text-xs font-medium text-muted-foreground">How games get a profile</label>
                  <Select
                    value={profileApplyMode}
                    onChange={(e) => void handleModeChange(e.target.value as MangoHudProfileApplyMode)}
                  >
                    <option value="manual">Use one profile for all games</option>
                    <option value="auto-detect">Use per-game assignments + fallback</option>
                  </Select>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {profileApplyMode === 'manual'
                      ? 'Per-game links are stored but ignored for resolution. Everyone uses the profile you pick below.'
                      : 'Each game can link to a profile. If a game has no link, the fallback profile is used.'}
                  </p>
                </div>

                {profileApplyMode === 'manual' ? (
                  <div className="space-y-1.5 rounded-lg border border-border/60 p-2.5">
                    <label className="text-xs font-medium text-muted-foreground">Profile in use</label>
                    <Select
                      value={defaultProfileId ?? ''}
                      onChange={(e) => void handleDefaultProfileChange(e.target.value || null)}
                    >
                      <option value="">None…</option>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </Select>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      This profile is loaded into the editor and used as the single active profile for all games.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5 rounded-lg border border-border/60 p-2.5">
                      <label className="text-xs font-medium text-muted-foreground">Fallback profile</label>
                      <Select
                        value={defaultProfileId ?? ''}
                        onChange={(e) => void handleDefaultProfileChange(e.target.value || null)}
                      >
                        <option value="">No fallback…</option>
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </Select>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Used when a game has no linked profile.
                      </p>
                    </div>
                    <div className="space-y-1.5 rounded-lg border border-border/60 p-2.5">
                      <label className="text-xs font-medium text-muted-foreground">Profile open for editing</label>
                      <Select
                        value={selectedProfileId}
                        onChange={(e) => {
                          const nextId = e.target.value
                          setSelectedProfileId(nextId)
                          const selected = profiles.find((profile) => profile.id === nextId)
                          setProfileNameInput(selected?.name ?? '')
                        }}
                      >
                        <option value="">Select profile…</option>
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </Select>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Changing the fallback does not switch the catalog. Choose a profile here, then use Apply now to load it into the editor.
                      </p>
                    </div>
                  </>
                )}

                <div className="space-y-1.5 rounded-lg border border-border/60 p-2.5">
                  <label className="text-xs font-medium text-muted-foreground">Focus game</label>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Pick the game for linking, unassigning, or creating a profile. Runtime detection can fill AppID when a game is running.
                  </p>
                  <div className="flex flex-wrap gap-2 items-end">
                    <Select value={quickAppId} onChange={(e) => setQuickAppId(e.target.value)} className="min-w-[220px]">
                      <option value="">Choose from library…</option>
                      {sortedGames.map((game) => (
                        <option key={game.appId} value={String(game.appId)}>
                          {game.name} ({game.appId})
                        </option>
                      ))}
                    </Select>
                    <Input
                      className="h-9 w-28"
                      value={quickAppId}
                      onChange={(e) => setQuickAppId(e.target.value)}
                      placeholder="AppID"
                      inputMode="numeric"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleAutoAssignDetected()}
                      disabled={profileApplyMode !== 'auto-detect' || !selectedProfileId || !runtimeFsr?.detectedAppId}
                    >
                      <WandSparkles className="h-3.5 w-3.5 mr-1" />
                      Assign editing profile to detected game
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center pt-0.5">
                    {runtimeFsr?.detectedAppId ? (
                      <Badge variant="outline">Detected AppID {runtimeFsr.detectedAppId}</Badge>
                    ) : null}
                    {profileApplyMode === 'manual' ? (
                      <Badge variant="outline">All games: {defaultProfileName ?? '—'}</Badge>
                    ) : (
                      <Badge variant="outline">Fallback: {defaultProfileName ?? '—'}</Badge>
                    )}
                    {appIdValid ? (
                      <Badge variant="outline">Focused game link: {assignedProfileName ?? '—'}</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-2">
                  <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
                    <p className="text-xs font-medium text-muted-foreground">Link profile to focused game</p>
                    <div className="flex gap-2 flex-wrap items-center">
                      <Button size="sm" variant="outline" onClick={() => selectedProfile && applyProfile(selectedProfile)} disabled={!selectedProfile}>
                        Apply now
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleAssignProfile(selectedProfileId || null)}
                        disabled={!selectedProfileId || !appIdValid}
                      >
                        Link current profile
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleAssignProfile(null)} disabled={!appIdValid || !assignedProfileId}>
                        Unassign focused game
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {profileApplyMode === 'manual'
                        ? 'Links are saved but ignored while “one profile for all games” is on. Uses the profile in use.'
                        : 'Links the profile under “Profile open for editing” to the focused game.'}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Input
                        className="h-8 w-56"
                        value={profileNameInput}
                        onChange={(e) => setProfileNameInput(e.target.value)}
                        placeholder="Profile name"
                      />
                      <Button size="sm" variant="outline" onClick={() => void handleRenameProfile()} disabled={!selectedProfile}>
                        Rename
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleSaveProfileFromCurrent()} disabled={!selectedProfile}>
                        Save current to profile
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleDeleteProfile()} disabled={!selectedProfile}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
                    <p className="text-xs font-medium text-muted-foreground">Create profile for focused game</p>
                    <Input
                      value={profileNameInput}
                      onChange={(e) => setProfileNameInput(e.target.value)}
                      placeholder={appIdValid ? 'Profile suffix (game name auto-added)' : 'Profile suffix'}
                    />
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" onClick={() => void handleQuickCreateForGame()} disabled={!appIdValid}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Create + assign
                      </Button>
                    </div>
                    {createSuccess ? (
                      <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">
                        <p className="font-medium">Profile created and assigned.</p>
                        <div className="mt-1 flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const p = profiles.find((x) => x.id === createSuccess.profileId)
                              if (p) applyProfile(p)
                            }}
                          >
                            Apply now
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setCreateSuccess(null)}>
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <Card className="border-border/70 bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Which profile each game uses
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="max-h-64 overflow-auto rounded border border-border/60">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30 sticky top-0">
                          <tr>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Game</th>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Linked profile</th>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Resulting profile</th>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Why</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mappingRows.map((row) => {
                            const src = profileResolutionSourceLabel(row.source)
                            return (
                              <tr key={row.appId} className="border-t border-border/40">
                                <td className="px-2 py-1.5">
                                  <div className="font-medium">{row.gameName}</div>
                                  <div className="text-muted-foreground">AppID {row.appId}</div>
                                </td>
                                <td className="px-2 py-1.5">{row.specificProfileName}</td>
                                <td className="px-2 py-1.5">{row.resolvedProfileName}</td>
                                <td className="px-2 py-1.5">
                                  <Badge variant="outline" title={src.title}>
                                    {src.short}
                                  </Badge>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Full MangoHud Catalog</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Card className="border-border/70 bg-background">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Runtime and FSR</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="rounded border border-border/60 bg-muted/30 px-2.5 py-2 text-xs space-y-1">
                  <p className="font-medium">Runtime FSR: {runtimeFsr?.label ?? 'Loading…'}</p>
                  <p className="text-muted-foreground">
                    Confidence: {runtimeFsr?.confidence ?? '—'} · AppID: {runtimeFsr?.detectedAppId ?? '—'} · PID: {runtimeFsr?.detectedGamePid ?? '—'}
                  </p>
                  <p className="text-muted-foreground">
                    Indicator: {runtimeFsr?.indicatorRequested ? 'requested' : 'not requested'} · Runtime DLL: {runtimeFsr?.dllLoaded ? 'loaded' : 'not loaded'} · Source kind: {runtimeFsr?.dllPathKind ?? '—'}
                  </p>
                  <p className="text-muted-foreground break-all">
                    Source: {runtimeFsr?.sourcePath ?? '—'}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <Button size="sm" variant="outline" onClick={() => void refreshRuntime()}>
                    Runtime refresh
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void api.syncRunningFsrToMangoHud(undefined, runtimeTextStyle).then((r) =>
                        r.ok ? toast.success(r.message) : toast.error(r.error)
                      )
                    }
                  >
                    Sync runtime text to HUD
                  </Button>
                  <div className="inline-flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-xs">
                    <span className="text-muted-foreground">Runtime text style</span>
                    <Select
                      value={runtimeTextStyle}
                      onChange={(e) => {
                        const next = e.target.value as MangoHudRuntimeTextStyle
                        setRuntimeTextStyle(next)
                        try {
                          window.localStorage.setItem(MANGOHUD_TEXT_STYLE_KEY, next)
                        } catch {
                          // ignore storage errors
                        }
                      }}
                    >
                      <option value="full-stack">full-stack</option>
                      <option value="fsr-only">fsr-only</option>
                      <option value="status-only">status-only</option>
                      <option value="compact">compact</option>
                    </Select>
                  </div>
                  <label className="inline-flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-xs text-muted-foreground">
                    <Switch checked={autoRefreshRuntime} onCheckedChange={toggleAutoSync} />
                    Auto refresh + HUD sync
                  </label>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
              {groupedCatalog().map(([section, items]) => (
                <Card key={section} className="border-border/70 bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{section}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {items.map((item) => {
                        if (item.pairRole === 'color' && item.pairWith) return null
                        const value = entryMap.get(item.key) ?? (item.type === 'boolean' ? '0' : '')
                        const warning = getWarning(item, value)
                        const showStandardLabel = !(item.type === 'list' && item.pairRole === 'threshold' && item.pairWith)
                        const isPairedThreshold = item.type === 'list' && item.pairRole === 'threshold' && item.pairWith
                        return (
                          <div key={item.key} className={`space-y-1.5 ${isPairedThreshold ? 'md:col-span-2' : ''}`}>
                            {showStandardLabel && <label className="text-xs font-medium text-muted-foreground">{item.label}</label>}
                            {item.type === 'boolean' && (
                              <Select value={value} onChange={(e) => setKey(item, e.target.value)}>
                                <option value="1">Enabled</option>
                                <option value="0">Disabled</option>
                              </Select>
                            )}
                            {item.type === 'select' && (
                              <Select value={value} onChange={(e) => setKey(item, e.target.value)}>
                                {(item.options ?? []).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                                {value && !item.options?.includes(value) && <option value={value}>{value} (custom)</option>}
                              </Select>
                            )}
                            {item.type === 'number' && (
                              <Input
                                type="number"
                                min={item.min}
                                max={item.max}
                                step={item.step}
                                value={value}
                                onChange={(e) => setKey(item, e.target.value)}
                              />
                            )}
                            {item.type === 'list' && (
                              <>
                                {item.pairRole === 'threshold' && item.pairWith
                                  ? renderPairedThresholdColorField(item, value)
                                  : item.listKind === 'color-list'
                                    ? renderColorListField(item, value)
                                    : item.listKind === 'number-list'
                                      ? renderNumberListField(item, value)
                                      : (
                                        <Input
                                          value={value}
                                          onChange={(e) =>
                                            setKey(
                                              item,
                                              e.target.value
                                                .split(',')
                                                .map((x) => x.trim())
                                                .filter(Boolean)
                                                .join(',')
                                            )
                                          }
                                          placeholder="comma,separated,values"
                                        />
                                      )}
                              </>
                            )}
                            {item.type === 'color' && (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="color"
                                  className="h-9 w-12 p-1"
                                  value={toColorHex(value)}
                                  onChange={(e) => setKey(item, e.target.value)}
                                />
                                <Input value={value} onChange={(e) => setKey(item, e.target.value)} placeholder="RRGGBB" />
                              </div>
                            )}
                            {item.type === 'string' && <Input value={value} onChange={(e) => setKey(item, e.target.value)} />}
                            {item.help && <p className="text-[11px] text-muted-foreground">{item.help}</p>}
                            {warning && <p className="text-[11px] text-amber-600">{warning}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Raw MangoHud.conf</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              className="font-mono text-xs min-h-[380px]"
              value={rawText}
              onChange={(e) => {
                const nextRaw = e.target.value
                syncingFromRawRef.current = true
                setRawText(nextRaw)
                setEntries(parseMangoHudConfigText(nextRaw).entries)
              }}
            />
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() =>
                  void saveThenReload({ rawText, makeNamedBackup: backupName.trim() || null })
                    .then(() => loadAll())
                }
              >
                Save raw text
              </Button>
            </div>
            <div className="flex gap-2">
              <Select value={selectedBackup} onChange={(e) => setSelectedBackup(e.target.value)}>
                <option value="">Select backup…</option>
                {backups.map((b) => (
                  <option key={b.fileName} value={b.fileName}>
                    {b.fileName}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedBackup}
                onClick={() =>
                  void api.readMangoHudBackup(selectedBackup).then((r) => {
                    if (!r.ok) return toast.error(r.error)
                    setRawText(r.rawText)
                    setEntries(parseMangoHudConfigText(r.rawText).entries)
                    toast.success('Loaded backup')
                  })
                }
              >
                Preview backup
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!selectedBackup}
                onClick={() =>
                  void api.restoreMangoHudBackup(selectedBackup).then((r) => {
                    if (!r.ok) return toast.error(r.error)
                    toast.success('Backup restored')
                    void loadAll()
                  })
                }
              >
                <ArchiveRestore className="h-3.5 w-3.5 mr-1" />
                Restore
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
