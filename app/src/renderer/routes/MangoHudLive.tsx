import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Save, Zap, ArchiveRestore } from 'lucide-react'
import { api } from '../lib/ipc'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Switch } from '../components/ui/switch'
import { parseMangoHudConfigText, mergeMangoHudEntry, serializeMangoHudEntries } from '../../shared/mangohudConfig'
import type { MangoHudConfigEntry, MangoHudRuntimeTextStyle, RunningFsrStatus } from '../../shared/types'

type FieldType = 'boolean' | 'number' | 'string' | 'list' | 'color' | 'select'
interface CatalogItem {
  key: string
  label: string
  section: string
  type: FieldType
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
  { section: 'Overlay', key: 'fps_value', label: 'FPS thresholds', type: 'list' },
  { section: 'Overlay', key: 'fps_color', label: 'FPS colors', type: 'list' },
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
  { section: 'GPU', key: 'gpu_load_value', label: 'GPU load thresholds', type: 'list' },
  { section: 'GPU', key: 'gpu_load_color', label: 'GPU load colors', type: 'list' },
  { section: 'GPU', key: 'gpu_text', label: 'GPU label', type: 'string' },
  { section: 'GPU', key: 'gpu_color', label: 'GPU label color', type: 'color' },

  { section: 'CPU', key: 'cpu_stats', label: 'CPU stats', type: 'boolean' },
  { section: 'CPU', key: 'cpu_temp', label: 'CPU temperature', type: 'boolean' },
  { section: 'CPU', key: 'cpu_power', label: 'CPU power', type: 'boolean' },
  { section: 'CPU', key: 'cpu_mhz', label: 'CPU MHz', type: 'boolean' },
  { section: 'CPU', key: 'cpu_load_change', label: 'CPU load change', type: 'boolean' },
  { section: 'CPU', key: 'core_load', label: 'Per-core load', type: 'boolean' },
  { section: 'CPU', key: 'core_bars', label: 'Core bars', type: 'boolean' },
  { section: 'CPU', key: 'cpu_load_value', label: 'CPU load thresholds', type: 'list' },
  { section: 'CPU', key: 'cpu_load_color', label: 'CPU load colors', type: 'list' },
  { section: 'CPU', key: 'cpu_text', label: 'CPU label', type: 'string' },
  { section: 'CPU', key: 'cpu_color', label: 'CPU label color', type: 'color' },

  { section: 'Memory', key: 'ram', label: 'RAM usage', type: 'boolean' },
  { section: 'Memory', key: 'vram', label: 'VRAM usage', type: 'boolean' },
  { section: 'Memory', key: 'swap', label: 'Swap usage', type: 'boolean' },
  { section: 'Memory', key: 'ram_color', label: 'RAM color', type: 'color' },
  { section: 'Memory', key: 'vram_color', label: 'VRAM color', type: 'color' },
  { section: 'Memory', key: 'wine_color', label: 'Wine color', type: 'color' },

  { section: 'Frames', key: 'fps_limit', label: 'FPS limit', type: 'list' },
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

export function MangoHudLive() {
  const [entries, setEntries] = useState<MangoHudConfigEntry[]>([])
  const [rawText, setRawText] = useState('')
  const [statusText, setStatusText] = useState('Checking status…')
  const [configPath, setConfigPath] = useState('')
  const [backups, setBackups] = useState<Array<{ fileName: string; mtimeMs: number }>>([])
  const [selectedBackup, setSelectedBackup] = useState('')
  const [backupName, setBackupName] = useState('')
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
    const [status, cfg, b] = await Promise.all([
      api.getMangoHudStatus(),
      api.getMangoHudConfig(),
      api.listMangoHudBackups(),
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
  }

  useEffect(() => {
    void loadAll()
    void refreshRuntime()
  }, [])

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

  return (
    <div className="h-full min-h-0 flex flex-col p-4 gap-3 overflow-y-auto">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">MangoHud Live Config</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{statusText}</p>
          <p className="text-xs font-mono text-muted-foreground break-all">{configPath}</p>
          <div className="rounded border border-border/60 bg-muted/30 px-2 py-1.5 text-xs">
            <p className="font-medium">Runtime FSR: {runtimeFsr?.label ?? 'Loading…'}</p>
            <p className="text-muted-foreground">
              Confidence: {runtimeFsr?.confidence ?? '—'}
              {runtimeFsr?.sourcePath ? ` · Source: ${runtimeFsr.sourcePath}` : ''}
            </p>
            <p className="text-muted-foreground">
              Indicator: {runtimeFsr?.indicatorRequested ? 'requested' : 'not requested'} · Runtime DLL:{' '}
              {runtimeFsr?.dllLoaded ? 'loaded' : 'not loaded'} · Likely active: {runtimeFsr?.likelyActive ? 'yes' : 'no'}
            </p>
            <p className="text-muted-foreground">
              Detected AppID: {runtimeFsr?.detectedAppId ?? '—'} · PID: {runtimeFsr?.detectedGamePid ?? '—'} · Source kind:{' '}
              {runtimeFsr?.dllPathKind ?? '—'}
            </p>
            <p className="text-muted-foreground">
              Mapped: FSR {runtimeFsr?.mappedDlls.fsr.length ?? 0} · DLSS {runtimeFsr?.mappedDlls.dlss.length ?? 0} · XeSS{' '}
              {runtimeFsr?.mappedDlls.xess.length ?? 0}
            </p>
            <p className="text-muted-foreground">
              FSR version: {runtimeFsr?.fsrVersion ?? '—'} · ML FI version: {runtimeFsr?.mlfiVersion ?? '—'} · Frame Gen version:{' '}
              {runtimeFsr?.framegenVersion ?? '—'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
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
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void api.reloadMangoHud().then((r) => (r.ok ? toast.success(r.message) : toast.error(r.error)))
              }
            >
              <Zap className="h-3.5 w-3.5 mr-1" />
              Reload live
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refreshRuntime()}
            >
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
            <Input
              className="h-8 w-56"
              value={backupName}
              onChange={(e) => setBackupName(e.target.value)}
              placeholder="Optional backup name"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Full MangoHud Catalog</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {groupedCatalog().map(([section, items]) => (
              <div key={section} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{section}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {items.map((item) => {
                    const value = entryMap.get(item.key) ?? (item.type === 'boolean' ? '0' : '')
                    const warning = getWarning(item, value)
                    return (
                      <div key={item.key} className="space-y-1">
                        <label className="text-xs text-muted-foreground">{item.label}</label>
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
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRawText(serializeMangoHudEntries(entries))}
            >
              Sync to raw editor
            </Button>
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
              onChange={(e) => setRawText(e.target.value)}
            />
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEntries(parseMangoHudConfigText(rawText).entries)}
              >
                Parse raw into structured
              </Button>
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
