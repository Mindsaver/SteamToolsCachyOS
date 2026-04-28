import { describe, expect, it } from 'vitest'
import {
  mergeMangoHudEntry,
  parseMangoHudConfigText,
  serializeMangoHudEntries,
} from '../../src/shared/mangohudConfig'

describe('mangohud config parser', () => {
  it('parses key/value lines and ignores comments', () => {
    const parsed = parseMangoHudConfigText(`
# comment
fps=1
frametime=1
position=top-left
`)
    expect(parsed.entries).toEqual([
      { key: 'fps', value: '1' },
      { key: 'frametime', value: '1' },
      { key: 'position', value: 'top-left' },
    ])
  })

  it('parses bare flag lines as enabled options', () => {
    const parsed = parseMangoHudConfigText(`
gpu_stats
gpu_temp
cpu_stats
fps
`)
    expect(parsed.entries).toEqual([
      { key: 'gpu_stats', value: '1' },
      { key: 'gpu_temp', value: '1' },
      { key: 'cpu_stats', value: '1' },
      { key: 'fps', value: '1' },
    ])
  })

  it('keeps full right side of values with separators', () => {
    const parsed = parseMangoHudConfigText('media_player_format={title};{artist};{album}')
    expect(parsed.entries).toEqual([
      { key: 'media_player_format', value: '{title};{artist};{album}' },
    ])
  })

  it('serializes entries to mangohud format', () => {
    const text = serializeMangoHudEntries([
      { key: 'fps', value: '1' },
      { key: 'position', value: 'top-left' },
    ])
    expect(text).toContain('fps=1')
    expect(text).toContain('position=top-left')
  })

  it('merges existing key updates', () => {
    const merged = mergeMangoHudEntry(
      [
        { key: 'fps', value: '0' },
        { key: 'frametime', value: '1' },
      ],
      'fps',
      '1'
    )
    expect(merged.find((e) => e.key === 'fps')?.value).toBe('1')
  })
})
