import type { GpuInfo } from '../../../shared/types'
import type { BatchSnippet } from './compose'
import { BATCH_SNIPPETS } from './compose'

// GPU-vendor aware preset suggestions

export interface PresetSuggestion {
  snippet: BatchSnippet
  recommended: boolean
  reason: string
}

export function getSuggestedPresets(gpuInfo: GpuInfo): PresetSuggestion[] {
  return BATCH_SNIPPETS.map((snippet) => {
    if (snippet.id === 'mangohud') {
      return { snippet, recommended: true, reason: 'Performance overlay — works on all GPUs' }
    }
    if (snippet.id === 'gamemode') {
      return { snippet, recommended: true, reason: 'CPU governor optimization' }
    }
    if (snippet.id === 'fsr') {
      return {
        snippet,
        recommended: gpuInfo.hasAmd,
        reason: gpuInfo.hasAmd
          ? 'AMD GPU detected — Wine FSR upscaling recommended'
          : 'Wine FSR (works on all GPUs via Wine)',
      }
    }
    if (snippet.id === 'proton_log') {
      return { snippet, recommended: false, reason: 'Verbose Proton logging — useful for debugging' }
    }
    if (snippet.id === 'wined3d') {
      return { snippet, recommended: false, reason: 'Fallback DX renderer — only for compatibility issues' }
    }
    return { snippet, recommended: false, reason: '' }
  })
}
