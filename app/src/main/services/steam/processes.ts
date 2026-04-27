import { execSync, spawn } from 'child_process'

// Detect if Steam is running and provide a close action

export function isSteamRunning(): boolean {
  try {
    const out = execSync('pgrep -x steam || pgrep -x "steam" || pgrep -f "steam/ubuntu12_32/steam"', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out.length > 0
  } catch {
    return false
  }
}

export function closeSteam(): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn('steam', ['-shutdown'], { stdio: 'ignore', detached: true })
    proc.unref()

    const start = Date.now()
    const poll = setInterval(() => {
      if (!isSteamRunning() || Date.now() - start > 15000) {
        clearInterval(poll)
        resolve()
      }
    }, 500)
  })
}
