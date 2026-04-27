import { describe, it, expect } from 'vitest'
import {
  mergeSnippetPrefix,
  removeSnippet,
  hasSnippet,
  ensureCommandToken,
  parseOptionsStructure,
  COMMAND_TOKEN,
} from '../../src/main/services/launchOptions/compose'

describe('mergeSnippetPrefix', () => {
  it('adds snippet with %command% to empty string', () => {
    expect(mergeSnippetPrefix('', 'mangohud')).toBe('mangohud %command%')
  })

  it('prepends snippet before existing prefix with %command%', () => {
    expect(mergeSnippetPrefix('gamemode %command%', 'mangohud')).toBe('mangohud gamemode %command%')
  })

  it('inserts snippet before %command% in middle', () => {
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

describe('ensureCommandToken', () => {
  it('adds %command% if absent', () => {
    expect(ensureCommandToken('mangohud')).toBe('mangohud %command%')
  })

  it('does not duplicate %command%', () => {
    expect(ensureCommandToken('mangohud %command%')).toBe('mangohud %command%')
  })

  it('returns empty string for empty input', () => {
    expect(ensureCommandToken('')).toBe('')
  })
})

describe('parseOptionsStructure', () => {
  it('parses prefix + command + suffix', () => {
    const r = parseOptionsStructure('mangohud %command% --flag')
    expect(r.prefix).toBe('mangohud')
    expect(r.hasCommand).toBe(true)
    expect(r.suffix).toBe('--flag')
  })

  it('parses options without %command%', () => {
    const r = parseOptionsStructure('mangohud gamemode')
    expect(r.prefix).toBe('mangohud gamemode')
    expect(r.hasCommand).toBe(false)
    expect(r.suffix).toBe('')
  })
})
