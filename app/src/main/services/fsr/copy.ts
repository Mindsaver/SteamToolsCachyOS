import fs from 'fs'
import path from 'path'
import type { InstalledGame, SymlinkProgress } from '../../../shared/types'

type ProgressCallback = (p: SymlinkProgress) => void

export function copyDllToGames(
  dllPath: string,
  games: InstalledGame[],
  onProgress: ProgressCallback
): void {
  const resolved = path.resolve(dllPath)
  if (!fs.existsSync(resolved)) {
    onProgress({ type: 'error', message: `DLL not found: ${resolved}` })
    return
  }

  const targets = games.filter((g) => g.system32Path !== null)
  onProgress({ type: 'log', message: `Source: ${resolved}` })
  onProgress({ type: 'log', message: `Targets: ${targets.length} game prefixes` })
  onProgress({ type: 'log', message: '' })

  let done = 0
  let skipped = 0
  for (const game of targets) {
    done++
    const dest = path.join(game.system32Path!, 'amdxcffx64.dll')
    try {
      fs.copyFileSync(resolved, dest)
      onProgress({
        type: 'progress',
        message: `[${done}/${targets.length}] ${game.name}\n    → ${dest}`,
        current: done,
        total: targets.length,
      })
    } catch (e) {
      skipped++
      onProgress({
        type: 'log',
        message: `[${done}/${targets.length}] ${game.name}  WARN: ${e}`,
      })
    }
  }

  onProgress({ type: 'log', message: '' })
  onProgress({
    type: 'done',
    message: `Done — copied to ${done - skipped} prefixes${skipped ? `, ${skipped} failed` : ''}.`,
    exitCode: 0,
  })
}
