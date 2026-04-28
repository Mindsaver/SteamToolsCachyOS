export interface MangoHudConfigEntry {
  key: string
  value: string
}

export interface MangoHudConfigDoc {
  entries: MangoHudConfigEntry[]
  rawText: string
}

function isCommentLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('#') || t.startsWith(';')
}

export function parseMangoHudConfigText(rawText: string): MangoHudConfigDoc {
  const entries: MangoHudConfigEntry[] = []
  for (const rawLine of rawText.split('\n')) {
    const line = rawLine.trim()
    if (!line || isCommentLine(line)) continue
    const idx = line.indexOf('=')
    if (idx < 0) {
      // MangoHud supports bare flags like `gpu_stats` / `fps`.
      // Represent them as enabled booleans in structured mode.
      entries.push({ key: line, value: '1' })
      continue
    }
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (!key) continue
    entries.push({ key, value })
  }
  return { entries, rawText }
}

export function serializeMangoHudEntries(entries: MangoHudConfigEntry[]): string {
  return entries
    .filter((e) => e.key.trim().length > 0)
    .map((e) => `${e.key.trim()}=${e.value}`)
    .join('\n')
}

export function mergeMangoHudEntry(
  entries: MangoHudConfigEntry[],
  key: string,
  value: string
): MangoHudConfigEntry[] {
  const next = [...entries]
  const idx = next.findIndex((e) => e.key === key)
  if (idx >= 0) {
    next[idx] = { key, value }
  } else {
    next.push({ key, value })
  }
  return next
}
