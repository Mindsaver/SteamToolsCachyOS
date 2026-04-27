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
  onProgress({ type: 'log', message: `Copying DLL to ${targets.length} game prefixes…` })

  let done = 0
  for (const game of targets) {
    done++
    const dest = path.join(game.system32Path!, 'amdxcffx64.dll')
    try {
      fs.copyFileSync(resolved, dest)
      onProgress({
        type: 'progress',
        message: `[${done}/${targets.length}] ${game.name}`,
        current: done,
        total: targets.length,
      })
    } catch (e) {
      onProgress({
        type: 'log',
        message: `  WARN: Failed to copy to ${game.name}: ${e}`,
      })
    }
  }

  onProgress({ type: 'done', message: `DLL copy done (${done} targets).`, exitCode: 0 })
}
