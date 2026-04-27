/**
 * Pure TS port of scripts/launch_options_compose.py.
 * No Node.js dependencies — safe to import in both main and renderer.
 *
 * All item-level logic dispatches through section handlers (env /
 * prefix-token / gamescope). No hardcoded 'kind' switches.
 */

import {
  CATALOG_BY_ID,
  getItemsBySection,
  getGamescopeItems,
  buildGsFlagMap,
} from './catalog'
import type { Item } from './catalog'

// Re-export catalog types so consumers can import from a single location.
export type { Item, CatalogRelation, CatalogRelations, ItemSection, InputType, ValueType, CatalogTab, CatalogGroup } from './catalog'
export { CATALOG_BY_ID, CATALOG, CATALOG_TABS, getItemsBySection, getGamescopeItems, getItemsByTab, getTabById, getItemsForTabGrouped } from './catalog'
export { validateCatalog } from './catalog'

// Legacy accessor aliases re-exported for backward compat
export { getEnvPresets, getWrappers, getGamescopeToggles, getGamescopeArgs } from './catalog'

export const COMMAND_TOKEN = '%command%'

// ── Types ──────────────────────────────────────────────────────────────────

export type GamescopeValue = boolean | number | string | null

export interface GamescopeConfig {
  /** Keyed by catalog Item.field for gamescope items. */
  values: Record<string, GamescopeValue>
  extraArgs: string[]
}

export interface LaunchOptionsModel {
  env: Record<string, string>
  envOrder: string[]
  mangohud: boolean
  gamemode: boolean
  gamePerformance: boolean
  gamescope: GamescopeConfig | null
  suffixTokens: string[]
  unknownPrefixTokens: string[]
}

export function emptyModel(): LaunchOptionsModel {
  return {
    env: {},
    envOrder: [],
    mangohud: false,
    gamemode: false,
    gamePerformance: false,
    gamescope: null,
    suffixTokens: [],
    unknownPrefixTokens: [],
  }
}

export function emptyGamescope(): GamescopeConfig {
  const values: Record<string, GamescopeValue> = {}
  for (const item of getItemsBySection('gamescope')) {
    values[item.field!] = item.input === 'toggle' ? false : null
  }
  return { values, extraArgs: [] }
}

// ── Preset compatibility shim ───────────────────────────────────────────────

export type GpuFamily = 'amd' | 'nvidia' | 'any'
export type RiskLevel = 'safe' | 'experimental'

/** EnvPreset is an alias for Item with section=env, with a tooltip compat shim. */
export type EnvPreset = Item & { tooltip: string }

export const ENV_PRESETS: EnvPreset[] = getItemsBySection('env').map((p) => ({
  ...p,
  tooltip: p.description ?? `${p.envKey}=${p.envValue}`,
}))

export const PRESET_BY_ID = new Map(ENV_PRESETS.map((p) => [p.id, p]))

// ── Section handler interface ───────────────────────────────────────────────

interface SectionHandler {
  isActive(model: LaunchOptionsModel, item: Item, globalEnv: Record<string, string>): boolean
  setActive(model: LaunchOptionsModel, item: Item, on: boolean, globalEnv: Record<string, string>): LaunchOptionsModel
}

// ── env section handler ─────────────────────────────────────────────────────

const envHandler: SectionHandler = {
  isActive(model, item, globalEnv) {
    if (item.envKey === 'DXVK_HUD') {
      const v = (model.env['DXVK_HUD'] ?? '').trim().toLowerCase()
      if (!!v && !['0', 'false', 'no'].includes(v)) return true
      return globalEnv['DXVK_HUD'] === item.envValue
    }
    return model.env[item.envKey!] === item.envValue || globalEnv[item.envKey!] === item.envValue
  },
  setActive(model, item, on, globalEnv) {
    const preset = PRESET_BY_ID.get(item.id) ?? (item as EnvPreset)
    return setPreset(model, preset, on, globalEnv)
  },
}

// ── prefix-token section handler ────────────────────────────────────────────

const prefixTokenHandler: SectionHandler = {
  isActive(model, item) {
    return (model as unknown as Record<string, unknown>)[item.modelField!] === true
  },
  setActive(model, item, on) {
    const next = cloneModel(model)
    ;(next as unknown as Record<string, unknown>)[item.modelField!] = on
    return next
  },
}

// ── gamescope section handler ───────────────────────────────────────────────

const gamescopeHandler: SectionHandler = {
  isActive(model, item) {
    if (item.input === 'toggle') {
      return model.gamescope?.values[item.field!] === true
    }
    const v = model.gamescope?.values[item.field!]
    return v !== null && v !== undefined && v !== ''
  },
  setActive(model, item, on) {
    if (item.input === 'toggle') {
      const next = cloneModel(model)
      if (on && !next.gamescope) next.gamescope = emptyGamescope()
      if (next.gamescope) next.gamescope.values[item.field!] = on
      return next
    }
    // arg: turning off resets to null; turning on without value is a no-op (value set via UI)
    if (!on) {
      const next = cloneModel(model)
      if (next.gamescope) next.gamescope.values[item.field!] = null
      return next
    }
    return model
  },
}

// ── Section dispatch table ──────────────────────────────────────────────────

const SECTION_HANDLERS: Record<string, SectionHandler> = {
  env: envHandler,
  'prefix-token': prefixTokenHandler,
  gamescope: gamescopeHandler,
}

function getHandler(item: Item): SectionHandler {
  const h = SECTION_HANDLERS[item.section]
  if (!h) throw new Error(`Unknown section: ${item.section}`)
  return h
}

// ── Cross-item helpers (now section-dispatched) ────────────────────────────

export function isItemActive(
  model: LaunchOptionsModel,
  item: Item,
  globalEnv: Record<string, string> = {}
): boolean {
  return getHandler(item).isActive(model, item, globalEnv)
}

export function setItemActive(
  model: LaunchOptionsModel,
  item: Item,
  on: boolean,
  globalEnv: Record<string, string> = {}
): LaunchOptionsModel {
  return getHandler(item).setActive(model, item, on, globalEnv)
}

export function findConflicts(
  model: LaunchOptionsModel,
  item: Item,
  globalEnv: Record<string, string> = {}
): Item[] {
  const conflicts: Item[] = []
  for (const rel of item.relations?.conflictsWith ?? []) {
    const target = CATALOG_BY_ID.get(rel.target)
    if (target && isItemActive(model, target, globalEnv)) {
      conflicts.push(target)
    }
  }
  return conflicts
}

export function findImpliedItems(item: Item): Item[] {
  return (item.relations?.implies ?? [])
    .map((rel) => CATALOG_BY_ID.get(rel.target))
    .filter((t): t is Item => t !== undefined)
}

export function applyItemWithRelations(
  model: LaunchOptionsModel,
  item: Item,
  on: boolean,
  globalEnv: Record<string, string> = {}
): { model: LaunchOptionsModel; disabled: Item[]; enabled: Item[] } {
  if (!on) {
    return { model: setItemActive(model, item, false, globalEnv), disabled: [], enabled: [] }
  }

  let next = cloneModel(model)
  const disabled: Item[] = []
  const enabled: Item[] = []

  for (const conflict of findConflicts(next, item, globalEnv)) {
    next = setItemActive(next, conflict, false, globalEnv)
    disabled.push(conflict)
  }

  next = setItemActive(next, item, true, globalEnv)

  const visited = new Set<string>([item.id])
  for (const implied of findImpliedItems(item)) {
    if (visited.has(implied.id)) continue
    visited.add(implied.id)
    if (!isItemActive(next, implied, globalEnv)) {
      next = setItemActive(next, implied, true, globalEnv)
      enabled.push(implied)
    }
  }

  return { model: next, disabled, enabled }
}

// IDs grouped for the Overview section (env tab)
export const OVERVIEW_PRESET_IDS = new Set([
  'proton_log', 'dxvk_hud_fps', 'proton_wined3d', 'proton_no_esync', 'proton_no_fsync', 'proton_no_d3d11', 'vkbasalt',
])

export const BATCH_SNIPPETS = [
  { id: 'proton_log', label: 'PROTON_LOG=1', snippet: 'PROTON_LOG=1' },
  { id: 'mangohud', label: 'MangoHud', snippet: 'mangohud' },
  { id: 'gamemode', label: 'GameMode', snippet: 'gamemode' },
  { id: 'game_performance', label: 'game-performance', snippet: 'game-performance' },
  { id: 'mangohud_gamemode', label: 'MangoHud + GameMode', snippet: 'mangohud gamemode' },
  { id: 'proton_log_mangohud', label: 'PROTON_LOG=1 + MangoHud', snippet: 'PROTON_LOG=1 mangohud' },
  { id: 'wined3d', label: 'WineD3D (PROTON_USE_WINED3D=1)', snippet: 'PROTON_USE_WINED3D=1' },
  { id: 'fsr', label: 'WINE_FULLSCREEN_FSR=1', snippet: 'WINE_FULLSCREEN_FSR=1' },
  { id: 'esync', label: 'PROTON_NO_ESYNC=1', snippet: 'PROTON_NO_ESYNC=1' },
  { id: 'fsync', label: 'PROTON_NO_FSYNC=1', snippet: 'PROTON_NO_FSYNC=1' },
] as const

// ── Minimal shlex tokenizer ────────────────────────────────────────────────

function shlexSplit(s: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let inSingle = false
  let inDouble = false
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (inSingle) {
      if (ch === "'") { inSingle = false } else { cur += ch }
    } else if (inDouble) {
      if (ch === '"') { inDouble = false }
      else if (ch === '\\' && i + 1 < s.length) { cur += s[++i] }
      else { cur += ch }
    } else if (ch === "'") {
      inSingle = true
    } else if (ch === '"') {
      inDouble = true
    } else if (ch === '\\' && i + 1 < s.length) {
      cur += s[++i]
    } else if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (cur.length > 0) { tokens.push(cur); cur = '' }
    } else {
      cur += ch
    }
    i++
  }
  if (cur.length > 0) tokens.push(cur)
  return tokens
}

function shlexQuote(s: string): string {
  if (/^[a-zA-Z0-9_.~=@/:+-]+$/.test(s)) return s
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

function looksLikeEnvToken(t: string): boolean {
  if (!t.includes('=') || t.startsWith('=')) return false
  const key = t.split('=')[0]
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
}

// ── Prefix-token lookup (built lazily from catalog) ────────────────────────

let _prefixTokenMap: Map<string, Item> | null = null
function getPrefixTokenMap(): Map<string, Item> {
  if (!_prefixTokenMap) {
    _prefixTokenMap = new Map()
    for (const item of getItemsBySection('prefix-token')) {
      _prefixTokenMap.set(item.token!.toLowerCase(), item)
    }
  }
  return _prefixTokenMap
}

// ── Gamescope flag-map (built lazily) ──────────────────────────────────────

let _gsFlagMap: Map<string, Item> | null = null
function getGsFlagMap(): Map<string, Item> {
  if (!_gsFlagMap) _gsFlagMap = buildGsFlagMap()
  return _gsFlagMap
}

// ── Gamescope parser ───────────────────────────────────────────────────────

function parseGamescopeTokens(tokens: string[]): { cfg: GamescopeConfig; consumed: number } {
  const cfg = emptyGamescope()
  if (!tokens.length || tokens[0] !== 'gamescope') return { cfg, consumed: 0 }
  const flagMap = getGsFlagMap()
  let i = 1
  while (i < tokens.length) {
    const tok = tokens[i]
    if (tok === '--') { i++; break }

    const item = flagMap.get(tok)
    if (item) {
      if (item.input === 'toggle') {
        cfg.values[item.field!] = true
        i++
        continue
      }
      // arg: expects a value in the next token
      if (i + 1 < tokens.length) {
        const raw = tokens[i + 1]
        if (item.valueType === 'int') {
          const n = parseInt(raw, 10)
          if (!isNaN(n)) { cfg.values[item.field!] = n; i += 2; continue }
        } else if (item.valueType === 'float') {
          const n = parseFloat(raw)
          if (!isNaN(n)) { cfg.values[item.field!] = n; i += 2; continue }
        } else if (item.valueType === 'string') {
          cfg.values[item.field!] = raw; i += 2; continue
        }
        // enum: accept any value (validation is for UI only)
        cfg.values[item.field!] = raw; i += 2; continue
      }
    }

    // Unknown flag — preserve verbatim
    if (tok.startsWith('-')) {
      cfg.extraArgs.push(tok); i++
      if (i < tokens.length && !tokens[i].startsWith('-')) { cfg.extraArgs.push(tokens[i]); i++ }
      continue
    }
    cfg.extraArgs.push(tok); i++
  }
  return { cfg, consumed: i }
}

// ── Parse ──────────────────────────────────────────────────────────────────

function processTokensIntoModel(tokens: string[], model: LaunchOptionsModel): void {
  const prefixMap = getPrefixTokenMap()
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]

    if (looksLikeEnvToken(t)) {
      const eqIdx = t.indexOf('=')
      const k = t.slice(0, eqIdx)
      const v = t.slice(eqIdx + 1)
      if (!model.env[k]) model.envOrder.push(k)
      model.env[k] = v
      i++; continue
    }

    const prefixItem = prefixMap.get(t.toLowerCase())
    if (prefixItem) {
      ;(model as unknown as Record<string, unknown>)[prefixItem.modelField!] = true
      i++; continue
    }

    if (t === 'gamescope') {
      const { cfg, consumed } = parseGamescopeTokens(tokens.slice(i))
      if (consumed > 0) { model.gamescope = cfg; i += consumed; continue }
    }

    model.unknownPrefixTokens.push(t); i++
  }

  // Normalize MANGOHUD=1 in env → mangohud wrapper
  for (const k of Object.keys(model.env)) {
    if (k.toUpperCase() === 'MANGOHUD' && ['1', 'true', 'TRUE', 'yes'].includes(model.env[k])) {
      model.mangohud = true
      delete model.env[k]
      model.envOrder = model.envOrder.filter((e) => e !== k)
    }
  }
}

export function parseLaunchOptions(s: string): LaunchOptionsModel {
  const raw = (s || '').trim()
  const model = emptyModel()
  if (!raw) return model

  if (!raw.includes(COMMAND_TOKEN)) {
    try {
      const tokens = shlexSplit(raw)
      processTokensIntoModel(tokens, model)
    } catch {
      model.unknownPrefixTokens = [raw]
    }
    return model
  }

  const cmdIdx = raw.indexOf(COMMAND_TOKEN)
  const left = raw.slice(0, cmdIdx).trim()
  const right = raw.slice(cmdIdx + COMMAND_TOKEN.length).trim()

  try {
    const leftTokens = left ? shlexSplit(left) : []
    processTokensIntoModel(leftTokens, model)
  } catch {
    model.unknownPrefixTokens = left ? [left] : []
  }

  try {
    model.suffixTokens = right ? shlexSplit(right) : []
  } catch {
    model.suffixTokens = right ? [right] : []
  }

  return model
}

// ── Serialize ─────────────────────────────────────────────────────────────

function serializeGamescope(gs: GamescopeConfig): string[] {
  const out = ['gamescope']
  for (const item of getGamescopeItems()) {
    const v = gs.values[item.field!]
    if (item.input === 'toggle') {
      if (v === true) out.push(item.cliFlags![0])
    } else {
      if (v !== null && v !== undefined && v !== '') {
        out.push(item.cliFlags![0], String(v))
      }
    }
  }
  out.push(...gs.extraArgs)
  out.push('--')
  return out
}

export function serializeLaunchOptions(model: LaunchOptionsModel): string {
  const parts: string[] = []

  for (const t of model.unknownPrefixTokens) parts.push(shlexQuote(t))

  const seenEnv = new Set<string>()
  for (const key of model.envOrder) {
    if (model.env[key] !== undefined && !seenEnv.has(key)) {
      parts.push(shlexQuote(`${key}=${model.env[key]}`))
      seenEnv.add(key)
    }
  }
  for (const key of Object.keys(model.env).sort()) {
    if (!seenEnv.has(key)) {
      parts.push(shlexQuote(`${key}=${model.env[key]}`))
      seenEnv.add(key)
    }
  }

  // Emit prefix-token items in catalog order
  for (const item of getItemsBySection('prefix-token')) {
    if ((model as unknown as Record<string, unknown>)[item.modelField!] === true) {
      parts.push(item.token!)
    }
  }

  if (model.gamescope) parts.push(...serializeGamescope(model.gamescope).map(shlexQuote))

  const prefix = parts.join(' ').trim()
  const suf = model.suffixTokens.map(shlexQuote).join(' ').trim()
  const mid = COMMAND_TOKEN

  if (prefix && suf) return `${prefix} ${mid} ${suf}`
  if (prefix) return `${prefix} ${mid}`
  if (suf) return `${mid} ${suf}`
  return mid
}

// ── Model helpers ──────────────────────────────────────────────────────────

export function hasUnrepresentedTokens(model: LaunchOptionsModel): boolean {
  return model.unknownPrefixTokens.length > 0
}

export function isPresetActive(model: LaunchOptionsModel, preset: EnvPreset): boolean {
  if (preset.envKey === 'DXVK_HUD') {
    const v = (model.env['DXVK_HUD'] || '').trim().toLowerCase()
    return !!v && !['0', 'false', 'no'].includes(v)
  }
  return model.env[preset.envKey!] === preset.envValue
}

// ── Tri-state preset resolution ─────────────────────────────────────────────

export type PresetState =
  | { kind: 'off' }
  | { kind: 'on' }
  | { kind: 'local-off' }
  | { kind: 'global-on' }
  | { kind: 'global-other'; value: string }
  | { kind: 'local-overrides-global'; globalValue: string }

/**
 * Per-game env preset row: unset (omit from launch options), enabled (preset on value),
 * disabled (explicit counter / off). Wrappers and gamescope use separate models (boolean / null).
 */
export type LauncherPresetTriState = 'unset' | 'enabled' | 'disabled'

export function envPresetSupportsExplicitDisable(preset: EnvPreset): boolean {
  if (!preset.envKey || preset.envValue == null) return false
  return presetEnvOffValue(preset.envKey, preset.envValue) !== null
}

/** Maps full preset resolution to the three launcher positions for UI controls. */
export function presetLauncherTriState(
  model: LaunchOptionsModel,
  preset: EnvPreset,
  globalEnv: Record<string, string> = {}
): LauncherPresetTriState {
  const ps = presetState(model, preset, globalEnv)
  if (ps.kind === 'on' || ps.kind === 'local-overrides-global') return 'enabled'
  if (ps.kind === 'local-off') return 'disabled'
  return 'unset'
}

export function presetState(
  model: LaunchOptionsModel,
  preset: EnvPreset,
  globalEnv: Record<string, string> = {}
): PresetState {
  const localActive = isPresetActive(model, preset)
  const globalVal = globalEnv[preset.envKey!]
  const globalMatchesPreset = globalVal === preset.envValue
  const localVal = model.env[preset.envKey!]
  const offVal =
    preset.envKey && preset.envValue != null
      ? presetEnvOffValue(preset.envKey, preset.envValue)
      : null

  if (localActive) {
    if (globalVal !== undefined && !globalMatchesPreset) {
      return { kind: 'local-overrides-global', globalValue: globalVal }
    }
    return { kind: 'on' }
  }

  if (offVal !== null && localVal === offVal) {
    return { kind: 'local-off' }
  }

  if (globalVal !== undefined) {
    if (globalMatchesPreset) return { kind: 'global-on' }
    return { kind: 'global-other', value: globalVal }
  }

  return { kind: 'off' }
}

export function presetEnvOffValue(envKey: string, valueWhenOn: string): string | null {
  const v = valueWhenOn.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return '0'
  if (['0', 'false', 'no', 'off'].includes(v)) return '1'
  if (envKey === 'DXVK_HUD') return '0'
  return null
}

export function clearPreset(model: LaunchOptionsModel, preset: EnvPreset): LaunchOptionsModel {
  const next = cloneModel(model)
  delete next.env[preset.envKey!]
  next.envOrder = next.envOrder.filter((k) => k !== preset.envKey)
  return next
}

export function setPreset(
  model: LaunchOptionsModel,
  preset: EnvPreset,
  on: boolean,
  globalEnv: Record<string, string> = {}
): LaunchOptionsModel {
  const next = cloneModel(model)
  if (on) {
    if (!next.env[preset.envKey!]) next.envOrder.push(preset.envKey!)
    next.env[preset.envKey!] = preset.envValue!
  } else {
    const offVal = presetEnvOffValue(preset.envKey!, preset.envValue!)
    if (offVal !== null) {
      if (!next.env[preset.envKey!]) next.envOrder.push(preset.envKey!)
      next.env[preset.envKey!] = offVal
      return next
    }
    delete next.env[preset.envKey!]
    next.envOrder = next.envOrder.filter((k) => k !== preset.envKey)
  }
  return next
}

export function cloneModel(model: LaunchOptionsModel): LaunchOptionsModel {
  return {
    env: { ...model.env },
    envOrder: [...model.envOrder],
    mangohud: model.mangohud,
    gamemode: model.gamemode,
    gamePerformance: model.gamePerformance,
    gamescope: model.gamescope
      ? { values: { ...model.gamescope.values }, extraArgs: [...model.gamescope.extraArgs] }
      : null,
    suffixTokens: [...model.suffixTokens],
    unknownPrefixTokens: [...model.unknownPrefixTokens],
  }
}

// ── Snippet helpers (batch) ────────────────────────────────────────────────

export function mergeSnippetPrefix(current: string, snippet: string): string {
  const sn = snippet.trim()
  const cur = (current || '').trim()
  if (!sn) return cur
  if (!cur) return `${sn} ${COMMAND_TOKEN}`
  if (cur.includes(COMMAND_TOKEN)) {
    const idx = cur.indexOf(COMMAND_TOKEN)
    const left = cur.slice(0, idx).trim()
    const tail = cur.slice(idx + COMMAND_TOKEN.length).trim()
    const newLeft = left ? `${sn} ${left}` : sn
    return tail ? `${newLeft} ${COMMAND_TOKEN} ${tail}` : `${newLeft} ${COMMAND_TOKEN}`
  }
  return `${sn} ${cur}`
}

export function hasSnippet(current: string, snippet: string): boolean {
  const tokens = snippet.trim().split(/\s+/)
  const curTokens = current.split(/\s+/)
  return tokens.every((t) => curTokens.includes(t))
}

export function removeSnippet(current: string, snippet: string): string {
  if (!snippet.trim()) return current
  const tokens = snippet.trim().split(/\s+/)
  let result = current
  for (const token of tokens) {
    result = result.replace(
      new RegExp(`(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'g'),
      ' '
    )
  }
  return result.trim().replace(/\s+/g, ' ')
}

// ── Token classification for preview rendering ──────────────────────────────

export type TokenKind = 'command' | 'wrapper' | 'env' | 'gamescope' | 'other'

export interface ClassifiedToken {
  raw: string
  kind: TokenKind
}

/** Wrapper token set built from catalog at import time. */
const WRAPPER_TOKENS: Set<string> = new Set(
  getItemsBySection('prefix-token').map((i) => i.token!.toLowerCase())
)

/** Gamescope flag regex built from catalog at import time. */
function buildGamesopeRegex(): RegExp {
  const flags = new Set<string>()
  for (const item of getItemsBySection('gamescope')) {
    for (const f of item.cliFlags ?? []) flags.add(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  }
  if (!flags.size) return /^$/
  return new RegExp(`^(${[...flags].join('|')})$`)
}

const GAMESCOPE_FLAGS = buildGamesopeRegex()

export function tokenize(raw: string): ClassifiedToken[] {
  if (!raw.trim()) return []
  const tokens = shlexSplit(raw)
  return tokens.map((t) => {
    if (t === COMMAND_TOKEN) return { raw: t, kind: 'command' }
    if (WRAPPER_TOKENS.has(t.toLowerCase())) return { raw: t, kind: 'wrapper' }
    if (/^[A-Z_][A-Z0-9_]+=/.test(t)) return { raw: t, kind: 'env' }
    if (GAMESCOPE_FLAGS.test(t)) return { raw: t, kind: 'gamescope' }
    return { raw: t, kind: 'other' }
  })
}

// ── Token-level diff for dirty preview ──────────────────────────────────────

export type DiffToken = { raw: string; status: 'same' | 'added' | 'removed'; kind: TokenKind }

export function diffTokens(before: string, after: string): DiffToken[] {
  const bTokens = tokenize(before)
  const aTokens = tokenize(after)
  if (!bTokens.length && !aTokens.length) return []

  const bRaw = bTokens.map((t) => t.raw)
  const aRaw = aTokens.map((t) => t.raw)

  const m = bRaw.length
  const n = aRaw.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = bRaw[i] === aRaw[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const result: DiffToken[] = []
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && bRaw[i] === aRaw[j]) {
      result.push({ raw: bRaw[i], status: 'same', kind: bTokens[i].kind })
      i++; j++
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ raw: aRaw[j], status: 'added', kind: aTokens[j].kind })
      j++
    } else {
      result.push({ raw: bRaw[i], status: 'removed', kind: bTokens[i].kind })
      i++
    }
  }
  return result
}

// ── Transform (6 batch ops) ────────────────────────────────────────────────

export type BatchOp = 'set' | 'prefix' | 'suffix' | 'replace' | 'clear' | 'snippet'

export interface TransformParams {
  op: BatchOp
  setValue?: string
  prefix?: string
  suffix?: string
  find?: string
  replaceWith?: string
  snippet?: string
}

export function transformLaunchOptions(current: string, params: TransformParams): string {
  const cur = current || ''
  switch (params.op) {
    case 'set':
      return params.setValue ?? ''
    case 'prefix': {
      const pfx = (params.prefix || '').trim()
      if (!pfx) return cur
      if (!cur) return pfx
      return `${pfx} ${cur}`
    }
    case 'suffix': {
      const sfx = (params.suffix || '').trim()
      if (!sfx) return cur
      if (!cur) return sfx
      return `${cur} ${sfx}`
    }
    case 'replace': {
      const find = params.find || ''
      if (!find) return cur
      return cur.split(find).join(params.replaceWith ?? '')
    }
    case 'clear':
      return ''
    case 'snippet':
      return mergeSnippetPrefix(cur, params.snippet || '')
    default:
      return cur
  }
}
