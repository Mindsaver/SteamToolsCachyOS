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
  tokenize,
  diffTokens,
  ENV_PRESETS,
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
    expect(m.gamescope?.width).toBe(1920)
    expect(m.gamescope?.height).toBe(1080)
    expect(m.gamescope?.fullscreen).toBe(true)
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
    expect(m2.gamescope?.width).toBe(1920)
    expect(m2.gamescope?.height).toBe(1080)
    expect(m2.gamescope?.fullscreen).toBe(true)
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

  it('deactivates a preset', () => {
    const preset = ENV_PRESETS.find((p) => p.id === 'proton_log')!
    let m = emptyModel()
    m = setPreset(m, preset, true)
    m = setPreset(m, preset, false)
    expect(isPresetActive(m, preset)).toBe(false)
    expect(m.env['PROTON_LOG']).toBeUndefined()
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

  it('removes key entirely when no global env and disabling', () => {
    const m = parseLaunchOptions('PROTON_NO_ESYNC=1 %command%')
    const result = setPreset(m, preset, false, {})
    expect(result.env['PROTON_NO_ESYNC']).toBeUndefined()
    expect(result.envOrder).not.toContain('PROTON_NO_ESYNC')
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
