import { describe, it, expect } from 'vitest'
import { analyzeDll } from '../../src/main/services/fsr/ffx'
import fs from 'fs'
import os from 'os'
import path from 'path'

function makeFakeDll(content: string): string {
  const tmpPath = path.join(os.tmpdir(), `fake-dll-${Date.now()}.dll`)
  // Pad with null bytes to simulate PE file, embed the content as ASCII
  const buf = Buffer.concat([Buffer.alloc(512, 0), Buffer.from(content, 'ascii'), Buffer.alloc(256, 0)])
  fs.writeFileSync(tmpPath, buf)
  return tmpPath
}

describe('analyzeDll', () => {
  it('detects FSR version from embedded string', () => {
    const p = makeFakeDll('FFXfsr4 version 4.1.2 some_upscale_function superresolution_pass')
    try {
      const result = analyzeDll(p)
      expect(result.roles.length).toBeGreaterThan(0)
      expect(result.rawVersions).toContain('4.1.2')
    } finally {
      fs.unlinkSync(p)
    }
  })

  it('detects framegen from embedded string', () => {
    const p = makeFakeDll('framegeneration_dispatch 1.2.3 multiframe_pass')
    try {
      const result = analyzeDll(p)
      expect(result.rawVersions).toContain('1.2.3')
    } finally {
      fs.unlinkSync(p)
    }
  })

  it('handles file with no known keywords', () => {
    const p = makeFakeDll('totally_random_string_with_no_meaning 9.9.9')
    try {
      const result = analyzeDll(p)
      expect(result.fsr).toBeNull()
      expect(result.ml).toBeNull()
      expect(result.framegen).toBeNull()
    } finally {
      fs.unlinkSync(p)
    }
  })
})
