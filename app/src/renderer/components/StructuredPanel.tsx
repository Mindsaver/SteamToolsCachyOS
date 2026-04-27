import React from 'react'
import { Check, Plus, Minus } from 'lucide-react'
import { cn } from '../lib/utils'
import type { GpuInfo } from '../../shared/types'

// Inline the compose helpers to avoid importing from main-process code in the renderer.
// These are pure functions with no Node.js dependencies.

export const COMMAND_TOKEN = '%command%'

export interface BatchSnippetDef {
  id: string
  label: string
  snippet: string
}

export const BATCH_SNIPPETS: BatchSnippetDef[] = [
  { id: 'proton_log', label: 'PROTON_LOG=1', snippet: 'PROTON_LOG=1' },
  { id: 'mangohud', label: 'MangoHud', snippet: 'mangohud' },
  { id: 'gamemode', label: 'GameMode', snippet: 'gamemode' },
  { id: 'game_performance', label: 'game-performance', snippet: 'game-performance' },
  { id: 'mangohud_gamemode', label: 'MangoHud + GameMode', snippet: 'mangohud gamemode' },
  { id: 'proton_log_mangohud', label: 'PROTON_LOG=1 + MangoHud', snippet: 'PROTON_LOG=1 mangohud' },
  { id: 'wined3d', label: 'WineD3D (PROTON_USE_WINED3D=1)', snippet: 'PROTON_USE_WINED3D=1' },
  { id: 'fsr', label: 'WINE_FULLSCREEN_FSR=1', snippet: 'WINE_FULLSCREEN_FSR=1' },
  { id: 'esync', label: 'PROTON_NO_ESYNC=1', snippet: 'PROTON_NO_ESYNC=1' },
  { id: 'fsync', label: 'PROTON_NO_FSYNC=1', snippet: 'PROTON_NO_FSYNC=1' },
]

function hasSnippet(current: string, snippet: string): boolean {
  const tokens = snippet.trim().split(/\s+/)
  const currentTokens = current.split(/\s+/)
  return tokens.every((t) => currentTokens.includes(t))
}

function mergeSnippetPrefix(current: string, snippet: string): string {
  const sn = snippet.trim()
  const cur = (current || '').trim()
  if (!sn) return cur
  if (!cur) return `${sn} ${COMMAND_TOKEN}`.trim()
  if (cur.includes(COMMAND_TOKEN)) {
    const idx = cur.indexOf(COMMAND_TOKEN)
    const left = cur.slice(0, idx).trim()
    const tail = cur.slice(idx + COMMAND_TOKEN.length).trim()
    const newLeft = left ? `${sn} ${left}` : sn
    return tail ? `${newLeft} ${COMMAND_TOKEN} ${tail}` : `${newLeft} ${COMMAND_TOKEN}`
  }
  return `${sn} ${cur}`
}

function removeSnippet(current: string, snippet: string): string {
  if (!snippet.trim()) return current
  const tokens = snippet.trim().split(/\s+/)
  let result = current
  for (const token of tokens) {
    result = result.replace(new RegExp(`(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'g'), ' ')
  }
  return result.trim().replace(/\s+/g, ' ')
}

interface StructuredPanelProps {
  value: string
  onChange: (value: string) => void
  gpuInfo?: GpuInfo | null
}

export function StructuredPanel({ value, onChange, gpuInfo }: StructuredPanelProps) {
  const toggleSnippet = (snippet: string) => {
    if (hasSnippet(value, snippet)) {
      onChange(removeSnippet(value, snippet))
    } else {
      onChange(mergeSnippetPrefix(value, snippet))
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        Toggle common launch option presets. Changes update the text field above.
      </p>
      <div className="flex flex-wrap gap-2">
        {BATCH_SNIPPETS.map((preset) => {
          const active = hasSnippet(value, preset.snippet)
          const isAmdOnly = preset.id === 'fsr' && !gpuInfo?.hasAmd
          return (
            <button
              key={preset.id}
              onClick={() => toggleSnippet(preset.snippet)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30 text-foreground',
                isAmdOnly && 'opacity-60'
              )}
              title={isAmdOnly ? 'AMD GPU not detected' : preset.snippet}
            >
              {active ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {preset.label}
              {active && <Check className="h-3 w-3" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
