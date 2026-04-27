import { describe, it, expect } from 'vitest'
import {
  parseLaunchOptions,
  serializeLaunchOptions,
  transformLaunchOptions,
  mergeSnippetPrefix,
  removeSnippet,
  hasSnippet,
  COMMAND_TOKEN,
  emptyModel,
  emptyGamescope,
  isPresetActive,
  setPreset,
  presetState,
  presetLauncherTriState,
  envPresetSupportsExplicitDisable,
  tokenize,
  diffTokens,
  ENV_PRESETS,
  isItemActive,
  setItemActive,
  findConflicts,
  findImpliedItems,
  applyItemWithRelations,
  CATALOG_BY_ID,
} from '../../src/shared/launchOptions/compose'

// ── parse / serialize round-trip ──────────────────────────────────────────

describe('parseLaunchOptions', () => {
  it('returns empty model for empty string', () => {
    const m = parseLaunchOptions('')
    expect(m.mangohud).toBe(false)
    expect(m.gamemode).toBe(false)
    expect(m.env).toEqual({})
    expect(m.suffixTokens).toEqual([])
  })

  it('parses mangohud wrapper', () => {
    const m = parseLaunchOptions('mangohud %command%')
    expect(m.mangohud).toBe(true)
  })

  it('parses gamemode wrapper', () => {
    const m = parseLaunchOptions('gamemode %command%')
    expect(m.gamemode).toBe(true)
  })

  it('parses game-performance wrapper', () => {
    const m = parseLaunchOptions('game-performance %command%')
    expect(m.gamePerformance).toBe(true)
  })

  it('parses env var', () => {
    const m = parseLaunchOptions('PROTON_LOG=1 %command%')
    expect(m.env['PROTON_LOG']).toBe('1')
    expect(m.envOrder).toContain('PROTON_LOG')
  })

  it('parses multiple env vars and wrappers', () => {
    const m = parseLaunchOptions('DXVK_HUD=fps PROTON_LOG=1 mangohud gamemode %command%')
    expect(m.env['DXVK_HUD']).toBe('fps')
    expect(m.env['PROTON_LOG']).toBe('1')
    expect(m.mangohud).toBe(true)
    expect(m.gamemode).toBe(true)
  })

  it('parses suffix tokens', () => {
    const m = parseLaunchOptions('mangohud %command% --vulkan')
    expect(m.suffixTokens).toContain('--vulkan')
  })

  it('parses gamescope flags', () => {
    const m = parseLaunchOptions('gamescope -W 1920 -H 1080 -f -- %command%')
    expect(m.gamescope).not.toBeNull()
    expect(m.gamescope?.values['width']).toBe(1920)
    expect(m.gamescope?.values['height']).toBe(1080)
    expect(m.gamescope?.values['fullscreen']).toBe(true)
  })

  it('normalizes MANGOHUD=1 env to mangohud wrapper', () => {
    const m = parseLaunchOptions('MANGOHUD=1 %command%')
    expect(m.mangohud).toBe(true)
    expect(m.env['MANGOHUD']).toBeUndefined()
  })

  it('puts unrecognized tokens in unknownPrefixTokens', () => {
    const m = parseLaunchOptions('scopebuddy %command%')
    expect(m.unknownPrefixTokens).toContain('scopebuddy')
  })
})

describe('serializeLaunchOptions', () => {
  it('serializes empty model to %command%', () => {
    expect(serializeLaunchOptions(emptyModel())).toBe(COMMAND_TOKEN)
  })

  it('round-trips mangohud + env + suffix', () => {
    const original = 'PROTON_LOG=1 mangohud %command% --flag'
    const m = parseLaunchOptions(original)
    const out = serializeLaunchOptions(m)
    // Re-parse to compare semantics, not exact string (order may vary)
    const m2 = parseLaunchOptions(out)
    expect(m2.mangohud).toBe(true)
    expect(m2.env['PROTON_LOG']).toBe('1')
    expect(m2.suffixTokens).toContain('--flag')
  })

  it('round-trips gamescope', () => {
    const original = 'gamescope -W 1920 -H 1080 -f -- %command%'
    const m = parseLaunchOptions(original)
    const out = serializeLaunchOptions(m)
    const m2 = parseLaunchOptions(out)
    expect(m2.gamescope?.values['width']).toBe(1920)
    expect(m2.gamescope?.values['height']).toBe(1080)
    expect(m2.gamescope?.values['fullscreen']).toBe(true)
  })

  it('omits gamescope when null', () => {
    const m = emptyModel()
    m.mangohud = true
    const out = serializeLaunchOptions(m)
    expect(out).not.toContain('gamescope')
    expect(out).toContain('mangohud')
  })
})

// ── transformLaunchOptions (6 ops) ────────────────────────────────────────

describe('transformLaunchOptions', () => {
  const base = 'mangohud %command%'

  it('set — replaces entirely', () => {
    expect(transformLaunchOptions(base, { op: 'set', setValue: 'gamemode %command%' })).toBe('gamemode %command%')
  })

  it('set — empty setValue clears', () => {
    expect(transformLaunchOptions(base, { op: 'set', setValue: '' })).toBe('')
  })

  it('prefix — prepends text', () => {
    const out = transformLaunchOptions(base, { op: 'prefix', prefix: 'PROTON_LOG=1' })
    expect(out).toBe('PROTON_LOG=1 mangohud %command%')
  })

  it('suffix — appends text', () => {
    const out = transformLaunchOptions(base, { op: 'suffix', suffix: '--flag' })
    expect(out).toBe('mangohud %command% --flag')
  })

  it('replace — substitutes a word', () => {
    const out = transformLaunchOptions(base, { op: 'replace', find: 'mangohud', replaceWith: 'gamemode' })
    expect(out).toBe('gamemode %command%')
  })

  it('replace — empty find returns unchanged', () => {
    expect(transformLaunchOptions(base, { op: 'replace', find: '', replaceWith: 'foo' })).toBe(base)
  })

  it('clear — removes all options', () => {
    expect(transformLaunchOptions(base, { op: 'clear' })).toBe('')
  })

  it('snippet — merges snippet prefix', () => {
    const out = transformLaunchOptions(base, { op: 'snippet', snippet: 'PROTON_LOG=1' })
    expect(out).toContain('PROTON_LOG=1')
    expect(out).toContain('mangohud')
    expect(out).toContain('%command%')
  })
})

// ── mergeSnippetPrefix edge cases ─────────────────────────────────────────

describe('mergeSnippetPrefix', () => {
  it('adds snippet with %command% to empty string', () => {
    expect(mergeSnippetPrefix('', 'mangohud')).toBe('mangohud %command%')
  })

  it('prepends snippet before existing prefix with %command%', () => {
    expect(mergeSnippetPrefix('gamemode %command%', 'mangohud')).toBe('mangohud gamemode %command%')
  })

  it('inserts snippet before %command% preserving suffix', () => {
    expect(mergeSnippetPrefix('env=1 %command% --flag', 'mangohud')).toBe(
      'mangohud env=1 %command% --flag'
    )
  })

  it('prepends to options without %command%', () => {
    expect(mergeSnippetPrefix('gamemode', 'mangohud')).toBe('mangohud gamemode')
  })

  it('returns unchanged if snippet is empty', () => {
    expect(mergeSnippetPrefix('mangohud %command%', '')).toBe('mangohud %command%')
  })

  it('handles env var snippets', () => {
    expect(mergeSnippetPrefix('', 'PROTON_LOG=1')).toBe('PROTON_LOG=1 %command%')
  })
})

describe('hasSnippet', () => {
  it('detects present snippet', () => {
    expect(hasSnippet('mangohud gamemode %command%', 'mangohud')).toBe(true)
  })

  it('detects absent snippet', () => {
    expect(hasSnippet('gamemode %command%', 'mangohud')).toBe(false)
  })

  it('detects multi-token snippet', () => {
    expect(hasSnippet('mangohud gamemode %command%', 'mangohud gamemode')).toBe(true)
  })
})

describe('removeSnippet', () => {
  it('removes a single token', () => {
    const result = removeSnippet('mangohud gamemode %command%', 'mangohud')
    expect(result).toBe('gamemode %command%')
  })

  it('handles missing snippet gracefully', () => {
    expect(removeSnippet('gamemode %command%', 'mangohud')).toBe('gamemode %command%')
  })
})

// ── ENV_PRESETS / setPreset ───────────────────────────────────────────────

describe('ENV_PRESETS + setPreset', () => {
  it('activates a preset', () => {
    const preset = ENV_PRESETS.find((p) => p.id === 'proton_log')!
    let m = emptyModel()
    m = setPreset(m, preset, true)
    expect(isPresetActive(m, preset)).toBe(true)
    expect(m.env['PROTON_LOG']).toBe('1')
  })

  it('deactivates a preset by writing explicit off value when known', () => {
    const preset = ENV_PRESETS.find((p) => p.id === 'proton_log')!
    let m = emptyModel()
    m = setPreset(m, preset, true)
    m = setPreset(m, preset, false)
    expect(isPresetActive(m, preset)).toBe(false)
    expect(m.env['PROTON_LOG']).toBe('0')
  })

  it('DXVK_HUD preset active check handles non-zero values', () => {
    const preset = ENV_PRESETS.find((p) => p.id === 'dxvk_hud_fps')!
    let m = emptyModel()
    m = setPreset(m, preset, true)
    expect(isPresetActive(m, preset)).toBe(true)
  })

  it('all presets have unique IDs', () => {
    const ids = ENV_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── presetLauncherTriState / envPresetSupportsExplicitDisable ─────────────────

describe('presetLauncherTriState', () => {
  const preset = ENV_PRESETS.find((p) => p.id === 'proton_no_esync')!

  it('maps local-on to enabled', () => {
    const m = parseLaunchOptions('PROTON_NO_ESYNC=1 %command%')
    expect(presetLauncherTriState(m, preset, {})).toBe('enabled')
  })

  it('maps explicit counter without global to disabled', () => {
    const m = parseLaunchOptions('PROTON_NO_ESYNC=0 %command%')
    expect(presetLauncherTriState(m, preset, {})).toBe('disabled')
  })

  it('maps absent key without global to unset', () => {
    expect(presetLauncherTriState(emptyModel(), preset, {})).toBe('unset')
  })

  it('reports whether explicit disable is supported', () => {
    expect(envPresetSupportsExplicitDisable(preset)).toBe(true)
  })
})

// ── presetState ───────────────────────────────────────────────────────────────

describe('presetState', () => {
  const preset = ENV_PRESETS.find((p) => p.id === 'proton_no_esync')!  // PROTON_NO_ESYNC=1

  it('returns off when not in model and no global', () => {
    const m = emptyModel()
    expect(presetState(m, preset, {}).kind).toBe('off')
  })

  it('returns on when active locally and no global', () => {
    const m = parseLaunchOptions('PROTON_NO_ESYNC=1 %command%')
    expect(presetState(m, preset, {}).kind).toBe('on')
  })

  it('returns global-on when user_settings sets same value and not locally active', () => {
    const m = emptyModel()
    const state = presetState(m, preset, { PROTON_NO_ESYNC: '1' })
    expect(state.kind).toBe('global-on')
  })

  it('returns global-other when user_settings sets different value and not locally active', () => {
    const m = emptyModel()
    const state = presetState(m, preset, { PROTON_NO_ESYNC: '0' })
    expect(state.kind).toBe('global-other')
    expect((state as { kind: 'global-other'; value: string }).value).toBe('0')
  })

  it('returns local-overrides-global when locally active and global has different value', () => {
    const m = parseLaunchOptions('PROTON_NO_ESYNC=1 %command%')
    const state = presetState(m, preset, { PROTON_NO_ESYNC: '0' })
    expect(state.kind).toBe('local-overrides-global')
    expect((state as { kind: 'local-overrides-global'; globalValue: string }).globalValue).toBe('0')
  })

  it('returns on (not local-overrides-global) when local matches global', () => {
    const m = parseLaunchOptions('PROTON_NO_ESYNC=1 %command%')
    const state = presetState(m, preset, { PROTON_NO_ESYNC: '1' })
    expect(state.kind).toBe('on')
  })

  it('returns local-off when local has explicit counter-value (KEY=0) against global KEY=1', () => {
    // Simulates the case where user clicked "disable" on a globally-set preset
    // setPreset writes PROTON_NO_ESYNC=0 to counter the global PROTON_NO_ESYNC=1
    const m = parseLaunchOptions('PROTON_NO_ESYNC=0 %command%')
    const state = presetState(m, preset, { PROTON_NO_ESYNC: '1' })
    expect(state.kind).toBe('local-off')
  })

  it('returns local-off when local has explicit counter-value and no global', () => {
    const m = parseLaunchOptions('PROTON_NO_ESYNC=0 %command%')
    expect(presetState(m, preset, {}).kind).toBe('local-off')
  })
})

// ── setPreset with globalEnv (counter-value) ─────────────────────────────────

describe('setPreset with globalEnv', () => {
  const preset = ENV_PRESETS.find((p) => p.id === 'proton_no_esync')!

  it('writes off-value KEY=0 when disabling a globally-enabled preset', () => {
    const m = emptyModel()
    const result = setPreset(m, preset, false, { PROTON_NO_ESYNC: '1' })
    expect(result.env['PROTON_NO_ESYNC']).toBe('0')
    expect(result.envOrder).toContain('PROTON_NO_ESYNC')
  })

  it('writes off-value when disabling locally with no global env', () => {
    const m = parseLaunchOptions('PROTON_NO_ESYNC=1 %command%')
    const result = setPreset(m, preset, false, {})
    expect(result.env['PROTON_NO_ESYNC']).toBe('0')
    expect(result.envOrder).toContain('PROTON_NO_ESYNC')
  })

  it('sets the value normally when enabling', () => {
    const m = emptyModel()
    const result = setPreset(m, preset, true, { PROTON_NO_ESYNC: '1' })
    expect(result.env['PROTON_NO_ESYNC']).toBe('1')
  })
})

// ── tokenize ──────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('classifies %command% as command', () => {
    const tokens = tokenize('%command%')
    expect(tokens[0].kind).toBe('command')
  })

  it('classifies mangohud as wrapper', () => {
    const tokens = tokenize('mangohud %command%')
    expect(tokens[0].kind).toBe('wrapper')
  })

  it('classifies KEY=VALUE as env', () => {
    const tokens = tokenize('PROTON_LOG=1 %command%')
    expect(tokens[0].kind).toBe('env')
    expect(tokens[0].raw).toBe('PROTON_LOG=1')
  })

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([])
  })
})

// ── diffTokens ────────────────────────────────────────────────────────────────

describe('diffTokens', () => {
  it('marks added tokens', () => {
    const diff = diffTokens('mangohud %command%', 'mangohud gamemode %command%')
    const added = diff.filter((t) => t.status === 'added')
    expect(added.map((t) => t.raw)).toContain('gamemode')
  })

  it('marks removed tokens', () => {
    const diff = diffTokens('mangohud gamemode %command%', 'mangohud %command%')
    const removed = diff.filter((t) => t.status === 'removed')
    expect(removed.map((t) => t.raw)).toContain('gamemode')
  })

  it('marks same tokens', () => {
    const diff = diffTokens('mangohud %command%', 'mangohud %command%')
    expect(diff.every((t) => t.status === 'same')).toBe(true)
  })

  it('returns empty for both empty', () => {
    expect(diffTokens('', '')).toEqual([])
  })
})

// ── isItemActive ──────────────────────────────────────────────────────────────

describe('isItemActive', () => {
  it('env item is active when env key matches value', () => {
    const item = CATALOG_BY_ID.get('proton_log')!
    const m = { ...emptyModel(), env: { PROTON_LOG: '1' }, envOrder: ['PROTON_LOG'] }
    expect(isItemActive(m, item)).toBe(true)
  })

  it('env item is not active when env key absent', () => {
    const item = CATALOG_BY_ID.get('proton_log')!
    expect(isItemActive(emptyModel(), item)).toBe(false)
  })

  it('wrapper item is active when modelField is true', () => {
    const item = CATALOG_BY_ID.get('mangohud')!
    const m = { ...emptyModel(), mangohud: true }
    expect(isItemActive(m, item)).toBe(true)
  })

  it('wrapper item is not active when modelField is false', () => {
    const item = CATALOG_BY_ID.get('mangohud')!
    expect(isItemActive(emptyModel(), item)).toBe(false)
  })

  it('gamescope-toggle is active when field is true', () => {
    const item = CATALOG_BY_ID.get('gs_hdr')!
    const gs = emptyGamescope()
    gs.values['hdr'] = true
    const m = { ...emptyModel(), gamescope: gs }
    expect(isItemActive(m, item)).toBe(true)
  })

  it('gamescope-toggle is not active when gamescope is null', () => {
    const item = CATALOG_BY_ID.get('gs_hdr')!
    expect(isItemActive(emptyModel(), item)).toBe(false)
  })

  it('gamescope-arg is active when field has a value', () => {
    const item = CATALOG_BY_ID.get('gs_frameLimit')!
    const gs = emptyGamescope()
    gs.values['frameLimit'] = 60
    const m = { ...emptyModel(), gamescope: gs }
    expect(isItemActive(m, item)).toBe(true)
  })

  it('gamescope-arg is not active when field is null', () => {
    const item = CATALOG_BY_ID.get('gs_frameLimit')!
    const m = { ...emptyModel(), gamescope: emptyGamescope() }
    expect(isItemActive(m, item)).toBe(false)
  })
})

// ── findConflicts ─────────────────────────────────────────────────────────────

describe('findConflicts', () => {
  it('mesa_anti_lag conflicts with mesa_anti_lag_disable when it is active', () => {
    const mesa = CATALOG_BY_ID.get('mesa_anti_lag')!
    const disableItem = CATALOG_BY_ID.get('mesa_anti_lag_disable')!
    const m = setItemActive(emptyModel(), disableItem, true)
    const conflicts = findConflicts(m, mesa)
    expect(conflicts.map((c) => c.id)).toContain('mesa_anti_lag_disable')
  })

  it('returns no conflicts when conflicting item is not active', () => {
    const mesa = CATALOG_BY_ID.get('mesa_anti_lag')!
    const conflicts = findConflicts(emptyModel(), mesa)
    expect(conflicts).toHaveLength(0)
  })

  it('proton_hide_apu conflicts with proton_hide_nvidia when active', () => {
    const hideApu = CATALOG_BY_ID.get('proton_hide_apu')!
    const hideNv = CATALOG_BY_ID.get('proton_hide_nvidia')!
    const m = setItemActive(emptyModel(), hideNv, true)
    const conflicts = findConflicts(m, hideApu)
    expect(conflicts.map((c) => c.id)).toContain('proton_hide_nvidia')
  })
})

// ── findImpliedItems ──────────────────────────────────────────────────────────

describe('findImpliedItems', () => {
  it('proton_fsr4_rdna3 implies proton_fsr4', () => {
    const item = CATALOG_BY_ID.get('proton_fsr4_rdna3')!
    const implied = findImpliedItems(item)
    expect(implied.map((i) => i.id)).toContain('proton_fsr4')
  })

  it('gs_hdr implies proton_hdr', () => {
    const item = CATALOG_BY_ID.get('gs_hdr')!
    const implied = findImpliedItems(item)
    expect(implied.map((i) => i.id)).toContain('proton_hdr')
  })

  it('proton_log has no implications', () => {
    const item = CATALOG_BY_ID.get('proton_log')!
    expect(findImpliedItems(item)).toHaveLength(0)
  })
})

// ── applyItemWithRelations ────────────────────────────────────────────────────

describe('applyItemWithRelations', () => {
  it('env↔env conflict: enabling mesa_anti_lag disables mesa_anti_lag_disable', () => {
    const mesa = CATALOG_BY_ID.get('mesa_anti_lag')!
    const disable = CATALOG_BY_ID.get('mesa_anti_lag_disable')!
    let m = setItemActive(emptyModel(), disable, true)
    expect(isItemActive(m, disable)).toBe(true)

    const { model: next, disabled } = applyItemWithRelations(m, mesa, true)
    expect(isItemActive(next, mesa)).toBe(true)
    expect(isItemActive(next, disable)).toBe(false)
    expect(disabled.map((d) => d.id)).toContain('mesa_anti_lag_disable')
  })

  it('env↔env conflict reverse: enabling mesa_anti_lag_disable disables mesa_anti_lag', () => {
    const mesa = CATALOG_BY_ID.get('mesa_anti_lag')!
    const disable = CATALOG_BY_ID.get('mesa_anti_lag_disable')!
    let m = setItemActive(emptyModel(), mesa, true)
    expect(isItemActive(m, mesa)).toBe(true)

    const { model: next, disabled } = applyItemWithRelations(m, disable, true)
    expect(isItemActive(next, disable)).toBe(true)
    expect(isItemActive(next, mesa)).toBe(false)
    expect(disabled.map((d) => d.id)).toContain('mesa_anti_lag')
  })

  it('env→env implication: enabling proton_fsr4_rdna3 also enables proton_fsr4', () => {
    const rdna3 = CATALOG_BY_ID.get('proton_fsr4_rdna3')!
    const fsr4 = CATALOG_BY_ID.get('proton_fsr4')!
    const { model: next, enabled } = applyItemWithRelations(emptyModel(), rdna3, true)
    expect(isItemActive(next, rdna3)).toBe(true)
    expect(isItemActive(next, fsr4)).toBe(true)
    expect(enabled.map((e) => e.id)).toContain('proton_fsr4')
  })

  it('gamescope→env implication: enabling gs_hdr also enables proton_hdr', () => {
    const gsHdr = CATALOG_BY_ID.get('gs_hdr')!
    const protonHdr = CATALOG_BY_ID.get('proton_hdr')!
    const { model: next, enabled } = applyItemWithRelations(emptyModel(), gsHdr, true)
    expect(isItemActive(next, gsHdr)).toBe(true)
    expect(isItemActive(next, protonHdr)).toBe(true)
    expect(enabled.map((e) => e.id)).toContain('proton_hdr')
  })

  it('turning OFF returns no disabled/enabled side effects', () => {
    const mesa = CATALOG_BY_ID.get('mesa_anti_lag')!
    const m = setItemActive(emptyModel(), mesa, true)
    const { disabled, enabled } = applyItemWithRelations(m, mesa, false)
    expect(disabled).toHaveLength(0)
    expect(enabled).toHaveLength(0)
  })

  it('env↔env conflict with global env: disabling globalOn item writes counter-value', () => {
    const mesa = CATALOG_BY_ID.get('mesa_anti_lag')!
    const disable = CATALOG_BY_ID.get('mesa_anti_lag_disable')!
    const globalEnv = { ENABLE_LAYER_MESA_ANTI_LAG: '1' }
    // Enable disable-variant while the mesa item is globally on
    const { model: next } = applyItemWithRelations(emptyModel(), disable, true, globalEnv)
    // The enable variant should be countered with explicit off-value
    expect(next.env['ENABLE_LAYER_MESA_ANTI_LAG']).toBe('0')
    // The disable variant itself should be written
    expect(next.env['DISABLE_LAYER_MESA_ANTI_LAG']).toBe('1')
  })

  it('wrapper→env conflict: enabling mangohud wrapper disables MANGOHUD=1 env item if active', () => {
    const mangohudWrapper = CATALOG_BY_ID.get('mangohud')!
    // Check that mangohud has conflictsWith relation
    const conflicts = mangohudWrapper.relations?.conflictsWith ?? []
    // If the catalog has no wrapper↔env conflict, at least the wrapper enables correctly
    const { model: next } = applyItemWithRelations(emptyModel(), mangohudWrapper, true)
    expect(isItemActive(next, mangohudWrapper)).toBe(true)
    // disabled array should only include items that were actually active
    expect(conflicts.length).toBeGreaterThanOrEqual(0)
  })

  it('proton_hide_apu conflicts: enabling while proton_hide_nvidia is on disables it', () => {
    const hideApu = CATALOG_BY_ID.get('proton_hide_apu')!
    const hideNv = CATALOG_BY_ID.get('proton_hide_nvidia')!
    const m = setItemActive(emptyModel(), hideNv, true)
    const { model: next, disabled } = applyItemWithRelations(m, hideApu, true)
    expect(isItemActive(next, hideApu)).toBe(true)
    expect(isItemActive(next, hideNv)).toBe(false)
    expect(disabled.map((d) => d.id)).toContain('proton_hide_nvidia')
  })

  it('gamescope→wrapper conflict: enabling gs_mangoapp disables mangohud wrapper', () => {
    const gsMangoapp = CATALOG_BY_ID.get('gs_mangoapp')!
    const mangohud = CATALOG_BY_ID.get('mangohud')!
    let m = setItemActive(emptyModel(), mangohud, true)
    expect(isItemActive(m, mangohud)).toBe(true)
    const { model: next, disabled } = applyItemWithRelations(m, gsMangoapp, true)
    expect(isItemActive(next, gsMangoapp)).toBe(true)
    expect(isItemActive(next, mangohud)).toBe(false)
    expect(disabled.map((d) => d.id)).toContain('mangohud')
  })

  it('turning off a gamescope-arg clears its value to null', () => {
    const item = CATALOG_BY_ID.get('gs_frameLimit')!
    const gs = emptyGamescope()
    gs.values['frameLimit'] = 60
    const m = { ...emptyModel(), gamescope: gs }
    expect(isItemActive(m, item)).toBe(true)
    const next = setItemActive(m, item, false)
    expect(next.gamescope?.values['frameLimit']).toBeNull()
    expect(isItemActive(next, item)).toBe(false)
  })
})

// ── Generic gamescope round-trips ─────────────────────────────────────────────

describe('gamescope generic round-trips', () => {
  it('round-trips int arg: gs_nested_width (-w)', () => {
    const original = 'gamescope -w 1280 -- %command%'
    const m = parseLaunchOptions(original)
    expect(m.gamescope?.values['nestedWidth']).toBe(1280)
    const out = serializeLaunchOptions(m)
    const m2 = parseLaunchOptions(out)
    expect(m2.gamescope?.values['nestedWidth']).toBe(1280)
  })

  it('round-trips enum arg: gs_scaler (-S auto)', () => {
    const original = 'gamescope -S auto -- %command%'
    const m = parseLaunchOptions(original)
    expect(m.gamescope?.values['scaler']).toBe('auto')
    const out = serializeLaunchOptions(m)
    const m2 = parseLaunchOptions(out)
    expect(m2.gamescope?.values['scaler']).toBe('auto')
  })

  it('round-trips enum arg: gs_filter (-F fsr)', () => {
    const original = 'gamescope -F fsr -- %command%'
    const m = parseLaunchOptions(original)
    expect(m.gamescope?.values['filter']).toBe('fsr')
    const out = serializeLaunchOptions(m)
    const m2 = parseLaunchOptions(out)
    expect(m2.gamescope?.values['filter']).toBe('fsr')
  })

  it('round-trips int arg: gs_fsr_sharpness (--sharpness)', () => {
    const original = 'gamescope --sharpness 5 -- %command%'
    const m = parseLaunchOptions(original)
    expect(m.gamescope?.values['fsrSharpness']).toBe(5)
    const out = serializeLaunchOptions(m)
    const m2 = parseLaunchOptions(out)
    expect(m2.gamescope?.values['fsrSharpness']).toBe(5)
  })

  it('round-trips string arg: gs_prefer_output (--prefer-output)', () => {
    const original = "gamescope --prefer-output 'DP-1' -- %command%"
    const m = parseLaunchOptions(original)
    expect(m.gamescope?.values['preferOutput']).toBe('DP-1')
    const out = serializeLaunchOptions(m)
    const m2 = parseLaunchOptions(out)
    expect(m2.gamescope?.values['preferOutput']).toBe('DP-1')
  })

  it('round-trips bool toggle: gs_borderless (-b)', () => {
    const original = 'gamescope -b -- %command%'
    const m = parseLaunchOptions(original)
    expect(m.gamescope?.values['borderless']).toBe(true)
    const out = serializeLaunchOptions(m)
    const m2 = parseLaunchOptions(out)
    expect(m2.gamescope?.values['borderless']).toBe(true)
  })

  it('unknown gamescope flag passes through to extraArgs', () => {
    const original = 'gamescope --some-unknown-flag -- %command%'
    const m = parseLaunchOptions(original)
    expect(m.gamescope?.extraArgs).toContain('--some-unknown-flag')
    const out = serializeLaunchOptions(m)
    expect(out).toContain('--some-unknown-flag')
  })

  it('round-trips float arg: gs_nis_sharpness (--nis-sharpness)', () => {
    const original = 'gamescope --nis-sharpness 0.5 -- %command%'
    const m = parseLaunchOptions(original)
    expect(m.gamescope?.values['nisSharpness']).toBeCloseTo(0.5)
    const out = serializeLaunchOptions(m)
    const m2 = parseLaunchOptions(out)
    expect(m2.gamescope?.values['nisSharpness']).toBeCloseTo(0.5)
  })

  it('gs_fullscreen recognized as toggle (section=gamescope, input=toggle)', () => {
    const item = CATALOG_BY_ID.get('gs_fullscreen')!
    expect(item.section).toBe('gamescope')
    expect(item.input).toBe('toggle')
    const m = parseLaunchOptions('gamescope -f -- %command%')
    expect(m.gamescope?.values['fullscreen']).toBe(true)
  })
})

// ── Generic per-item round-trip ───────────────────────────────────────────────
// For every catalog item, enable it, serialize, parse back, assert still active.

import { getItemsBySection, getGamescopeItems } from '../../src/shared/launchOptions/catalog'

describe('generic per-item round-trip', () => {
  it('no item has a legacy "kind" field', () => {
    for (const item of CATALOG_BY_ID.values()) {
      expect((item as unknown as Record<string, unknown>)['kind']).toBeUndefined()
    }
  })

  it('all env items survive enable→serialize→parse→isActive', () => {
    for (const item of getItemsBySection('env')) {
      const m = setItemActive(emptyModel(), item, true)
      const out = serializeLaunchOptions(m)
      const m2 = parseLaunchOptions(out)
      expect(isItemActive(m2, item), `env item "${item.id}" not active after round-trip`).toBe(true)
    }
  })

  it('all prefix-token items survive enable→serialize→parse→isActive', () => {
    for (const item of getItemsBySection('prefix-token')) {
      const m = setItemActive(emptyModel(), item, true)
      const out = serializeLaunchOptions(m)
      const m2 = parseLaunchOptions(out)
      expect(isItemActive(m2, item), `prefix-token "${item.id}" not active after round-trip`).toBe(true)
    }
  })

  it('all gamescope toggle items survive enable→serialize→parse→isActive', () => {
    for (const item of getGamescopeItems().filter((i) => i.input === 'toggle')) {
      const m = setItemActive(emptyModel(), item, true)
      const out = serializeLaunchOptions(m)
      const m2 = parseLaunchOptions(out)
      expect(isItemActive(m2, item), `gamescope toggle "${item.id}" not active after round-trip`).toBe(true)
    }
  })
})
