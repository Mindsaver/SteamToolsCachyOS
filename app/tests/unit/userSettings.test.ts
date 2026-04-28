/**
 * Unit tests for userSettingsEnvOverrides, resolveToolInstallDir, safeBackupBasename, writeUserSettingsPyFile.
 * These use vi.mock to avoid real filesystem access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// We mock the 'fs' module before importing the module under test
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
  },
}))

import fs from 'fs'
import {
  userSettingsEnvOverrides,
  resolveToolInstallDir,
  writeUserSettingsPyFile,
  safeBackupBasename,
} from '../../src/main/services/steam/userSettings'

const mockFs = fs as {
  existsSync: ReturnType<typeof vi.fn>
  readFileSync: ReturnType<typeof vi.fn>
  readdirSync: ReturnType<typeof vi.fn>
  mkdirSync: ReturnType<typeof vi.fn>
  copyFileSync: ReturnType<typeof vi.fn>
  writeFileSync: ReturnType<typeof vi.fn>
  statSync: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── userSettingsEnvOverrides ──────────────────────────────────────────────────

describe('userSettingsEnvOverrides', () => {
  it('returns {} if user_settings.py does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)
    expect(userSettingsEnvOverrides('/some/tool')).toEqual({})
  })

  it('returns {} if file is empty', () => {
    mockFs.existsSync.mockImplementation((p: string) => p.endsWith('user_settings.py'))
    mockFs.readFileSync.mockReturnValue('')
    expect(userSettingsEnvOverrides('/some/tool')).toEqual({})
  })

  it('returns {} if file has no active env assignments', () => {
    mockFs.existsSync.mockImplementation((p: string) => p.endsWith('user_settings.py'))
    mockFs.readFileSync.mockReturnValue('# just a comment\n')
    expect(userSettingsEnvOverrides('/some/tool')).toEqual({})
  })

  it('returns parsed env overrides for active user_settings.py', () => {
    mockFs.existsSync.mockImplementation((p: string) => p.endsWith('user_settings.py'))
    mockFs.readFileSync.mockReturnValue(`
user_settings = {
  "PROTON_NO_ESYNC": "1",
  "DXVK_ASYNC": "1",
}
`)
    const result = userSettingsEnvOverrides('/some/tool')
    expect(result['PROTON_NO_ESYNC']).toBe('1')
    expect(result['DXVK_ASYNC']).toBe('1')
  })

  it('filters out keys identical to sample defaults', () => {
    mockFs.existsSync.mockImplementation((p: string) =>
      p.endsWith('user_settings.py') || p.endsWith('user_settings.sample.py')
    )
    mockFs.readFileSync.mockImplementation((p: string) => {
      if ((p as string).endsWith('user_settings.sample.py')) {
        return `user_settings = { "DXVK_ASYNC": "1" }`
      }
      return `user_settings = { "PROTON_NO_ESYNC": "1", "DXVK_ASYNC": "1" }`
    })
    const result = userSettingsEnvOverrides('/some/tool')
    // DXVK_ASYNC is same as sample so it should be filtered
    expect(result['DXVK_ASYNC']).toBeUndefined()
    // PROTON_NO_ESYNC differs from sample (not in sample) so it should be present
    expect(result['PROTON_NO_ESYNC']).toBe('1')
  })

  it('ignores commented-out keys', () => {
    mockFs.existsSync.mockImplementation((p: string) => p.endsWith('user_settings.py'))
    mockFs.readFileSync.mockReturnValue(`
# user_settings = { "PROTON_NO_ESYNC": "1" }
user_settings = {
  "DXVK_ASYNC": "1",
}
`)
    const result = userSettingsEnvOverrides('/some/tool')
    expect(result['PROTON_NO_ESYNC']).toBeUndefined()
    expect(result['DXVK_ASYNC']).toBe('1')
  })
})

// ── safeBackupBasename / writeUserSettingsPyFile ─────────────────────────────

describe('safeBackupBasename', () => {
  it('accepts safe names', () => {
    expect(safeBackupBasename('GE-Proton_2026-04-28_12-00-00.py')).toEqual({
      ok: true,
      name: 'GE-Proton_2026-04-28_12-00-00.py',
    })
  })

  it('rejects path segments', () => {
    expect(safeBackupBasename('../evil').ok).toBe(false)
    expect(safeBackupBasename('a/b').ok).toBe(false)
  })

  it('rejects empty', () => {
    expect(safeBackupBasename('').ok).toBe(false)
    expect(safeBackupBasename('   ').ok).toBe(false)
  })
})

describe('writeUserSettingsPyFile', () => {
  it('writes without copying a rolling backup', () => {
    mockFs.existsSync.mockReturnValue(true)
    writeUserSettingsPyFile('/some/tool', 'new')
    expect(mockFs.copyFileSync).not.toHaveBeenCalled()
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/user_settings\.py$/),
      'new',
      'utf-8'
    )
  })
})

// ── resolveToolInstallDir ─────────────────────────────────────────────────────

describe('resolveToolInstallDir', () => {
  it('returns null if empty tool name', () => {
    expect(resolveToolInstallDir('/steam', '')).toBeNull()
    expect(resolveToolInstallDir('/steam', '   ')).toBeNull()
  })

  it('returns null if compatibilitytools.d does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)
    expect(resolveToolInstallDir('/steam', 'proton-ge-custom')).toBeNull()
  })

  it('returns direct path if exact subfolder exists with compatibilitytool.vdf', () => {
    mockFs.existsSync.mockImplementation((p: string) => {
      const ps = p as string
      return ps.endsWith('compatibilitytools.d') || ps.endsWith('compatibilitytool.vdf')
    })
    const result = resolveToolInstallDir('/steam', 'proton-ge-custom')
    // Use endsWith to be path-separator agnostic across platforms
    expect(result?.replace(/\\/g, '/')).toBe('/steam/compatibilitytools.d/proton-ge-custom')
  })
})
