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

  it('keeps comma-separated threshold/color lists intact', () => {
    const parsed = parseMangoHudConfigText(`
fps_value=30,60
fps_color=cc0000,ffaa7f,92e79a
gpu_load_value=60,90
gpu_load_color=92e79a,ffaa7f,cc0000
`)
    expect(parsed.entries).toEqual([
      { key: 'fps_value', value: '30,60' },
      { key: 'fps_color', value: 'cc0000,ffaa7f,92e79a' },
      { key: 'gpu_load_value', value: '60,90' },
      { key: 'gpu_load_color', value: '92e79a,ffaa7f,cc0000' },
    ])
    const text = serializeMangoHudEntries(parsed.entries)
    expect(text).toContain('fps_value=30,60')
    expect(text).toContain('fps_color=cc0000,ffaa7f,92e79a')
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
