// Ports scripts/launch_options_compose.py
// Parses and serializes Steam per-game launch option strings.

export const COMMAND_TOKEN = '%command%'

export interface BatchSnippet {
  id: string
  label: string
  snippet: string
}

export const BATCH_SNIPPETS: BatchSnippet[] = [
  { id: 'proton_log', label: 'PROTON_LOG=1', snippet: 'PROTON_LOG=1' },
  { id: 'mangohud', label: 'MangoHud', snippet: 'mangohud' },
  { id: 'gamemode', label: 'GameMode', snippet: 'gamemode' },
  { id: 'game_performance', label: 'game-performance', snippet: 'game-performance' },
  { id: 'mangohud_gamemode', label: 'MangoHud + GameMode', snippet: 'mangohud gamemode' },
  { id: 'proton_log_mangohud', label: 'PROTON_LOG=1 + MangoHud', snippet: 'PROTON_LOG=1 mangohud' },
  { id: 'wined3d', label: 'Use WineD3D (PROTON_USE_WINED3D=1)', snippet: 'PROTON_USE_WINED3D=1' },
  { id: 'fsr', label: 'WINE_FULLSCREEN_FSR=1', snippet: 'WINE_FULLSCREEN_FSR=1' },
  { id: 'esync', label: 'PROTON_NO_ESYNC=1', snippet: 'PROTON_NO_ESYNC=1' },
  { id: 'fsync', label: 'PROTON_NO_FSYNC=1', snippet: 'PROTON_NO_FSYNC=1' },
]

/**
 * Insert snippet tokens before existing prefix (and before %command% if present).
 * Mirrors launch_options_compose.merge_snippet_prefix.
 */
export function mergeSnippetPrefix(current: string, snippet: string): string {
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

/**
 * Remove a snippet from the launch options string.
 */
export function removeSnippet(current: string, snippet: string): string {
  if (!snippet.trim()) return current
  const tokens = snippet.trim().split(/\s+/)
  let result = current
  for (const token of tokens) {
    result = result.replace(new RegExp(`(?:^|\\s)${escapeRegex(token)}(?=\\s|$)`, 'g'), ' ')
  }
  return result.trim().replace(/\s+/g, ' ')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Check if the current launch options string contains a snippet.
 */
export function hasSnippet(current: string, snippet: string): boolean {
  const tokens = snippet.trim().split(/\s+/)
  const currentTokens = current.split(/\s+/)
  return tokens.every((t) => currentTokens.includes(t))
}

/**
 * Ensure %command% is present in options string.
 */
export function ensureCommandToken(options: string): string {
  const trimmed = options.trim()
  if (!trimmed) return ''
  if (trimmed.includes(COMMAND_TOKEN)) return trimmed
  return `${trimmed} ${COMMAND_TOKEN}`
}

/**
 * Parse the options string into env vars prefix, command token, and suffix.
 */
export function parseOptionsStructure(options: string): {
  prefix: string
  hasCommand: boolean
  suffix: string
} {
  const trimmed = options.trim()
  if (!trimmed.includes(COMMAND_TOKEN)) {
    return { prefix: trimmed, hasCommand: false, suffix: '' }
  }
  const idx = trimmed.indexOf(COMMAND_TOKEN)
  return {
    prefix: trimmed.slice(0, idx).trim(),
    hasCommand: true,
    suffix: trimmed.slice(idx + COMMAND_TOKEN.length).trim(),
  }
}
