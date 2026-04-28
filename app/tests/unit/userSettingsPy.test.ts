import { describe, it, expect } from 'vitest'
import {
  parseUserSettingsEnvFromText,
  formatUserSettingsPyFile,
  replaceUserSettingsDictInSource,
  findUserSettingsAssignmentSpan,
} from '../../src/shared/userSettingsPy'

describe('userSettingsPy shared', () => {
  it('parseUserSettingsEnvFromText reads dict entries', () => {
    const src = `
# comment
user_settings = {
  "PROTON_NO_ESYNC": "1",
  "DXVK_ASYNC": "1",
}
`
    expect(parseUserSettingsEnvFromText(src)).toEqual({
      PROTON_NO_ESYNC: '1',
      DXVK_ASYNC: '1',
    })
  })

  it('formatUserSettingsPyFile sorts keys', () => {
    const f = formatUserSettingsPyFile({ Z: '2', A: '1' })
    expect(f).toContain('"A": "1"')
    expect(f).toContain('"Z": "2"')
    expect(f.indexOf('"A"')).toBeLessThan(f.indexOf('"Z"'))
  })

  it('replaceUserSettingsDictInSource preserves trailing content', () => {
    const before = `# top\nuser_settings = {\n  "OLD": "0",\n}\n# tail\n`
    const after = replaceUserSettingsDictInSource(before, { NEW: '1' })
    expect(after).toContain('# top')
    expect(after).toContain('# tail')
    expect(after).toContain('"NEW": "1"')
    expect(after).not.toContain('OLD')
  })

  it('replaceUserSettingsDictInSource creates file when empty', () => {
    const after = replaceUserSettingsDictInSource('', { X: 'y' })
    expect(after).toContain('user_settings')
    expect(after).toContain('"X": "y"')
  })

  it('findUserSettingsAssignmentSpan locates block', () => {
    const s = 'a\nuser_settings = {\n  "K": "v",\n}\nb'
    const span = findUserSettingsAssignmentSpan(s)
    expect(span).not.toBeNull()
    expect(s.slice(span!.start, span!.end)).toContain('user_settings')
    expect(s.slice(span!.start, span!.end)).toContain('"K": "v"')
  })
})
