import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  listMangoHudBackups,
  readMangoHudConfig,
  restoreMangoHudBackup,
  saveMangoHudConfig,
  syncRuntimeFsrTextToMangoHud,
} from '../../src/main/services/mangohud'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mangohud-test-'))
const cfgPath = path.join(tmpRoot, 'MangoHud.conf')

describe('mangohud service', () => {
  afterEach(() => {
    if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath)
    if (fs.existsSync(`${cfgPath}.tmp`)) fs.unlinkSync(`${cfgPath}.tmp`)
    if (fs.existsSync(`${cfgPath}.steamtools.bak`)) fs.unlinkSync(`${cfgPath}.steamtools.bak`)
    const backupsDir = path.join(tmpRoot, 'steamtools-mangohud-backups')
    if (fs.existsSync(backupsDir)) fs.rmSync(backupsDir, { recursive: true, force: true })
    process.env['MANGOHUD_CONFIG_PATH'] = cfgPath
  })

  it('saves and reads config text', () => {
    process.env['MANGOHUD_CONFIG_PATH'] = cfgPath
    const save = saveMangoHudConfig({ rawText: 'fps=1\nframetime=1' })
    expect(save.ok).toBe(true)
    const read = readMangoHudConfig()
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.entries.some((e) => e.key === 'fps' && e.value === '1')).toBe(true)
  })

  it('creates named backups and restores them', () => {
    process.env['MANGOHUD_CONFIG_PATH'] = cfgPath
    expect(saveMangoHudConfig({ rawText: 'fps=0' }).ok).toBe(true)
    expect(saveMangoHudConfig({ rawText: 'fps=1', makeNamedBackup: 'before-change.conf' }).ok).toBe(true)
    const backups = listMangoHudBackups()
    expect(backups.ok).toBe(true)
    if (backups.ok) expect(backups.entries.some((e) => e.fileName === 'before-change.conf')).toBe(true)
    expect(restoreMangoHudBackup('before-change.conf').ok).toBe(true)
    const read = readMangoHudConfig()
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.rawText).toContain('fps=0')
  })

  it('syncs runtime fsr text into mangohud config', async () => {
    process.env['MANGOHUD_CONFIG_PATH'] = cfgPath
    expect(saveMangoHudConfig({ rawText: 'fps=1' }).ok).toBe(true)
    const r = await syncRuntimeFsrTextToMangoHud({
      indicatorState: 'fsr4-active',
      fsrVersion: '4.0.1',
      confidence: 'inferred',
      label: 'FSR4 active (4.0.1 inferred)',
      sourcePath: '/tmp/amdxcffx64.dll',
      updatedAt: Date.now(),
    })
    if (!r.ok && !/Could not signal MangoHud process/.test(r.error)) {
      expect(r.ok).toBe(true)
    }
    const read = readMangoHudConfig()
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.rawText).toContain('custom_text=SteamTools: FSR4 active (4.0.1 inferred)')
  })
})
