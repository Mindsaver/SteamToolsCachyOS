import React, { useState, useRef, useEffect, useCallback } from 'react'
import { AlertTriangle, Info, Lock, Search, X, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { Switch } from './ui/switch'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import {
  ENV_PRESETS,
  OVERVIEW_PRESET_IDS,
  isPresetActive,
  presetState,
  setPreset,
  clearPreset,
  hasUnrepresentedTokens,
  cloneModel,
  emptyGamescope,
} from '../../shared/launchOptions/compose'
import type { LaunchOptionsModel, GamescopeConfig, EnvPreset, PresetState } from '../../shared/launchOptions/compose'
import type { GpuInfo } from '../../shared/types'

// Re-export for backward compat with LaunchOptions route
export { BATCH_SNIPPETS, mergeSnippetPrefix, removeSnippet, hasSnippet } from '../../shared/launchOptions/compose'

const RECENT_KEY = 'lo:recent-presets'
const MAX_RECENT = 6

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveRecent(ids: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)))
}

function touchRecent(id: string) {
  const current = loadRecent().filter((x) => x !== id)
  saveRecent([id, ...current])
}

interface StructuredPanelProps {
  model: LaunchOptionsModel
  onModelChange: (m: LaunchOptionsModel) => void
  gpuInfo?: GpuInfo | null
  globalEnv?: Record<string, string>
  /** null = fully interactive; 'steam-running' = read-only overlay; 'op-no-editor' = placeholder */
  disabledReason?: 'steam-running' | 'op-no-editor' | null
}

type PanelTab = 'wrappers' | 'presets' | 'gamescope'

export function StructuredPanel({
  model, onModelChange, gpuInfo, globalEnv = {}, disabledReason = null,
}: StructuredPanelProps) {
  const [tab, setTab] = useState<PanelTab>('wrappers')
  const [presetFilter, setPresetFilter] = useState('')
  const filterRef = useRef<HTMLInputElement>(null)

  const update = useCallback((fn: (m: LaunchOptionsModel) => void) => {
    if (disabledReason === 'steam-running') return
    const next = cloneModel(model)
    fn(next)
    onModelChange(next)
  }, [model, onModelChange, disabledReason])

  const hasUnknown = hasUnrepresentedTokens(model)
  const isLocked = disabledReason === 'steam-running'

  // '/' keyboard shortcut focuses the preset search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        tab === 'presets' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault()
        filterRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab])

  if (disabledReason === 'op-no-editor') {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-5 text-center space-y-1">
        <p className="text-sm font-medium text-muted-foreground">No value needed for this operation</p>
        <p className="text-xs text-muted-foreground/60">Switch to Replace, Prefix, or Suffix to use the structured editor.</p>
      </div>
    )
  }

  const tabCls = (t: PanelTab) =>
    cn(
      'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
      tab === t
        ? 'bg-background shadow-sm text-foreground'
        : 'text-muted-foreground hover:text-foreground'
    )

  return (
    <div className="space-y-3">
      {/* Steam lock banner — shown above panel, not dimming it */}
      {isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Steam is running — values are read-only
        </div>
      )}

      {/* Unknown tokens banner */}
      {hasUnknown && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Some prefix tokens aren't represented as toggles — see the raw field below.</span>
        </div>
      )}

      {/* Segmented tab bar */}
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted/40 border border-border">
        <button className={tabCls('wrappers')} onClick={() => setTab('wrappers')}>Wrappers</button>
        <button className={tabCls('presets')} onClick={() => setTab('presets')}>Env presets</button>
        <button className={tabCls('gamescope')} onClick={() => setTab('gamescope')}>Gamescope</button>
      </div>

      {/* Wrappers tab */}
      {tab === 'wrappers' && (
        <div className="space-y-2">
          <WrapperRow
            label="MangoHud"
            description="mangohud — FPS/GPU/CPU overlay"
            active={model.mangohud}
            globalActive={!!globalEnv['MANGOHUD']}
            locked={isLocked}
            onChange={(v) => update((m) => { m.mangohud = v })}
          />
          <WrapperRow
            label="GameMode"
            description="gamemode — CPU governor + scheduler optimizations"
            active={model.gamemode}
            globalActive={!!globalEnv['GAMEMODERUNINIT'] || !!globalEnv['__GL_THREADED_OPTIMIZATIONS']}
            locked={isLocked}
            onChange={(v) => update((m) => { m.gamemode = v })}
          />
          <WrapperRow
            label="game-performance"
            description="game-performance — KDE / distro performance profile wrapper"
            active={model.gamePerformance}
            globalActive={false}
            locked={isLocked}
            onChange={(v) => update((m) => { m.gamePerformance = v })}
          />
        </div>
      )}

      {/* Env presets tab */}
      {tab === 'presets' && (
        <EnvPresetsTab
          model={model}
          onUpdate={update}
          gpuInfo={gpuInfo}
          globalEnv={globalEnv}
          locked={isLocked}
          filter={presetFilter}
          onFilterChange={setPresetFilter}
          filterRef={filterRef}
        />
      )}

      {/* Gamescope tab */}
      {tab === 'gamescope' && (
        <GamescopeTab model={model} onUpdate={update} locked={isLocked} />
      )}
    </div>
  )
}

// ── Wrapper row ─────────────────────────────────────────────────────────────

function WrapperRow({
  label, description, active, globalActive, locked, onChange,
}: {
  label: string
  description: string
  active: boolean
  globalActive: boolean
  locked: boolean
  onChange: (v: boolean) => void
}) {
  const isGlobalOnly = globalActive && !active
  return (
    <div className={cn(
      'flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors',
      active ? 'border-primary/30 bg-primary/8' : 'border-border bg-card/40'
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium">{label}</p>
          {isGlobalOnly && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 gap-0.5">
              <Lock className="h-2.5 w-2.5" /> set globally
            </Badge>
          )}
          {active && globalActive && (
            <Badge variant="outline" className="text-[10px] h-4 px-1">local + global</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={active || isGlobalOnly}
        disabled={locked || isGlobalOnly}
        onCheckedChange={locked ? undefined : onChange}
      />
    </div>
  )
}

// ── Env presets tab ─────────────────────────────────────────────────────────

function EnvPresetsTab({
  model, onUpdate, gpuInfo, globalEnv, locked, filter, onFilterChange, filterRef,
}: {
  model: LaunchOptionsModel
  onUpdate: (fn: (m: LaunchOptionsModel) => void) => void
  gpuInfo?: GpuInfo | null
  globalEnv: Record<string, string>
  locked: boolean
  filter: string
  onFilterChange: (v: string) => void
  filterRef: React.RefObject<HTMLInputElement>
}) {
  const q = filter.trim().toLowerCase()

  const matchesFilter = (p: EnvPreset) => {
    if (!q) return true
    return (
      p.label.toLowerCase().includes(q) ||
      p.envKey.toLowerCase().includes(q) ||
      p.envValue.toLowerCase().includes(q)
    )
  }

  // Active here = locally on OR globally set
  const activeHere = ENV_PRESETS.filter((p) => {
    const state = presetState(model, p, globalEnv)
    return state.kind !== 'off'
  })

  const recentIds = loadRecent()
  const recentPresets = recentIds
    .map((id) => ENV_PRESETS.find((p) => p.id === id))
    .filter((p): p is EnvPreset => !!p && !activeHere.some((a) => a.id === p.id))

  const overviewPresets = ENV_PRESETS.filter((p) =>
    OVERVIEW_PRESET_IDS.has(p.id) &&
    !activeHere.some((a) => a.id === p.id) &&
    matchesFilter(p)
  )
  const otherPresets = ENV_PRESETS.filter(
    (p) =>
      !OVERVIEW_PRESET_IDS.has(p.id) &&
      p.gpuFamily === 'any' &&
      p.tier >= 2 &&
      !activeHere.some((a) => a.id === p.id) &&
      matchesFilter(p)
  )
  const amdPresets = ENV_PRESETS.filter(
    (p) => p.gpuFamily === 'amd' && !activeHere.some((a) => a.id === p.id) && matchesFilter(p)
  )
  const nvidiaPresets = ENV_PRESETS.filter(
    (p) => p.gpuFamily === 'nvidia' && !activeHere.some((a) => a.id === p.id) && matchesFilter(p)
  )

  const activeFiltered = activeHere.filter(matchesFilter)
  const recentFiltered = recentPresets.filter(matchesFilter)

  // action: 'on' | 'off' | 'inherit'
  // 'inherit' removes the key entirely so the global value takes effect again
  const handleToggle = (preset: EnvPreset, action: 'on' | 'off' | 'inherit') => {
    if (action === 'on') touchRecent(preset.id)
    onUpdate((m) => {
      let next: LaunchOptionsModel
      if (action === 'inherit') {
        next = clearPreset(m, preset)
      } else {
        next = setPreset(m, preset, action === 'on', globalEnv)
      }
      Object.assign(m, next)
    })
  }

  return (
    <div className="space-y-3">
      {/* Filter input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={filterRef}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter presets… (/)"
          className="pl-8 h-8 text-xs"
        />
        {filter && (
          <button
            onClick={() => onFilterChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-4 overflow-y-auto max-h-72 pr-0.5">
        {/* Active here */}
        {activeFiltered.length > 0 && (
          <PresetGroup
            title="Active here"
            presets={activeFiltered}
            model={model}
            onToggle={handleToggle}
            gpuInfo={gpuInfo}
            globalEnv={globalEnv}
            locked={locked}
            highlighted
          />
        )}

        {/* Recently used */}
        {recentFiltered.length > 0 && !q && (
          <PresetGroup
            title="Recently used"
            presets={recentFiltered}
            model={model}
            onToggle={handleToggle}
            gpuInfo={gpuInfo}
            globalEnv={globalEnv}
            locked={locked}
          />
        )}

        {/* Common */}
        {overviewPresets.length > 0 && (
          <PresetGroup
            title="Common"
            presets={overviewPresets}
            model={model}
            onToggle={handleToggle}
            gpuInfo={gpuInfo}
            globalEnv={globalEnv}
            locked={locked}
          />
        )}

        {/* General tweaks */}
        {otherPresets.length > 0 && (
          <PresetGroup
            title="General tweaks"
            presets={otherPresets}
            model={model}
            onToggle={handleToggle}
            gpuInfo={gpuInfo}
            globalEnv={globalEnv}
            locked={locked}
          />
        )}

        {/* AMD */}
        <CollapsiblePresetGroup
          title="AMD"
          presets={amdPresets}
          model={model}
          onToggle={handleToggle}
          gpuInfo={gpuInfo}
          globalEnv={globalEnv}
          locked={locked}
          gatedFamily="amd"
          defaultOpen={!!gpuInfo?.hasAmd}
        />

        {/* NVIDIA */}
        <CollapsiblePresetGroup
          title="NVIDIA"
          presets={nvidiaPresets}
          model={model}
          onToggle={handleToggle}
          gpuInfo={gpuInfo}
          globalEnv={globalEnv}
          locked={locked}
          gatedFamily="nvidia"
          defaultOpen={!!gpuInfo?.hasNvidia}
        />

        {q && activeFiltered.length === 0 && overviewPresets.length === 0 && otherPresets.length === 0 && amdPresets.length === 0 && nvidiaPresets.length === 0 && (
          <p className="text-center text-muted-foreground text-xs py-4">No presets match "{filter}"</p>
        )}
      </div>
    </div>
  )
}

// ── Preset group (flat) ─────────────────────────────────────────────────────

function PresetGroup({
  title, presets, model, onToggle, gpuInfo, globalEnv, locked, highlighted,
}: {
  title: string
  presets: EnvPreset[]
  model: LaunchOptionsModel
  onToggle: (p: EnvPreset, action: 'on' | 'off' | 'inherit') => void
  gpuInfo?: GpuInfo | null
  globalEnv: Record<string, string>
  locked: boolean
  highlighted?: boolean
}) {
  if (!presets.length) return null
  return (
    <div>
      <p className={cn(
        'text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-0.5',
        highlighted ? 'text-primary/70' : 'text-muted-foreground/60'
      )}>
        {title}
      </p>
      <div className="space-y-1">
        {presets.map((preset) => (
          <PresetRow
            key={preset.id}
            preset={preset}
            model={model}
            onToggle={onToggle}
            gpuInfo={gpuInfo}
            globalEnv={globalEnv}
            locked={locked}
          />
        ))}
      </div>
    </div>
  )
}

// ── Collapsible preset group (AMD / NVIDIA) ────────────────────────────────

function CollapsiblePresetGroup({
  title, presets, model, onToggle, gpuInfo, globalEnv, locked, gatedFamily, defaultOpen,
}: {
  title: string
  presets: EnvPreset[]
  model: LaunchOptionsModel
  onToggle: (p: EnvPreset, action: 'on' | 'off' | 'inherit') => void
  gpuInfo?: GpuInfo | null
  globalEnv: Record<string, string>
  locked: boolean
  gatedFamily: 'amd' | 'nvidia'
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!presets.length) return null
  const detected = gatedFamily === 'amd' ? !!gpuInfo?.hasAmd : !!gpuInfo?.hasNvidia

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-0.5 text-muted-foreground/60 hover:text-muted-foreground w-full text-left"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
        {!detected && (
          <span className="ml-1 normal-case font-normal text-amber-500/70">(not detected)</span>
        )}
      </button>
      {open && (
        <div className="space-y-1">
          {presets.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              model={model}
              onToggle={onToggle}
              gpuInfo={gpuInfo}
              globalEnv={globalEnv}
              locked={locked}
              gpuNotDetected={!detected}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Single preset row ────────────────────────────────────────────────────────

function PresetRow({
  preset, model, onToggle, globalEnv, locked, gpuNotDetected,
}: {
  preset: EnvPreset
  model: LaunchOptionsModel
  onToggle: (p: EnvPreset, action: 'on' | 'off' | 'inherit') => void
  gpuInfo?: GpuInfo | null
  globalEnv: Record<string, string>
  locked: boolean
  gpuNotDetected?: boolean
}) {
  const state = presetState(model, preset, globalEnv)
  const [infoOpen, setInfoOpen] = useState(false)
  const infoRef = useRef<HTMLDivElement>(null)

  // Close info popover on outside click
  useEffect(() => {
    if (!infoOpen) return
    const handler = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [infoOpen])

  const isOn = state.kind === 'on' || state.kind === 'local-overrides-global'
  const isLocalOff = state.kind === 'local-off'
  const isGlobalOn = state.kind === 'global-on'
  const isGlobalOther = state.kind === 'global-other'
  const isLocalOverrides = state.kind === 'local-overrides-global'
  const hasGlobal = preset.envKey in globalEnv

  const rowActive = isOn || isGlobalOn || isGlobalOther || isLocalOff

  const handleToggle = (on: boolean) => {
    if (locked) return
    onToggle(preset, on ? 'on' : 'off')
  }

  const handleInherit = () => {
    if (locked) return
    onToggle(preset, 'inherit')
  }

  return (
    <div className={cn(
      'flex items-start gap-2 rounded-md border px-2.5 py-2 transition-colors',
      isLocalOff
        ? 'border-destructive/30 bg-destructive/5'
        : isGlobalOn
          ? 'border-muted-foreground/30 bg-muted/30'
          : isGlobalOther
            ? 'border-amber-500/30 bg-amber-500/5'
            : isOn
              ? 'border-primary/30 bg-primary/8'
              : 'border-border bg-card/30',
      gpuNotDetected && 'opacity-75'
    )}>
      {/* Label + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs font-medium">{preset.label}</span>

          {preset.risk === 'experimental' && (
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-500/80"
              title="Experimental — may break things or have limited effect"
            >
              exp
            </Badge>
          )}

          {isGlobalOn && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 gap-0.5">
              <Lock className="h-2.5 w-2.5" /> set globally
            </Badge>
          )}

          {isLocalOff && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 border-destructive/40 text-destructive/80">
              forced off
            </Badge>
          )}

          {isGlobalOther && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-500">
              {`global=${(state as { kind: 'global-other'; value: string }).value}`}
            </Badge>
          )}

          {isLocalOverrides && (
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              local
            </Badge>
          )}
          {isLocalOverrides && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground">
              {`overrides global=${(state as { kind: 'local-overrides-global'; globalValue: string }).globalValue}`}
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {preset.envKey}={preset.envValue}
        </p>
      </div>

      {/* Info popover button */}
      <div className="relative mt-0.5" ref={infoRef}>
        <button
          onClick={() => setInfoOpen((o) => !o)}
          className={cn('text-muted-foreground hover:text-foreground transition-colors', infoOpen && 'text-foreground')}
          aria-label="More info"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        {infoOpen && (
          <div className="absolute right-0 top-6 z-50 w-64 rounded-lg border border-border bg-popover shadow-lg p-3 space-y-1.5 text-xs">
            <p className="font-medium">{preset.label}</p>
            <p className="text-muted-foreground leading-relaxed">{preset.tooltip}</p>
            <code className="block font-mono bg-muted/50 rounded px-2 py-1 text-[11px]">
              {preset.envKey}={preset.envValue}
            </code>
            {preset.risk === 'experimental' && (
              <p className="text-amber-500/80">⚠ Experimental — may have limited effect or break things.</p>
            )}
            {isGlobalOn && (
              <p className="text-muted-foreground">
                Set globally via <code className="font-mono">user_settings.py</code> — affects all games using this Proton build.
              </p>
            )}
            {isLocalOff && (
              <p className="text-destructive/80">
                Forced OFF locally — <code className="font-mono">{preset.envKey}={globalEnv[preset.envKey] === '1' ? '0' : '1'}</code> is written in your launch options to counter the global setting. Click <strong>Inherit</strong> to remove this override and let the global value apply again.
              </p>
            )}
            {(isGlobalOther || isLocalOverrides) && (
              <p className="text-amber-500/80">
                {isGlobalOther
                  ? `Global user_settings.py sets ${preset.envKey}=${(state as { kind: 'global-other'; value: string }).value} (different value). Local launch option can override.`
                  : `Local launch option is active. Global user_settings.py sets ${preset.envKey}=${(state as { kind: 'local-overrides-global'; globalValue: string }).globalValue}.`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Toggle / action */}
      <div className="flex flex-col items-end gap-1 mt-0.5">
        {hasGlobal ? (
          <TriStateControl
            state={isOn ? 'on' : isLocalOff ? 'off' : 'inherit'}
            locked={locked}
            onOn={() => onToggle(preset, 'on')}
            onOff={() => onToggle(preset, 'off')}
            onInherit={handleInherit}
          />
        ) : (
          <Switch
            checked={isOn}
            disabled={locked}
            onCheckedChange={locked ? undefined : (v) => handleToggle(v)}
          />
        )}
      </div>
    </div>
  )
}

// ── Tri-state control (Inherit / On / Off) ────────────────────────────────────
// Used when a preset has a global user_settings.py value so the user can
// explicitly choose: inherit global · force on locally · force off locally.

function TriStateControl({
  state, locked, onOn, onOff, onInherit,
}: {
  state: 'inherit' | 'on' | 'off'
  locked: boolean
  onOn: () => void
  onOff: () => void
  onInherit: () => void
}) {
  const btn = (label: string, active: boolean, handler: () => void, title: string) => (
    <button
      onClick={locked ? undefined : handler}
      title={title}
      className={cn(
        'px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors border',
        active
          ? 'bg-primary/20 border-primary/50 text-primary'
          : 'bg-card/40 border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
        locked && 'opacity-50 cursor-not-allowed'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="flex gap-0.5" title={locked ? 'Read-only while Steam is running' : undefined}>
      {btn('Inherit', state === 'inherit', onInherit, 'Remove local override — let global user_settings.py take effect')}
      {btn('On', state === 'on', onOn, 'Force ON locally (overrides global)')}
      {btn('Off', state === 'off', onOff, 'Force OFF locally (overrides global with counter-value)')}
    </div>
  )
}

// ── Gamescope tab ────────────────────────────────────────────────────────────

function GamescopeTab({
  model, onUpdate, locked,
}: {
  model: LaunchOptionsModel
  onUpdate: (fn: (m: LaunchOptionsModel) => void) => void
  locked: boolean
}) {
  const gs = model.gamescope
  const enabled = gs !== null

  const setGs = (fn: (g: GamescopeConfig) => void) => {
    onUpdate((m) => {
      if (!m.gamescope) m.gamescope = emptyGamescope()
      fn(m.gamescope)
    })
  }

  const reset = (field: keyof GamescopeConfig) => {
    setGs((g) => {
      if (field === 'width' || field === 'height' || field === 'frameLimit') {
        (g as Record<string, unknown>)[field] = null
      } else if (field === 'extraArgs') {
        g.extraArgs = []
      } else {
        (g as Record<string, unknown>)[field] = false
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Enable Gamescope</p>
          <p className="text-xs text-muted-foreground">Wrap the game in a nested Wayland compositor</p>
        </div>
        <Switch
          checked={enabled}
          disabled={locked}
          onCheckedChange={(v) => onUpdate((m) => { m.gamescope = v ? emptyGamescope() : null })}
        />
      </div>

      {enabled && gs && (
        <div className="space-y-3 pl-2 border-l-2 border-primary/20">
          {/* Resolution grid */}
          <div className="grid grid-cols-2 gap-2">
            <GsNumberField
              label="Width (-W)"
              value={gs.width}
              placeholder="e.g. 1920"
              locked={locked}
              onChange={(v) => setGs((g) => { g.width = v })}
              onReset={() => reset('width')}
            />
            <GsNumberField
              label="Height (-H)"
              value={gs.height}
              placeholder="e.g. 1080"
              locked={locked}
              onChange={(v) => setGs((g) => { g.height = v })}
              onReset={() => reset('height')}
            />
          </div>

          <GsNumberField
            label="Frame cap (-r)"
            value={gs.frameLimit}
            placeholder="e.g. 60"
            locked={locked}
            onChange={(v) => setGs((g) => { g.frameLimit = v })}
            onReset={() => reset('frameLimit')}
          />

          {/* Toggles row */}
          <div className="grid grid-cols-3 gap-2">
            <GsToggle label="Fullscreen (-f)" checked={gs.fullscreen} locked={locked} onChange={(v) => setGs((g) => { g.fullscreen = v })} />
            <GsToggle label="HDR" checked={gs.hdr} locked={locked} onChange={(v) => setGs((g) => { g.hdr = v })} />
            <GsToggle label="VRR (-O)" checked={gs.vrr} locked={locked} onChange={(v) => setGs((g) => { g.vrr = v })} />
          </div>

          {/* Extra args */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Extra args</label>
              {gs.extraArgs.length > 0 && !locked && (
                <button onClick={() => reset('extraArgs')} className="text-[10px] text-muted-foreground hover:text-foreground">Reset</button>
              )}
            </div>
            <Input
              value={gs.extraArgs.join(' ')}
              disabled={locked}
              onChange={(e) => setGs((g) => { g.extraArgs = e.target.value ? e.target.value.split(/\s+/) : [] })}
              placeholder="e.g. --expose-wayland"
              className="h-7 text-xs font-mono"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function GsNumberField({
  label, value, placeholder, locked, onChange, onReset,
}: {
  label: string
  value: number | null
  placeholder: string
  locked: boolean
  onChange: (v: number | null) => void
  onReset: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        {value !== null && !locked && (
          <button onClick={onReset} className="text-[10px] text-muted-foreground hover:text-foreground">Reset</button>
        )}
      </div>
      <Input
        type="number"
        value={value ?? ''}
        disabled={locked}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
        placeholder={placeholder}
        className="h-7 text-xs"
      />
    </div>
  )
}

function GsToggle({
  label, checked, locked, onChange,
}: {
  label: string
  checked: boolean
  locked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-between gap-1.5 rounded-md border px-2 py-2 text-center cursor-pointer transition-colors',
      checked ? 'border-primary/30 bg-primary/8' : 'border-border bg-card/30',
      locked && 'opacity-70 cursor-not-allowed'
    )}
      onClick={() => !locked && onChange(!checked)}
    >
      <span className="text-[11px] text-muted-foreground leading-tight">{label}</span>
      <div className={cn(
        'w-3 h-3 rounded-full border-2 transition-colors',
        checked ? 'bg-primary border-primary' : 'border-muted-foreground/40'
      )} />
    </div>
  )
}
