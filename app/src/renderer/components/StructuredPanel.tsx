import React, { useState, useRef, useEffect, useCallback } from 'react'
import { AlertTriangle, ExternalLink, Info, Lock, Search, X, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../lib/utils'
import { Switch } from './ui/switch'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Select } from './ui/select'
import {
  CATALOG_TABS,
  ENV_PRESETS,
  OVERVIEW_PRESET_IDS,
  isPresetActive,
  presetState,
  setPreset,
  clearPreset,
  hasUnrepresentedTokens,
  cloneModel,
  emptyGamescope,
  applyItemWithRelations,
  findConflicts,
  getItemsByTab,
  getItemsForTabGrouped,
  getTabById,
} from '../../shared/launchOptions/compose'
import type { LaunchOptionsModel, GamescopeConfig, EnvPreset, PresetState, Item, GamescopeValue } from '../../shared/launchOptions/compose'
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

export function StructuredPanel({
  model, onModelChange, gpuInfo, globalEnv = {}, disabledReason = null,
}: StructuredPanelProps) {
  const [tabId, setTabId] = useState<string>(CATALOG_TABS[0]?.id ?? 'wrappers')
  const [presetFilter, setPresetFilter] = useState('')
  const filterRef = useRef<HTMLInputElement>(null)

  const update = useCallback((fn: (m: LaunchOptionsModel) => void) => {
    if (disabledReason === 'steam-running') return
    const next = cloneModel(model)
    fn(next)
    onModelChange(next)
  }, [model, onModelChange, disabledReason])

  const applyAndToast = useCallback((item: Item, on: boolean) => {
    if (disabledReason === 'steam-running') return
    const r = applyItemWithRelations(model, item, on, globalEnv)
    onModelChange(r.model)
    if (r.disabled.length) {
      toast.info(
        `Disabled ${r.disabled.map((d) => d.label).join(', ')}`,
        { description: `Conflicts with ${item.label}` }
      )
    }
    if (r.enabled.length) {
      toast.success(
        `Also enabled ${r.enabled.map((e) => e.label).join(', ')}`,
        { description: `Implied by ${item.label}` }
      )
    }
  }, [model, onModelChange, globalEnv, disabledReason])

  const hasUnknown = hasUnrepresentedTokens(model)
  const isLocked = disabledReason === 'steam-running'

  // '/' shortcut focuses preset search when on the presets tab (or any tab with 'filter' feature)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tab = getTabById(tabId)
      if (
        e.key === '/' &&
        tab?.features?.includes('filter') &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault()
        filterRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tabId])

  if (disabledReason === 'op-no-editor') {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-5 text-center space-y-1">
        <p className="text-sm font-medium text-muted-foreground">No value needed for this operation</p>
        <p className="text-xs text-muted-foreground/60">Switch to Replace, Prefix, or Suffix to use the structured editor.</p>
      </div>
    )
  }

  const tabCls = (id: string) =>
    cn(
      'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
      tabId === id
        ? 'bg-background shadow-sm text-foreground'
        : 'text-muted-foreground hover:text-foreground'
    )

  const currentTab = getTabById(tabId)
  const tabFeatures = currentTab?.features ?? []

  return (
    <div className="space-y-3">
      {isLocked && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Steam is running — values are read-only
        </div>
      )}

      {hasUnknown && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Some prefix tokens aren't represented as toggles — see the raw field below.</span>
        </div>
      )}

      {/* Dynamic tab strip from CATALOG_TABS */}
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted/40 border border-border">
        {CATALOG_TABS.map((tab) => (
          <button key={tab.id} className={tabCls(tab.id)} onClick={() => setTabId(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tabFeatures.includes('filter') ? (
        // Env-presets-style tab with filter, GPU groups, tri-state
        <EnvPresetsTab
          model={model}
          onUpdate={update}
          applyAndToast={applyAndToast}
          gpuInfo={gpuInfo}
          globalEnv={globalEnv}
          locked={isLocked}
          filter={presetFilter}
          onFilterChange={setPresetFilter}
          filterRef={filterRef}
        />
      ) : tabFeatures.includes('gamescopeMaster') ? (
        // Gamescope tab with master Enable switch + Extra args
        <GamescopeTabView
          tabId={tabId}
          model={model}
          onUpdate={update}
          applyAndToast={applyAndToast}
          locked={isLocked}
        />
      ) : (
        // Generic tab: all items rendered as ItemRow
        <GenericTabView
          tabId={tabId}
          model={model}
          applyAndToast={applyAndToast}
          globalEnv={globalEnv}
          locked={isLocked}
        />
      )}
    </div>
  )
}

// ── Generic tab view ─────────────────────────────────────────────────────────

function GenericTabView({
  tabId, model, applyAndToast, globalEnv, locked,
}: {
  tabId: string
  model: LaunchOptionsModel
  applyAndToast: (item: Item, on: boolean) => void
  globalEnv: Record<string, string>
  locked: boolean
}) {
  const grouped = getItemsForTabGrouped(tabId)
  const tab = getTabById(tabId)

  return (
    <div className="space-y-2">
      {[...grouped.entries()].map(([groupId, items]) => {
        const groupLabel = tab?.groups?.find((g) => g.id === groupId)?.label
        return (
          <div key={groupId}>
            {groupLabel && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-0.5 pt-2 pb-1">
                {groupLabel}
              </p>
            )}
            <div className="space-y-1.5">
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  model={model}
                  globalEnv={globalEnv}
                  locked={locked}
                  onChange={(on) => applyAndToast(item, on)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Gamescope tab view (with master Enable + Extra args addons) ──────────────

function GamescopeTabView({
  tabId, model, onUpdate, applyAndToast, locked,
}: {
  tabId: string
  model: LaunchOptionsModel
  onUpdate: (fn: (m: LaunchOptionsModel) => void) => void
  applyAndToast: (item: Item, on: boolean) => void
  locked: boolean
}) {
  const gs = model.gamescope
  const enabled = gs !== null
  const grouped = getItemsForTabGrouped(tabId)
  const tab = getTabById(tabId)

  const setGsValue = (field: string, value: GamescopeValue) => {
    onUpdate((m) => {
      if (!m.gamescope) m.gamescope = emptyGamescope()
      m.gamescope.values[field] = value
    })
  }

  return (
    <div className="space-y-3">
      {/* Master enable switch */}
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
        <div className="space-y-1 pl-2 border-l-2 border-primary/20">
          {[...grouped.entries()].map(([groupId, items]) => {
            const groupLabel = tab?.groups?.find((g) => g.id === groupId)?.label
            return (
              <div key={groupId}>
                {groupLabel && (
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1 pt-2 pb-0.5">
                    {groupLabel}
                  </p>
                )}
                {items.map((item) => (
                  <GsItemRow
                    key={item.id}
                    item={item}
                    gs={gs}
                    model={model}
                    locked={locked}
                    onToggle={(on) => applyAndToast(item, on)}
                    onValue={(v) => {
                      const isNowActive = v !== null && v !== '' && v !== undefined
                      applyAndToast(item, isNowActive)
                      setGsValue(item.field!, v)
                    }}
                  />
                ))}
              </div>
            )
          })}

          {/* Extra args addon */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Extra args</label>
              {gs.extraArgs.length > 0 && !locked && (
                <button
                  onClick={() => onUpdate((m) => { if (m.gamescope) m.gamescope.extraArgs = [] })}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>
            <Input
              value={gs.extraArgs.join(' ')}
              disabled={locked}
              onChange={(e) => onUpdate((m) => {
                if (!m.gamescope) m.gamescope = emptyGamescope()
                m.gamescope.extraArgs = e.target.value ? e.target.value.split(/\s+/) : []
              })}
              placeholder="Additional flags not covered above"
              className="h-7 text-xs font-mono"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Generic item row ─────────────────────────────────────────────────────────
// Used for wrappers tab (and any future tabs without special features).
// Determines active state from the model via isItemActive; renders the
// control based on item.input.

function ItemRow({
  item, model, globalEnv, locked, onChange,
}: {
  item: Item
  model: LaunchOptionsModel
  globalEnv: Record<string, string>
  locked: boolean
  onChange: (on: boolean) => void
}) {
  const [infoOpen, setInfoOpen] = useState(false)
  const infoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!infoOpen) return
    const handler = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) setInfoOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [infoOpen])

  // Active state depends on section
  let active = false
  if (item.section === 'prefix-token') {
    active = (model as unknown as Record<string, unknown>)[item.modelField!] === true
  } else if (item.section === 'env') {
    active = model.env[item.envKey!] === item.envValue
  } else if (item.section === 'gamescope') {
    active = item.input === 'toggle'
      ? model.gamescope?.values[item.field!] === true
      : (model.gamescope?.values[item.field!] ?? null) !== null
  }

  const globalActive = item.section === 'prefix-token' && item.modelField === 'mangohud' && !!globalEnv['MANGOHUD']
  const activeConflicts = findConflicts(model, item, globalEnv)
  const isGlobalOnly = globalActive && !active

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors',
      active ? 'border-primary/30 bg-primary/8' : 'border-border bg-card/40'
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium">{item.label}</p>
          {isGlobalOnly && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 gap-0.5">
              <Lock className="h-2.5 w-2.5" /> set globally
            </Badge>
          )}
          {active && globalActive && (
            <Badge variant="outline" className="text-[10px] h-4 px-1">local + global</Badge>
          )}
          {activeConflicts.map((c) => (
            <Badge key={c.id} variant="outline" className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-500/80">
              conflicts with {c.label}
            </Badge>
          ))}
        </div>
        {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
      </div>

      <div className="relative shrink-0" ref={infoRef}>
        <button
          onClick={() => setInfoOpen((o) => !o)}
          className={cn('text-muted-foreground hover:text-foreground transition-colors', infoOpen && 'text-foreground')}
          aria-label="More info"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        {infoOpen && (
          <div className="absolute right-0 top-6 z-50 w-72 rounded-lg border border-border bg-popover shadow-lg p-3 space-y-1.5 text-xs">
            <p className="font-medium">{item.label}</p>
            <p className="text-muted-foreground leading-relaxed">{item.description}</p>
            {item.token && (
              <code className="block font-mono bg-muted/50 rounded px-2 py-1 text-[11px]">token: {item.token}</code>
            )}
            {item.docs && (
              <a href={item.docs} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary/80 hover:text-primary">
                <ExternalLink className="h-3 w-3" /> Documentation
              </a>
            )}
            {(item.relations?.conflictsWith ?? []).length > 0 && (
              <div className="text-amber-500/80">
                Conflicts with: {item.relations!.conflictsWith!.map((c) => c.target).join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      <Switch
        checked={active || isGlobalOnly}
        disabled={locked || isGlobalOnly}
        onCheckedChange={locked ? undefined : onChange}
      />
    </div>
  )
}

// ── Gamescope item row ───────────────────────────────────────────────────────
// Renders one row per gamescope catalog item; control chosen by item.input.

function GsItemRow({
  item, gs, model, locked, onToggle, onValue,
}: {
  item: Item
  gs: GamescopeConfig
  model: LaunchOptionsModel
  locked: boolean
  onToggle: (on: boolean) => void
  onValue: (v: GamescopeValue) => void
}) {
  const [infoOpen, setInfoOpen] = useState(false)
  const activeConflicts = findConflicts(model, item)

  if (item.input === 'toggle') {
    const isOn = gs.values[item.field!] === true
    return (
      <div className={cn(
        'flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors',
        isOn ? 'bg-primary/6' : 'hover:bg-muted/30'
      )}>
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={() => setInfoOpen((o) => !o)}
            className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title="More info"
          >
            <Info className="h-3 w-3" />
          </button>
          <span className="text-sm truncate">{item.label}</span>
          {activeConflicts.length > 0 && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/50 text-amber-500 shrink-0">
              conflict
            </Badge>
          )}
          {infoOpen && (
            <div className="absolute z-50 mt-1 max-w-xs rounded-md border border-border bg-popover p-3 text-xs shadow-lg space-y-1.5">
              {item.description && <p className="text-muted-foreground">{item.description}</p>}
              {item.docs && (
                <a href={item.docs} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> Docs
                </a>
              )}
            </div>
          )}
        </div>
        <Switch checked={isOn} disabled={locked} onCheckedChange={onToggle} />
      </div>
    )
  }

  const rawVal = gs.values[item.field!]
  const strVal = rawVal !== null && rawVal !== undefined ? String(rawVal) : ''

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors',
      strVal ? 'bg-primary/6' : 'hover:bg-muted/30'
    )}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <button
          onClick={() => setInfoOpen((o) => !o)}
          className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          title="More info"
        >
          <Info className="h-3 w-3" />
        </button>
        <span className="text-sm truncate">{item.label}</span>
        {activeConflicts.length > 0 && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/50 text-amber-500 shrink-0">
            conflict
          </Badge>
        )}
        {infoOpen && (
          <div className="absolute z-50 mt-1 max-w-xs rounded-md border border-border bg-popover p-3 text-xs shadow-lg space-y-1.5">
            {item.description && <p className="text-muted-foreground">{item.description}</p>}
            {item.docs && (
              <a href={item.docs} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Docs
              </a>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {strVal && !locked && (
          <button
            onClick={() => onValue(null)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
            title="Clear"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {item.input === 'enum' ? (
          <Select
            value={strVal || ''}
            onChange={(e) => onValue(e.target.value || null)}
            disabled={locked}
            className="h-6 text-xs w-32"
          >
            <option value="">—</option>
            {item.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </Select>
        ) : item.input === 'text' ? (
          <Input
            value={strVal}
            disabled={locked}
            onChange={(e) => onValue(e.target.value || null)}
            placeholder={item.placeholder ?? ''}
            className="h-6 text-xs w-28 font-mono"
          />
        ) : (
          <Input
            type="number"
            value={strVal}
            disabled={locked}
            min={item.min}
            max={item.max}
            step={item.step ?? (item.valueType === 'float' ? 0.1 : 1)}
            onChange={(e) => {
              if (!e.target.value) { onValue(null); return }
              const n = item.valueType === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value, 10)
              onValue(isNaN(n) ? null : n)
            }}
            placeholder={item.placeholder ?? ''}
            className="h-6 text-xs w-24"
          />
        )}
      </div>
    </div>
  )
}

// ── Env presets tab ─────────────────────────────────────────────────────────
// Retains: filter input, recently used, GPU-gated collapsibles, tri-state.
// All gated by the 'filter', 'gpuGroups', 'triState' features on the tab.

function EnvPresetsTab({
  model, onUpdate, applyAndToast, gpuInfo, globalEnv, locked, filter, onFilterChange, filterRef,
}: {
  model: LaunchOptionsModel
  onUpdate: (fn: (m: LaunchOptionsModel) => void) => void
  applyAndToast: (item: Item, on: boolean) => void
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
      (p.envKey ?? '').toLowerCase().includes(q) ||
      (p.envValue ?? '').toLowerCase().includes(q)
    )
  }

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
      (p.tier ?? 1) >= 2 &&
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

  const handleToggle = (preset: EnvPreset, action: 'on' | 'off' | 'inherit') => {
    if (locked) return
    if (action === 'on') touchRecent(preset.id)
    if (action === 'inherit') {
      onUpdate((m) => { Object.assign(m, clearPreset(m, preset)) })
      return
    }
    applyAndToast(preset, action === 'on')
  }

  return (
    <div className="space-y-3">
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
  const hasGlobal = (preset.envKey ?? '') in globalEnv

  const rowActive = isOn || isGlobalOn || isGlobalOther || isLocalOff

  const activeConflictsForRow = !isOn ? findConflicts(model, preset, globalEnv) : []

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
          {activeConflictsForRow.map((c) => (
            <Badge key={c.id} variant="outline" className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-500/80"
              title={preset.relations?.conflictsWith?.find((r) => r.target === c.id)?.reason}>
              conflicts with {c.label}
            </Badge>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {preset.envKey}={preset.envValue}
        </p>
      </div>

      <div className="relative mt-0.5" ref={infoRef}>
        <button
          onClick={() => setInfoOpen((o) => !o)}
          className={cn('text-muted-foreground hover:text-foreground transition-colors', infoOpen && 'text-foreground')}
          aria-label="More info"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        {infoOpen && (
          <div className="absolute right-0 top-6 z-50 w-72 rounded-lg border border-border bg-popover shadow-lg p-3 space-y-1.5 text-xs">
            <p className="font-medium">{preset.label}</p>
            <p className="text-muted-foreground leading-relaxed">{preset.description ?? preset.tooltip}</p>
            <code className="block font-mono bg-muted/50 rounded px-2 py-1 text-[11px]">
              {preset.envKey}={preset.envValue}
            </code>
            {preset.docs && (
              <a href={preset.docs} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary/80 hover:text-primary">
                <ExternalLink className="h-3 w-3" /> Documentation
              </a>
            )}
            {(preset.relations?.conflictsWith ?? []).length > 0 && (
              <div className="space-y-0.5">
                <p className="font-medium text-amber-500/80">Conflicts with:</p>
                {preset.relations!.conflictsWith!.map((c) => (
                  <p key={c.target} className="text-muted-foreground pl-2">• {c.target}: {c.reason}</p>
                ))}
              </div>
            )}
            {(preset.relations?.implies ?? []).length > 0 && (
              <div className="space-y-0.5">
                <p className="font-medium text-primary/80">Implies:</p>
                {preset.relations!.implies!.map((c) => (
                  <p key={c.target} className="text-muted-foreground pl-2">• {c.target}: {c.reason}</p>
                ))}
              </div>
            )}
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
                Forced OFF locally — <code className="font-mono">{preset.envKey}={globalEnv[preset.envKey!] === '1' ? '0' : '1'}</code> is written in your launch options to counter the global setting. Click <strong>Inherit</strong> to remove this override and let the global value apply again.
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
