/**
 * Pure TS port of scripts/launch_options_compose.py.
 * No Node.js dependencies — safe to import in both main and renderer.
 */

export const COMMAND_TOKEN = '%command%'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GamescopeConfig {
  fullscreen: boolean
  hdr: boolean
  vrr: boolean
  frameLimit: number | null
  width: number | null
  height: number | null
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
  return { fullscreen: false, hdr: false, vrr: false, frameLimit: null, width: null, height: null, extraArgs: [] }
}

// ── Preset definitions ─────────────────────────────────────────────────────

export type GpuFamily = 'amd' | 'nvidia' | 'any'
export type RiskLevel = 'safe' | 'experimental'

export interface EnvPreset {
  id: string
  label: string
  tooltip: string
  tier: number
  risk: RiskLevel
  envKey: string
  envValue: string
  gpuFamily: GpuFamily
}

export const ENV_PRESETS: EnvPreset[] = [
  // Tier 1 — Overview / common
  { id: 'proton_log', label: 'Proton log file', tooltip: 'Writes ~/steam-<appid>.log for debugging (Valve FAQ).', tier: 1, risk: 'safe', envKey: 'PROTON_LOG', envValue: '1', gpuFamily: 'any' },
  { id: 'dxvk_hud_fps', label: 'DXVK HUD (fps)', tooltip: 'DXVK on-screen HUD with fps (Proton FAQ / DXVK README).', tier: 1, risk: 'safe', envKey: 'DXVK_HUD', envValue: 'fps', gpuFamily: 'any' },
  { id: 'proton_wined3d', label: 'WineD3D (OpenGL)', tooltip: 'Force OpenGL WineD3D instead of DXVK when Vulkan fails (lower performance).', tier: 1, risk: 'safe', envKey: 'PROTON_USE_WINED3D', envValue: '1', gpuFamily: 'any' },
  { id: 'proton_no_esync', label: 'Disable esync', tooltip: 'PROTON_NO_ESYNC=1 — try if you see stutter or sync issues.', tier: 1, risk: 'safe', envKey: 'PROTON_NO_ESYNC', envValue: '1', gpuFamily: 'any' },
  { id: 'proton_no_fsync', label: 'Disable fsync', tooltip: 'PROTON_NO_FSYNC=1 — try if you see stutter or sync issues.', tier: 1, risk: 'safe', envKey: 'PROTON_NO_FSYNC', envValue: '1', gpuFamily: 'any' },
  { id: 'proton_no_d3d11', label: 'Disable D3D11', tooltip: 'PROTON_NO_D3D11=1 — niche troubleshooting only.', tier: 1, risk: 'experimental', envKey: 'PROTON_NO_D3D11', envValue: '1', gpuFamily: 'any' },
  // Tier 2
  { id: 'proton_dxvk_lowlatency', label: 'DXVK low latency', tooltip: 'PROTON_DXVK_LOWLATENCY=1 — low-latency DXVK path (tool/version-dependent).', tier: 2, risk: 'experimental', envKey: 'PROTON_DXVK_LOWLATENCY', envValue: '1', gpuFamily: 'any' },
  { id: 'vkbasalt', label: 'vkBasalt', tooltip: 'ENABLE_VKBASALT=1 — requires vkBasalt installed and configured.', tier: 2, risk: 'safe', envKey: 'ENABLE_VKBASALT', envValue: '1', gpuFamily: 'any' },
  // Tier 3 — General tweaks
  { id: 'steamdeck_off', label: 'Disable Steam Deck profile', tooltip: 'SteamDeck=0 — some titles behave better without Deck hints.', tier: 3, risk: 'safe', envKey: 'SteamDeck', envValue: '0', gpuFamily: 'any' },
  { id: 'proton_wayland', label: 'Proton Wayland', tooltip: 'PROTON_ENABLE_WAYLAND=1 — experimental; can break overlay / input.', tier: 3, risk: 'experimental', envKey: 'PROTON_ENABLE_WAYLAND', envValue: '1', gpuFamily: 'any' },
  { id: 'proton_no_steaminput', label: 'Disable Steam Input', tooltip: 'PROTON_NO_STEAMINPUT=1 — controller / overlay workarounds.', tier: 3, risk: 'experimental', envKey: 'PROTON_NO_STEAMINPUT', envValue: '1', gpuFamily: 'any' },
  { id: 'proton_prefer_sdl', label: 'Prefer SDL controller', tooltip: 'PROTON_PREFER_SDL=1 — workaround for pad detection.', tier: 3, risk: 'safe', envKey: 'PROTON_PREFER_SDL', envValue: '1', gpuFamily: 'any' },
  { id: 'proton_local_shader_cache', label: 'Local shader cache', tooltip: 'PROTON_LOCAL_SHADER_CACHE=1 — per-game shader cache isolation.', tier: 3, risk: 'safe', envKey: 'PROTON_LOCAL_SHADER_CACHE', envValue: '1', gpuFamily: 'any' },
  { id: 'proton_hdr', label: 'HDR output', tooltip: 'PROTON_ENABLE_HDR=1 — requires capable display and game.', tier: 3, risk: 'experimental', envKey: 'PROTON_ENABLE_HDR', envValue: '1', gpuFamily: 'any' },
  { id: 'proton_ntsync_off', label: 'Prefer FSync over NTSync', tooltip: 'PROTON_USE_NTSYNC=0 — ProtonPlus-style FSync preference.', tier: 3, risk: 'experimental', envKey: 'PROTON_USE_NTSYNC', envValue: '0', gpuFamily: 'any' },
  { id: 'scb_auto_hdr', label: 'Scopebuddy Auto HDR', tooltip: 'SCB_AUTO_HDR=1 — with scopebuddy wrapper if used.', tier: 3, risk: 'experimental', envKey: 'SCB_AUTO_HDR', envValue: '1', gpuFamily: 'any' },
  { id: 'scb_auto_vrr', label: 'Scopebuddy Auto VRR', tooltip: 'SCB_AUTO_VRR=1', tier: 3, risk: 'experimental', envKey: 'SCB_AUTO_VRR', envValue: '1', gpuFamily: 'any' },
  // Tier 4 — AMD
  { id: 'mesa_anti_lag', label: 'Mesa Anti-Lag', tooltip: 'ENABLE_LAYER_MESA_ANTI_LAG=1 — AMD Mesa latency layer.', tier: 4, risk: 'experimental', envKey: 'ENABLE_LAYER_MESA_ANTI_LAG', envValue: '1', gpuFamily: 'amd' },
  { id: 'mesa_anti_lag_disable', label: 'Disable Mesa Anti-Lag', tooltip: 'DISABLE_LAYER_MESA_ANTI_LAG=1 — turns the Mesa anti-lag layer off.', tier: 4, risk: 'safe', envKey: 'DISABLE_LAYER_MESA_ANTI_LAG', envValue: '1', gpuFamily: 'amd' },
  { id: 'dri_prime', label: 'Use AMD dGPU (DRI_PRIME)', tooltip: 'DRI_PRIME=1 — hybrid graphics hint.', tier: 4, risk: 'safe', envKey: 'DRI_PRIME', envValue: '1', gpuFamily: 'amd' },
  { id: 'proton_hide_apu', label: 'Hide AMD APU', tooltip: 'PROTON_HIDE_APU=1 — mis-detection workaround.', tier: 4, risk: 'experimental', envKey: 'PROTON_HIDE_APU', envValue: '1', gpuFamily: 'amd' },
  { id: 'proton_fsr4', label: 'FSR 4 upgrade', tooltip: 'PROTON_FSR4_UPGRADE=1 — bleeding-edge Proton feature.', tier: 4, risk: 'experimental', envKey: 'PROTON_FSR4_UPGRADE', envValue: '1', gpuFamily: 'amd' },
  { id: 'proton_fsr4_rdna3', label: 'FSR 4 RDNA3 upgrade', tooltip: 'PROTON_FSR4_RDNA3_UPGRADE=1', tier: 4, risk: 'experimental', envKey: 'PROTON_FSR4_RDNA3_UPGRADE', envValue: '1', gpuFamily: 'amd' },
  // Tier 4 — NVIDIA
  { id: 'proton_nvapi', label: 'NVAPI (NVIDIA)', tooltip: 'PROTON_ENABLE_NVAPI=1 — DLSS / NVAPI paths.', tier: 4, risk: 'experimental', envKey: 'PROTON_ENABLE_NVAPI', envValue: '1', gpuFamily: 'nvidia' },
  { id: 'proton_ngx_updater', label: 'Update DLSS (NGX)', tooltip: 'PROTON_ENABLE_NGX_UPDATER=1', tier: 4, risk: 'experimental', envKey: 'PROTON_ENABLE_NGX_UPDATER', envValue: '1', gpuFamily: 'nvidia' },
  { id: 'proton_hide_nvidia', label: 'Hide NVIDIA GPU', tooltip: 'PROTON_HIDE_NVIDIA_GPU=1 — workaround for some titles.', tier: 4, risk: 'experimental', envKey: 'PROTON_HIDE_NVIDIA_GPU', envValue: '1', gpuFamily: 'nvidia' },
  { id: 'proton_dlss_indicator', label: 'DLSS indicator', tooltip: 'PROTON_DLSS_INDICATOR=1', tier: 4, risk: 'experimental', envKey: 'PROTON_DLSS_INDICATOR', envValue: '1', gpuFamily: 'nvidia' },
  { id: 'proton_nvidia_libs', label: 'NVIDIA libraries', tooltip: 'PROTON_NVIDIA_LIBS=1 — PhysX/CUDA style paths.', tier: 4, risk: 'experimental', envKey: 'PROTON_NVIDIA_LIBS', envValue: '1', gpuFamily: 'nvidia' },
  { id: 'proton_xess', label: 'XeSS upgrade', tooltip: 'PROTON_XESS_UPGRADE=1 — Intel XeSS.', tier: 4, risk: 'experimental', envKey: 'PROTON_XESS_UPGRADE', envValue: '1', gpuFamily: 'any' },
]

export const PRESET_BY_ID = new Map(ENV_PRESETS.map((p) => [p.id, p]))

// IDs grouped for the Overview section
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

// ── Gamescope parser ───────────────────────────────────────────────────────

function parseGamescopeTokens(tokens: string[]): { cfg: GamescopeConfig; consumed: number } {
  const cfg = emptyGamescope()
  if (!tokens.length || tokens[0] !== 'gamescope') return { cfg, consumed: 0 }
  let i = 1
  while (i < tokens.length) {
    const tok = tokens[i]
    if (tok === '-f' || tok === '--fullscreen') { cfg.fullscreen = true; i++; continue }
    if (tok === '--hdr-enabled' || tok === '--hdr') { cfg.hdr = true; i++; continue }
    if (tok === '-O' || tok === '--adaptive-sync' || tok === '--vr') { cfg.vrr = true; i++; continue }
    if ((tok === '-r' || tok === '--framerate' || tok === '-R') && i + 1 < tokens.length && /^\d+$/.test(tokens[i + 1])) {
      cfg.frameLimit = parseInt(tokens[i + 1]); i += 2; continue
    }
    if ((tok === '-W' || tok === '--output-width') && i + 1 < tokens.length && /^\d+$/.test(tokens[i + 1])) {
      cfg.width = parseInt(tokens[i + 1]); i += 2; continue
    }
    if ((tok === '-H' || tok === '--output-height') && i + 1 < tokens.length && /^\d+$/.test(tokens[i + 1])) {
      cfg.height = parseInt(tokens[i + 1]); i += 2; continue
    }
    if (tok === '--') { i++; break }
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
    if (t.toLowerCase() === 'mangohud') { model.mangohud = true; i++; continue }
    if (t === 'gamemode') { model.gamemode = true; i++; continue }
    if (t === 'game-performance') { model.gamePerformance = true; i++; continue }
    if (t === 'gamescope') {
      const { cfg, consumed } = parseGamescopeTokens(tokens.slice(i))
      if (consumed > 0) { model.gamescope = cfg; i += consumed; continue }
    }
    model.unknownPrefixTokens.push(t); i++
  }
  // Normalize: MANGOHUD=1 in env → mangohud wrapper
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
  if (gs.fullscreen) out.push('-f')
  if (gs.hdr) out.push('--hdr-enabled')
  if (gs.vrr) out.push('-O')
  if (gs.width !== null) out.push('-W', String(gs.width))
  if (gs.height !== null) out.push('-H', String(gs.height))
  if (gs.frameLimit !== null) out.push('-r', String(gs.frameLimit))
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

  if (model.mangohud) parts.push('mangohud')
  if (model.gamemode) parts.push('gamemode')
  if (model.gamePerformance) parts.push('game-performance')

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
  return model.env[preset.envKey] === preset.envValue
}

// ── Tri-state preset resolution ─────────────────────────────────────────────

/**
 * Describes how a preset relates to both the local model and global
 * user_settings.py overrides.
 *
 * - off              — not active locally, no global setting for this key
 * - on               — active in local launch options (no conflicting global)
 * - global-on        — user_settings.py sets this env key to preset's exact value; no local override
 * - global-other     — user_settings.py sets this env key but to a different value; no local override
 * - local-overrides-global — local is active AND global sets a different value for the same key
 */
export type PresetState =
  | { kind: 'off' }
  | { kind: 'on' }
  | { kind: 'local-off' }                                     // explicitly forced off via counter-value (KEY=0) against a global
  | { kind: 'global-on' }
  | { kind: 'global-other'; value: string }
  | { kind: 'local-overrides-global'; globalValue: string }

/** Classify the combined state of a preset given the current model and the
 *  global env overrides extracted from user_settings.py. */
export function presetState(
  model: LaunchOptionsModel,
  preset: EnvPreset,
  globalEnv: Record<string, string> = {}
): PresetState {
  const localActive = isPresetActive(model, preset)
  const globalVal = globalEnv[preset.envKey]
  const globalMatchesPreset = globalVal === preset.envValue
  const localVal = model.env[preset.envKey]

  if (localActive) {
    if (globalVal !== undefined && !globalMatchesPreset) {
      return { kind: 'local-overrides-global', globalValue: globalVal }
    }
    return { kind: 'on' }
  }

  // Detect explicit local off-value that counters a global — e.g. KEY=0 written
  // by presetEnvOffValue when user disabled a globally-set preset.
  if (globalVal !== undefined) {
    const offVal = presetEnvOffValue(preset.envKey, preset.envValue)
    if (offVal !== null && localVal === offVal) {
      // User has explicitly forced this off with a counter-value — distinct from plain 'off'
      return { kind: 'local-off' }
    }
    if (globalMatchesPreset) return { kind: 'global-on' }
    return { kind: 'global-other', value: globalVal }
  }

  return { kind: 'off' }
}

/**
 * Best-effort "off" override value for a given preset env key.
 * When user_settings.py globally enables a preset (e.g. PROTON_NO_ESYNC=1),
 * toggling the preset OFF in the UI must write an explicit counter-value (e.g. =0)
 * into the local launch options so Steam's wine/Proton layer sees the override.
 * Mirrors Python's `preset_env_off_value()`.
 */
export function presetEnvOffValue(envKey: string, valueWhenOn: string): string | null {
  const v = valueWhenOn.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return '0'
  if (['0', 'false', 'no', 'off'].includes(v)) return '1'
  if (envKey === 'DXVK_HUD') return '0'
  return null
}

/** Remove a preset's env key entirely, reverting to "inherit global" state.
 *  Use this when the user wants to stop overriding a globally-set value. */
export function clearPreset(model: LaunchOptionsModel, preset: EnvPreset): LaunchOptionsModel {
  const next = cloneModel(model)
  delete next.env[preset.envKey]
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
    if (!next.env[preset.envKey]) next.envOrder.push(preset.envKey)
    next.env[preset.envKey] = preset.envValue
  } else {
    // If a global user_settings.py value exists for this key, write the explicit
    // off-value (e.g. KEY=0) so the local launch option counters the global setting.
    // This mirrors Python's apply_to_model logic (lines 360-366).
    const hasGlobal = preset.envKey in globalEnv
    if (hasGlobal) {
      const offVal = presetEnvOffValue(preset.envKey, preset.envValue)
      if (offVal !== null) {
        if (!next.env[preset.envKey]) next.envOrder.push(preset.envKey)
        next.env[preset.envKey] = offVal
        return next
      }
    }
    delete next.env[preset.envKey]
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
    gamescope: model.gamescope ? { ...model.gamescope, extraArgs: [...model.gamescope.extraArgs] } : null,
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

const WRAPPER_TOKENS = new Set(['mangohud', 'gamemode', 'game-performance'])
const GAMESCOPE_FLAGS = /^(-[WHrfO]|--hdr-enabled|--expose-wayland|--adaptive-sync)/

/** Classify each token in a raw launch options string for syntax-highlighted rendering. */
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

/** Produce a token-level diff between two raw launch option strings.
 *  Uses a simple LCS-based diffing over the token arrays. */
export function diffTokens(before: string, after: string): DiffToken[] {
  const bTokens = tokenize(before)
  const aTokens = tokenize(after)
  if (!bTokens.length && !aTokens.length) return []

  const bRaw = bTokens.map((t) => t.raw)
  const aRaw = aTokens.map((t) => t.raw)

  // LCS table
  const m = bRaw.length
  const n = aRaw.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = bRaw[i] === aRaw[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  // Backtrack
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
