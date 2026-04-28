import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assignMangoHudProfile,
  deleteMangoHudProfile,
  listMangoHudProfiles,
  listMangoHudBackups,
  readMangoHudConfig,
  resolveMangoHudProfileForApp,
  restoreMangoHudBackup,
  saveMangoHudProfileSettings,
  saveMangoHudProfile,
  saveMangoHudConfig,
  syncRuntimeFsrTextToMangoHud,
} from '../../src/main/services/mangohud'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mangohud-test-'))
const cfgPath = path.join(tmpRoot, 'MangoHud.conf')
const profileStorePath = path.join(tmpRoot, 'steamtools-mangohud-profiles.json')

describe('mangohud service', () => {
  beforeEach(() => {
    process.env['MANGOHUD_CONFIG_PATH'] = cfgPath
    process.env['MANGOHUD_PROFILE_STORE_PATH'] = profileStorePath
  })

  afterEach(() => {
    if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath)
    if (fs.existsSync(`${cfgPath}.tmp`)) fs.unlinkSync(`${cfgPath}.tmp`)
    if (fs.existsSync(`${cfgPath}.steamtools.bak`)) fs.unlinkSync(`${cfgPath}.steamtools.bak`)
    if (fs.existsSync(profileStorePath)) fs.unlinkSync(profileStorePath)
    if (fs.existsSync(`${profileStorePath}.tmp`)) fs.unlinkSync(`${profileStorePath}.tmp`)
    const backupsDir = path.join(tmpRoot, 'steamtools-mangohud-backups')
    if (fs.existsSync(backupsDir)) fs.rmSync(backupsDir, { recursive: true, force: true })
    process.env['MANGOHUD_CONFIG_PATH'] = cfgPath
    process.env['MANGOHUD_PROFILE_STORE_PATH'] = profileStorePath
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
      indicatorRequested: true,
      dllLoaded: true,
      likelyActive: true,
      detectedAppId: 730,
      detectedGamePid: 1234,
      dllPathKind: 'mapped',
      mappedDlls: { fsr: ['/tmp/amdxcffx64.dll'], dlss: [], xess: [] },
      fsrVersion: '4.0.1',
      mlfiVersion: '4.0.0',
      framegenVersion: '4.0.1',
      confidence: 'inferred',
      label: 'FSR4 active (4.0.1 inferred)',
      sourcePath: '/tmp/amdxcffx64.dll',
      updatedAt: Date.now(),
    })
    if (!r.ok && !/(Could not signal MangoHud process|No running MangoHud process found)/.test(r.error)) {
      expect(r.ok).toBe(true)
    }
    const read = readMangoHudConfig()
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.rawText).toContain('custom_text=SteamTools: FSR4 active (4.0.1 inferred) | FSR 4.0.1')
  })

  it('supports compact runtime text style', async () => {
    process.env['MANGOHUD_CONFIG_PATH'] = cfgPath
    expect(saveMangoHudConfig({ rawText: 'fps=1' }).ok).toBe(true)
    const r = await syncRuntimeFsrTextToMangoHud(
      {
        indicatorState: 'fsr4-active',
        indicatorRequested: true,
        dllLoaded: true,
        likelyActive: true,
        detectedAppId: 730,
        detectedGamePid: 1234,
        dllPathKind: 'mapped',
        mappedDlls: { fsr: ['/tmp/amdxcffx64.dll'], dlss: [], xess: [] },
        fsrVersion: '4.1.0',
        mlfiVersion: '4.0.0',
        framegenVersion: '4.1.0',
        confidence: 'inferred',
        label: 'FSR4 active (4.1.0 inferred)',
        sourcePath: '/tmp/amdxcffx64.dll',
        updatedAt: Date.now(),
      },
      'compact'
    )
    if (!r.ok && !/No running MangoHud process/.test(r.error)) {
      expect(r.ok).toBe(true)
    }
    const read = readMangoHudConfig()
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.rawText).toContain('custom_text=ST:4.1.0')
  })

  it('supports profile create, assign, resolve and delete', () => {
    const created = saveMangoHudProfile({
      name: 'Racing Profile',
      entries: [{ key: 'fps', value: '1' }],
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const listed = listMangoHudProfiles()
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.profiles.some((profile) => profile.id === created.profile.id)).toBe(true)

    const assigned = assignMangoHudProfile(730, created.profile.id)
    expect(assigned.ok).toBe(true)

    expect(saveMangoHudProfileSettings({ applyMode: 'auto-detect', defaultProfileId: null }).ok).toBe(true)
    const resolved = resolveMangoHudProfileForApp(730)
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.profile?.id).toBe(created.profile.id)
    expect(resolved.source).toBe('specific')

    const removed = deleteMangoHudProfile(created.profile.id)
    expect(removed.ok).toBe(true)
    const resolvedAfterDelete = resolveMangoHudProfileForApp(730)
    expect(resolvedAfterDelete.ok).toBe(true)
    if (!resolvedAfterDelete.ok) return
    expect(resolvedAfterDelete.profile).toBeNull()
    expect(resolvedAfterDelete.source).toBe('none')
  })

  it('falls back to default profile in auto-detect mode', () => {
    const created = saveMangoHudProfile({
      name: 'Default Fallback',
      entries: [{ key: 'fps', value: '1' }],
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(
      saveMangoHudProfileSettings({
        applyMode: 'auto-detect',
        defaultProfileId: created.profile.id,
      }).ok
    ).toBe(true)
    const resolved = resolveMangoHudProfileForApp(999999)
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.profile?.id).toBe(created.profile.id)
    expect(resolved.source).toBe('default')
  })
})
