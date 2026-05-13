import { describe, it, expect } from 'vitest'
import { parseLinuxCpuinfoForX86Caps } from '../../src/main/services/steam/cpuCapsLinux'

describe('cpuCapsLinux', () => {
  it('detects x86_64_v3 from avx2+fma', () => {
    expect(parseLinuxCpuinfoForX86Caps('flags\t\t: fpu avx avx2 fma\n')).toEqual({
      hasX86_64V3: true,
      hasX86_64V4: false,
    })
  })

  it('detects x86_64_v4 from avx512f', () => {
    expect(parseLinuxCpuinfoForX86Caps('flags\t\t: avx2 fma avx512f\n')).toEqual({
      hasX86_64V3: true,
      hasX86_64V4: true,
    })
  })

  it('no flags line → no caps', () => {
    expect(parseLinuxCpuinfoForX86Caps('processor\t: 0\n')).toEqual({
      hasX86_64V3: false,
      hasX86_64V4: false,
    })
  })
})
