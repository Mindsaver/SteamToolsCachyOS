import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import type { GpuInfo } from '../../../shared/types'

// GPU vendor hints from GL/Vulkan/renderer strings.
// Primary: /sys/class/drm/card*/device/vendor (sysfs)
// Fallback: lspci output

const NVIDIA_VENDOR = 0x10de
const AMD_VENDORS = new Set([0x1002, 0x1022])
const INTEL_VENDOR = 0x8086

type VendorName = 'amd' | 'nvidia' | 'intel' | 'unknown'

function parseVendorHex(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/^0x/, '')
  if (!t) return null
  const n = parseInt(t, 16)
  return isNaN(n) ? null : n
}

function vendorName(id: number): VendorName {
  if (AMD_VENDORS.has(id)) return 'amd'
  if (id === NVIDIA_VENDOR) return 'nvidia'
  if (id === INTEL_VENDOR) return 'intel'
  return 'unknown'
}

function cardSortKey(name: string): number {
  const m = /^card(\d+)$/.exec(name)
  return m ? parseInt(m[1], 10) : 9999
}

function vendorsFromSysfs(): VendorName[] {
  const drmPath = '/sys/class/drm'
  if (!fs.existsSync(drmPath)) return []

  try {
    const entries = fs
      .readdirSync(drmPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^card\d+$/.test(d.name))
      .sort((a, b) => cardSortKey(a.name) - cardSortKey(b.name))

    const result: VendorName[] = []
    for (const entry of entries) {
      const vendorPath = path.join(drmPath, entry.name, 'device', 'vendor')
      try {
        const raw = fs.readFileSync(vendorPath, 'utf-8')
        const id = parseVendorHex(raw)
        if (id !== null) result.push(vendorName(id))
      } catch {
        // skip
      }
    }
    return result
  } catch {
    return []
  }
}

function vendorsFromLspci(): VendorName[] {
  try {
    const out = execSync('lspci -mm', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    const vendors: VendorName[] = []
    for (const line of out.split('\n')) {
      const lower = line.toLowerCase()
      if (!lower.includes('vga') && !lower.includes('display') && !lower.includes('3d')) continue
      if (lower.includes('amd') || lower.includes('radeon') || lower.includes('advanced micro')) {
        vendors.push('amd')
      } else if (lower.includes('nvidia')) {
        vendors.push('nvidia')
      } else if (lower.includes('intel')) {
        vendors.push('intel')
      }
    }
    return vendors
  } catch {
    return []
  }
}

export function detectGpuVendors(): GpuInfo {
  let vendors = vendorsFromSysfs()
  if (vendors.length === 0) vendors = vendorsFromLspci()

  const unique = [...new Set(vendors)] as VendorName[]
  const hasAmd = unique.includes('amd')
  const hasNvidia = unique.includes('nvidia')
  const hasIntel = unique.includes('intel')

  // Primary = discrete GPU (nvidia/amd preferred over intel iGPU)
  const primaryVendor: VendorName = hasNvidia
    ? 'nvidia'
    : hasAmd
      ? 'amd'
      : hasIntel
        ? 'intel'
        : 'unknown'

  return { vendors: unique, hasAmd, hasNvidia, hasIntel, primaryVendor }
}
