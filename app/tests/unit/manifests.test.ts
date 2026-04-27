import { describe, it, expect } from 'vitest'
import { parseManifest, isHeuristicNonGame } from '../../src/main/services/steam/manifests'
import fs from 'fs'
import os from 'os'
import path from 'path'

function writeManifest(content: string): string {
  const p = path.join(os.tmpdir(), `appmanifest_${Date.now()}.acf`)
  fs.writeFileSync(p, content, 'utf-8')
  return p
}

describe('parseManifest', () => {
  it('parses a valid manifest', () => {
    const p = writeManifest(`"AppState"\n{\n\t"appid"\t\t"1234"\n\t"name"\t\t"My Game"\n\t"installdir"\t\t"MyGame"\n}\n`)
    try {
      const r = parseManifest(p)
      expect(r?.appId).toBe(1234)
      expect(r?.name).toBe('My Game')
      expect(r?.installDir).toBe('MyGame')
    } finally {
      fs.unlinkSync(p)
    }
  })

  it('returns null for missing fields', () => {
    const p = writeManifest(`"AppState"\n{\n\t"appid"\t\t""\n}\n`)
    try {
      expect(parseManifest(p)).toBeNull()
    } finally {
      fs.unlinkSync(p)
    }
  })
})

describe('isHeuristicNonGame', () => {
  it('filters Proton entries', () => {
    expect(isHeuristicNonGame('Proton 9.0')).toBe(true)
    expect(isHeuristicNonGame('Proton Experimental')).toBe(true)
  })

  it('filters Steam Linux Runtime', () => {
    expect(isHeuristicNonGame('Steam Linux Runtime 1.0')).toBe(true)
  })

  it('passes real games', () => {
    expect(isHeuristicNonGame('Cyberpunk 2077')).toBe(false)
    expect(isHeuristicNonGame('Elden Ring')).toBe(false)
  })
})
