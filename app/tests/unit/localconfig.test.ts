import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  readLaunchOptions,
  writeLaunchOption,
  batchWriteLaunchOptions,
  readAllLaunchOptionsForAccount,
  latestBackupPath,
  restoreBackup,
} from '../../src/main/services/steam/localconfig'

// Minimal localconfig.vdf fixture
const FIXTURE_VDF = `"UserLocalConfigStore"
{
  "Software"
  {
    "Valve"
    {
      "Steam"
      {
        "Apps"
        {
          "12345"
          {
            "LaunchOptions"    "gamemode %command%"
          }
          "67890"
          {
            "LaunchOptions"    "mangohud %command%"
          }
        }
      }
    }
  }
}
`

function makeTmpUserData(accountId = 'testaccount') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steamtools-test-'))
  const configDir = path.join(tmpDir, accountId, 'config')
  fs.mkdirSync(configDir, { recursive: true })
  const lcPath = path.join(configDir, 'localconfig.vdf')
  fs.writeFileSync(lcPath, FIXTURE_VDF, 'utf-8')
  return { tmpDir, accountId, lcPath, userDataPath: tmpDir }
}

afterEach(() => {
  // cleanup is implicit — tmpDir is in os.tmpdir()
})

describe('readLaunchOptions', () => {
  it('reads existing launch options from fixture', () => {
    const { lcPath } = makeTmpUserData()
    const map = readLaunchOptions(lcPath)
    expect(map.get('12345')).toBe('gamemode %command%')
    expect(map.get('67890')).toBe('mangohud %command%')
  })

  it('returns empty map for non-existent file', () => {
    const map = readLaunchOptions('/nonexistent/path.vdf')
    expect(map.size).toBe(0)
  })
})

describe('writeLaunchOption', () => {
  it('writes a launch option and reads it back', () => {
    const { lcPath } = makeTmpUserData()
    writeLaunchOption(lcPath, '99999', 'PROTON_LOG=1 %command%')
    const map = readLaunchOptions(lcPath)
    expect(map.get('99999')).toBe('PROTON_LOG=1 %command%')
  })

  it('creates a .steamtools.bak on first write', () => {
    const { lcPath } = makeTmpUserData()
    writeLaunchOption(lcPath, '12345', 'new %command%')
    expect(fs.existsSync(lcPath + '.steamtools.bak')).toBe(true)
  })

  it('does not overwrite an existing .steamtools.bak', () => {
    const { lcPath } = makeTmpUserData()
    writeLaunchOption(lcPath, '12345', 'first %command%')
    const bakContent = fs.readFileSync(lcPath + '.steamtools.bak', 'utf-8')
    writeLaunchOption(lcPath, '12345', 'second %command%')
    // bak should still contain original fixture
    expect(fs.readFileSync(lcPath + '.steamtools.bak', 'utf-8')).toBe(bakContent)
  })

  it('removes the LaunchOptions key when setting empty string', () => {
    const { lcPath } = makeTmpUserData()
    writeLaunchOption(lcPath, '12345', '')
    const map = readLaunchOptions(lcPath)
    expect(map.get('12345')).toBeUndefined()
  })
})

describe('batchWriteLaunchOptions', () => {
  it('writes multiple app IDs in one call', () => {
    const { userDataPath, accountId } = makeTmpUserData()
    const updates = new Map([
      ['12345', 'PROTON_LOG=1 mangohud %command%'],
      ['67890', 'gamemode %command%'],
      ['99999', 'DXVK_HUD=fps %command%'],
    ])
    batchWriteLaunchOptions(userDataPath, accountId, updates)
    const result = readAllLaunchOptionsForAccount(userDataPath, accountId)
    expect(result.get('12345')).toBe('PROTON_LOG=1 mangohud %command%')
    expect(result.get('67890')).toBe('gamemode %command%')
    expect(result.get('99999')).toBe('DXVK_HUD=fps %command%')
  })

  it('creates a backup on first batch write', () => {
    const { userDataPath, accountId, lcPath } = makeTmpUserData()
    batchWriteLaunchOptions(userDataPath, accountId, new Map([['12345', 'new %command%']]))
    expect(fs.existsSync(lcPath + '.steamtools.bak')).toBe(true)
  })

  it('returns the backup path', () => {
    const { userDataPath, accountId } = makeTmpUserData()
    const bakPath = batchWriteLaunchOptions(userDataPath, accountId, new Map([['12345', 'new %command%']]))
    expect(bakPath).toContain('.steamtools.bak')
    expect(fs.existsSync(bakPath)).toBe(true)
  })
})

describe('restoreBackup', () => {
  it('restores localconfig from backup', () => {
    const { userDataPath, accountId, lcPath } = makeTmpUserData()
    // First write creates a backup with original content
    batchWriteLaunchOptions(userDataPath, accountId, new Map([['12345', 'changed %command%']]))
    // Verify the file was changed
    const changed = readLaunchOptions(lcPath)
    expect(changed.get('12345')).toBe('changed %command%')
    // Restore backup
    restoreBackup(userDataPath, accountId)
    // Should be back to original
    const restored = readLaunchOptions(lcPath)
    expect(restored.get('12345')).toBe('gamemode %command%')
  })

  it('throws if no backup exists', () => {
    const { userDataPath, accountId } = makeTmpUserData()
    expect(() => restoreBackup(userDataPath, accountId)).toThrow()
  })
})

describe('latestBackupPath', () => {
  it('returns null if no backup exists', () => {
    const { userDataPath, accountId } = makeTmpUserData()
    expect(latestBackupPath(userDataPath, accountId)).toBeNull()
  })

  it('returns path after a write creates backup', () => {
    const { userDataPath, accountId } = makeTmpUserData()
    batchWriteLaunchOptions(userDataPath, accountId, new Map([['12345', 'x']]))
    const p = latestBackupPath(userDataPath, accountId)
    expect(p).not.toBeNull()
    expect(fs.existsSync(p!)).toBe(true)
  })
})
