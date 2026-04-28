/**
 * Parse and format Proton `user_settings.py` dict fragments.
 * No Node deps — safe in renderer and main.
 */

const USER_SETTINGS_KV_RE = /['"]([A-Za-z_][A-Za-z0-9_]*)['"]:\s*['"]([^'"]*)['"]/g

export function stripPyCommentsForUserSettings(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('#')) return ''
      const hashIdx = line.indexOf('#')
      return hashIdx >= 0 ? line.slice(0, hashIdx) : line
    })
    .join('\n')
}

/** Extract "KEY": "value" pairs from stripped Python source (whole file or dict body). */
export function parseUserSettingsEnvFromText(text: string): Record<string, string> {
  const body = stripPyCommentsForUserSettings(text)
  const out: Record<string, string> = {}
  let m: RegExpExecArray | null
  const re = new RegExp(USER_SETTINGS_KV_RE.source, 'g')
  while ((m = re.exec(body)) !== null) {
    out[m[1]] = m[2]
  }
  return out
}

function escapePyString(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Inner `{ ... }` only (no `user_settings =`). */
export function formatUserSettingsDictBody(env: Record<string, string>): string {
  const keys = Object.keys(env).sort()
  if (keys.length === 0) return '{\n}'
  const lines = keys.map((k) => `  "${escapePyString(k)}": "${escapePyString(env[k]!)}"`)
  return `{\n${lines.join(',\n')}\n}`
}

export function formatUserSettingsPyFile(env: Record<string, string>): string {
  return `# Edited in SteamTools — Proton user_settings\nuser_settings = ${formatUserSettingsDictBody(env)}\n`
}

/** Find `user_settings = {` … matching `}` and return [start, endExclusive) of entire `user_settings = {...}` span, or null. */
export function findUserSettingsAssignmentSpan(source: string): { start: number; end: number } | null {
  const m = /user_settings\s*=\s*\{/.exec(source)
  if (!m || m.index === undefined) return null
  const start = m.index
  const startBrace = source.indexOf('{', start)
  if (startBrace < 0) return null
  let depth = 0
  let i = startBrace
  for (; i < source.length; i++) {
    const c = source[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        return { start, end: i + 1 }
      }
    }
  }
  return null
}

/** Replace or insert `user_settings = { ... }`. If no block exists, append a new one (preserves leading content). */
export function replaceUserSettingsDictInSource(source: string, env: Record<string, string>): string {
  const block = `user_settings = ${formatUserSettingsDictBody(env)}`
  const span = findUserSettingsAssignmentSpan(source)
  if (span) {
    return source.slice(0, span.start) + block + source.slice(span.end)
  }
  const trimmed = source.trimEnd()
  if (!trimmed) return formatUserSettingsPyFile(env)
  return `${trimmed}\n\n${block}\n`
}
