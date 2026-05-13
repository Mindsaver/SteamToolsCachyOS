import fs from 'fs'
import os from 'os'
import type { CachyosCpuCaps } from '../../../shared/compatToolsPure'

/** Parse first `flags` line from `/proc/cpuinfo`-style text (unit-testable). */
export function parseLinuxCpuinfoForX86Caps(content: string): CachyosCpuCaps {
  let flags = ''
  for (const line of content.split(/\r?\n/)) {
    const lower = line.toLowerCase()
    if (lower.startsWith('flags')) {
      flags = line.split(':')[1]?.trim() ?? ''
      break
    }
  }
  const f = flags.toLowerCase().split(/\s+/).filter(Boolean)
  const has = (x: string) => f.includes(x)
  return {
    hasX86_64V3: has('avx2') && has('fma'),
    hasX86_64V4: has('avx512f'),
  }
}

/** Feature hints for ordering Proton-CachyOS `x86_64` / `x86_64_v3` / `x86_64_v4` assets. */
export function readLinuxX86CpuCaps(): CachyosCpuCaps {
  if (os.platform() !== 'linux') return { hasX86_64V3: false, hasX86_64V4: false }
  try {
    const raw = fs.readFileSync('/proc/cpuinfo', 'utf-8')
    return parseLinuxCpuinfoForX86Caps(raw)
  } catch {
    return { hasX86_64V3: false, hasX86_64V4: false }
  }
}
