import React, { useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '../lib/utils'
import { Switch } from './ui/switch'
import { Input } from './ui/input'
import {
  ENV_PRESETS,
  OVERVIEW_PRESET_IDS,
  isPresetActive,
  setPreset,
  hasUnrepresentedTokens,
  cloneModel,
  emptyGamescope,
} from '../../shared/launchOptions/compose'
import type { LaunchOptionsModel, GamescopeConfig } from '../../shared/launchOptions/compose'
import type { GpuInfo } from '../../shared/types'

// Re-export for backward compat with LaunchOptions route
export { BATCH_SNIPPETS, mergeSnippetPrefix, removeSnippet, hasSnippet } from '../../shared/launchOptions/compose'

interface StructuredPanelProps {
  model: LaunchOptionsModel
  onModelChange: (m: LaunchOptionsModel) => void
  gpuInfo?: GpuInfo | null
  disabled?: boolean
}

type PanelTab = 'wrappers' | 'presets' | 'gamescope'

export function StructuredPanel({ model, onModelChange, gpuInfo, disabled }: StructuredPanelProps) {
  const [tab, setTab] = useState<PanelTab>('wrappers')

  const update = (fn: (m: LaunchOptionsModel) => void) => {
    if (disabled) return
    const next = cloneModel(model)
    fn(next)
    onModelChange(next)
  }

  const hasUnknown = hasUnrepresentedTokens(model)

  const tabCls = (t: PanelTab) =>
    cn(
      'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
      tab === t
        ? 'bg-primary/15 text-primary border border-primary/30'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
    )

  return (
    <div className={cn('space-y-3', disabled && 'opacity-50 pointer-events-none')}>
      {/* Unknown tokens banner */}
      {hasUnknown && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Some prefix tokens aren't represented as toggles — see the raw field below.</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1">
        <button className={tabCls('wrappers')} onClick={() => setTab('wrappers')}>Wrappers</button>
        <button className={tabCls('presets')} onClick={() => setTab('presets')}>Env presets</button>
        <button className={tabCls('gamescope')} onClick={() => setTab('gamescope')}>Gamescope</button>
      </div>

      {/* Wrappers tab */}
      {tab === 'wrappers' && (
        <div className="space-y-2">
          <WrapperRow
            label="MangoHud"
            description="mangohud — overlay with FPS, temps, GPU usage"
            active={model.mangohud}
            onChange={(v) => update((m) => { m.mangohud = v })}
          />
          <WrapperRow
            label="GameMode"
            description="gamemode — CPU governor + scheduler optimizations"
            active={model.gamemode}
            onChange={(v) => update((m) => { m.gamemode = v })}
          />
          <WrapperRow
            label="game-performance"
            description="game-performance — KDE / distro performance profile wrapper"
            active={model.gamePerformance}
            onChange={(v) => update((m) => { m.gamePerformance = v })}
          />
        </div>
      )}

      {/* Env presets tab */}
      {tab === 'presets' && (
        <EnvPresetsTab model={model} onUpdate={update} gpuInfo={gpuInfo} />
      )}

      {/* Gamescope tab */}
      {tab === 'gamescope' && (
        <GamescopeTab model={model} onUpdate={update} />
      )}
    </div>
  )
}

// ── Wrapper row ────────────────────────────────────────────────────────────

function WrapperRow({
  label, description, active, onChange,
}: {
  label: string
  description: string
  active: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={active} onCheckedChange={onChange} />
    </div>
  )
}

// ── Env presets tab ────────────────────────────────────────────────────────

function EnvPresetsTab({
  model, onUpdate, gpuInfo,
}: {
  model: LaunchOptionsModel
  onUpdate: (fn: (m: LaunchOptionsModel) => void) => void
  gpuInfo?: GpuInfo | null
}) {
  const overviewPresets = ENV_PRESETS.filter((p) => OVERVIEW_PRESET_IDS.has(p.id))
  const amdPresets = ENV_PRESETS.filter((p) => p.gpuFamily === 'amd')
  const nvidiaPresets = ENV_PRESETS.filter((p) => p.gpuFamily === 'nvidia')
  const otherPresets = ENV_PRESETS.filter(
    (p) => !OVERVIEW_PRESET_IDS.has(p.id) && p.gpuFamily === 'any' && p.tier >= 2
  )

  return (
    <div className="space-y-4 overflow-y-auto max-h-64 pr-1">
      <PresetGroup
        title="Common"
        presets={overviewPresets}
        model={model}
        onUpdate={onUpdate}
        gpuInfo={gpuInfo}
      />
      <PresetGroup
        title="General tweaks"
        presets={otherPresets}
        model={model}
        onUpdate={onUpdate}
        gpuInfo={gpuInfo}
      />
      <PresetGroup
        title="AMD"
        presets={amdPresets}
        model={model}
        onUpdate={onUpdate}
        gpuInfo={gpuInfo}
        gatedFamily="amd"
      />
      <PresetGroup
        title="NVIDIA"
        presets={nvidiaPresets}
        model={model}
        onUpdate={onUpdate}
        gpuInfo={gpuInfo}
        gatedFamily="nvidia"
      />
    </div>
  )
}

function PresetGroup({
  title, presets, model, onUpdate, gpuInfo, gatedFamily,
}: {
  title: string
  presets: typeof ENV_PRESETS
  model: LaunchOptionsModel
  onUpdate: (fn: (m: LaunchOptionsModel) => void) => void
  gpuInfo?: GpuInfo | null
  gatedFamily?: 'amd' | 'nvidia'
}) {
  if (!presets.length) return null
  const gpuMismatch = gatedFamily === 'amd' ? !gpuInfo?.hasAmd : gatedFamily === 'nvidia' ? !gpuInfo?.hasNvidia : false

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        {title}
        {gpuMismatch && <span className="ml-1.5 text-amber-500/70 normal-case font-normal">(not detected)</span>}
      </p>
      <div className="space-y-1">
        {presets.map((preset) => {
          const active = isPresetActive(model, preset)
          return (
            <div
              key={preset.id}
              className={cn(
                'flex items-center justify-between rounded-md border px-2.5 py-1.5 transition-colors',
                active ? 'border-primary/30 bg-primary/8' : 'border-border bg-card/30',
                gpuMismatch && 'opacity-50'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium truncate">{preset.label}</span>
                  {preset.risk === 'experimental' && (
                    <span className="text-[10px] text-amber-500/80 border border-amber-500/30 rounded px-1 shrink-0">exp</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate" title={`${preset.envKey}=${preset.envValue}\n${preset.tooltip}`}>
                  {preset.envKey}={preset.envValue}
                </p>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  title={`${preset.tooltip}\n\n${preset.envKey}=${preset.envValue}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info className="h-3 w-3" />
                </button>
                <Switch
                  checked={active}
                  onCheckedChange={(v) => onUpdate((m) => {
                    const next = setPreset(m, preset, v)
                    Object.assign(m, next)
                  })}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Gamescope tab ──────────────────────────────────────────────────────────

function GamescopeTab({
  model, onUpdate,
}: {
  model: LaunchOptionsModel
  onUpdate: (fn: (m: LaunchOptionsModel) => void) => void
}) {
  const gs = model.gamescope
  const enabled = gs !== null

  const setGs = (fn: (g: GamescopeConfig) => void) => {
    onUpdate((m) => {
      if (!m.gamescope) m.gamescope = emptyGamescope()
      fn(m.gamescope)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Enable Gamescope</p>
          <p className="text-xs text-muted-foreground">Wrap the game in a nested Wayland compositor</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onUpdate((m) => { m.gamescope = v ? emptyGamescope() : null })}
        />
      </div>

      {enabled && gs && (
        <div className="space-y-2 pl-1 border-l-2 border-primary/20">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Width (-W)</label>
              <Input
                type="number"
                value={gs.width ?? ''}
                onChange={(e) => setGs((g) => { g.width = e.target.value ? parseInt(e.target.value) : null })}
                placeholder="e.g. 1920"
                className="h-7 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Height (-H)</label>
              <Input
                type="number"
                value={gs.height ?? ''}
                onChange={(e) => setGs((g) => { g.height = e.target.value ? parseInt(e.target.value) : null })}
                placeholder="e.g. 1080"
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Frame cap (-r)</label>
            <Input
              type="number"
              value={gs.frameLimit ?? ''}
              onChange={(e) => setGs((g) => { g.frameLimit = e.target.value ? parseInt(e.target.value) : null })}
              placeholder="e.g. 60"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <GsSwitch label="Fullscreen (-f)" checked={gs.fullscreen} onChange={(v) => setGs((g) => { g.fullscreen = v })} />
            <GsSwitch label="HDR (--hdr-enabled)" checked={gs.hdr} onChange={(v) => setGs((g) => { g.hdr = v })} />
            <GsSwitch label="Adaptive sync / VRR (-O)" checked={gs.vrr} onChange={(v) => setGs((g) => { g.vrr = v })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Extra args</label>
            <Input
              value={gs.extraArgs.join(' ')}
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

function GsSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
