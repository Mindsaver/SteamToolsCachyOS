import fs from 'fs'
import type { DllVersionInfo } from '../../../shared/types'

// Heuristic FFX stack version detection from PE DLL bytes.
// Reads the file as a Buffer and applies the same semver regex + keyword scoring.

const SEMVER_RE = /(?<![0-9.])(\d{1,3}\.\d{1,3}\.\d{1,3}(?:\.\d{1,5})?)(?![0-9.])/g

interface RoleKeyword {
  keyword: string
  weight: number
}

const ROLE_KEYWORDS: Record<string, RoleKeyword[]> = {
  fsr: [
    { keyword: 'fsr4', weight: 5 },
    { keyword: 'ffxfsr4', weight: 5 },
    { keyword: 'ffxfsr', weight: 3 },
    { keyword: 'superresolution', weight: 2 },
    { keyword: 'upscale', weight: 1 },
  ],
  ml: [
    { keyword: 'ffxmlfi', weight: 5 },
    { keyword: 'mlfipass', weight: 4 },
    { keyword: 'mlfi', weight: 3 },
    { keyword: 'dilatemv', weight: 3 },
    { keyword: 'dilate', weight: 1 },
  ],
  framegen: [
    { keyword: 'framegeneration', weight: 5 },
    { keyword: 'dispatchdescframegeneration', weight: 4 },
    { keyword: 'framegen', weight: 3 },
    { keyword: 'multiframe', weight: 3 },
    { keyword: 'mfg', weight: 2 },
  ],
}

const ROLE_LABEL: Record<string, string> = {
  fsr: 'FSR (upscaling)',
  ml: 'ML Frame Interpolation',
  framegen: 'Frame Generation',
}

function extractStringsFromBuffer(buf: Buffer): string[] {
  // Extract printable ASCII sequences of 4+ chars (mimics PE string scanning)
  const results: string[] = []
  let start = -1
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i]
    const isPrintable = c >= 0x20 && c <= 0x7e
    if (isPrintable) {
      if (start === -1) start = i
    } else {
      if (start !== -1 && i - start >= 4) {
        results.push(buf.slice(start, i).toString('ascii'))
      }
      start = -1
    }
  }
  if (start !== -1 && buf.length - start >= 4) {
    results.push(buf.slice(start, buf.length).toString('ascii'))
  }
  return results
}

function scoreRoles(strings: string[]): Record<string, number> {
  const scores: Record<string, number> = {}
  const lowerStrings = strings.map((s) => s.toLowerCase())

  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    let score = 0
    for (const { keyword, weight } of keywords) {
      if (lowerStrings.some((s) => s.includes(keyword))) {
        score += weight
      }
    }
    if (score > 0) scores[role] = score
  }
  return scores
}

function extractVersions(strings: string[]): string[] {
  const versions = new Set<string>()
  for (const s of strings) {
    let match: RegExpExecArray | null
    const re = new RegExp(SEMVER_RE.source, 'g')
    while ((match = re.exec(s)) !== null) {
      versions.add(match[1])
    }
  }
  // Filter out obvious non-versions (0.0.0, all-zeros, single segment repeats)
  return [...versions].filter((v) => v !== '0.0.0' && !v.startsWith('0.0.'))
}

function hasRoleKeyword(str: string, role: string): boolean {
  const lower = str.toLowerCase()
  const kws = ROLE_KEYWORDS[role] ?? []
  return kws.some((k) => lower.includes(k.keyword))
}

function bestSemver(versions: string[]): string | null {
  if (versions.length === 0) return null
  const sorted = [...versions].sort((a, b) => {
    const aParts = a.split('.').map(Number)
    const bParts = b.split('.').map(Number)
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const diff = (bParts[i] ?? 0) - (aParts[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  })
  return sorted[0]
}

function pickRoleScopedBestVersion(strings: string[], role: string): string | null {
  const kws = (ROLE_KEYWORDS[role] ?? []).map((k) => k.keyword)
  let best: { version: string; score: number } | null = null

  for (let i = 0; i < strings.length; i++) {
    if (!hasRoleKeyword(strings[i], role)) continue
    // Prefer versions in same string, then near neighbors where version tags
    // are often split from the symbol marker in binary string tables.
    const start = Math.max(0, i - 3)
    const end = Math.min(strings.length - 1, i + 3)
    for (let j = start; j <= end; j++) {
      const s = strings[j]
      const lower = s.toLowerCase()
      let keywordPos = Number.MAX_SAFE_INTEGER
      for (const kw of kws) {
        const idx = lower.indexOf(kw)
        if (idx >= 0) keywordPos = Math.min(keywordPos, idx)
      }

      const re = new RegExp(SEMVER_RE.source, 'g')
      let match: RegExpExecArray | null
      while ((match = re.exec(s)) !== null) {
        const v = match[1]
        if (v === '0.0.0' || v.startsWith('0.0.')) continue
        const localDist =
          keywordPos === Number.MAX_SAFE_INTEGER ? 200 : Math.abs(match.index - keywordPos)
        const windowPenalty = Math.abs(j - i) * 100
        const beforeKeywordPenalty =
          keywordPos !== Number.MAX_SAFE_INTEGER && j === i && match.index < keywordPos ? 500 : 0
        const score = localDist + windowPenalty + beforeKeywordPenalty
        if (!best || score < best.score) {
          best = { version: v, score }
        } else if (score === best.score) {
          const higher = bestSemver([best.version, v])
          if (higher && higher !== best.version) best = { version: higher, score }
        }
      }
    }
  }
  return best?.version ?? null
}

function pickBestVersion(versions: string[], roleScore: number): string | null {
  if (versions.length === 0) return null
  // Prefer higher versions that look like proper semver
  const sorted = [...versions].sort((a, b) => {
    const aParts = a.split('.').map(Number)
    const bParts = b.split('.').map(Number)
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const diff = (bParts[i] ?? 0) - (aParts[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  })
  return roleScore > 0 ? sorted[0] : null
}

export function analyzeDll(filePath: string): DllVersionInfo {
  const buf = fs.readFileSync(filePath)
  const strings = extractStringsFromBuffer(buf)
  const allVersions = extractVersions(strings)
  const roleScores = scoreRoles(strings)

  const roles: string[] = []
  const roleVersions: Record<string, string | null> = {}

  for (const role of Object.keys(ROLE_KEYWORDS)) {
    const score = roleScores[role] ?? 0
    if (score > 0) {
      roles.push(ROLE_LABEL[role] ?? role)
      const scopedBest = pickRoleScopedBestVersion(strings, role)
      roleVersions[role] = scopedBest ?? pickBestVersion(allVersions, score)
    }
  }

  return {
    filePath,
    fsr: roleVersions['fsr'] ?? null,
    ml: roleVersions['ml'] ?? null,
    framegen: roleVersions['framegen'] ?? null,
    roles,
    rawVersions: allVersions,
  }
}
