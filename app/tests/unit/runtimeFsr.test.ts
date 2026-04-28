import { describe, expect, it } from 'vitest'
import { getRunningFsrStatus } from '../../src/main/services/fsr/runtime'

describe('runtime fsr probe', () => {
  it('returns normalized status payload', () => {
    const status = getRunningFsrStatus(null, null)
    expect(['fsr4-active', 'fsr-active', 'not-detected']).toContain(status.indicatorState)
    expect(['indicator', 'inferred', 'unknown']).toContain(status.confidence)
    expect(typeof status.label).toBe('string')
    expect(status).toHaveProperty('detectedAppId')
    expect(status).toHaveProperty('detectedGamePid')
    expect(status).toHaveProperty('dllPathKind')
    expect(status).toHaveProperty('mappedDlls')
    expect(status).toHaveProperty('mlfiVersion')
    expect(status).toHaveProperty('framegenVersion')
    expect(typeof status.updatedAt).toBe('number')
  })
})
