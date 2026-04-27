import React, { useEffect, useState } from 'react'
import { Circle, AlertCircle } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import { api } from '../lib/ipc'

interface SteamStatusPillProps {
  onStatusChange?: (running: boolean) => void
}

export function SteamStatusPill({ onStatusChange }: SteamStatusPillProps) {
  const [running, setRunning] = useState<boolean | null>(null)
  const [closing, setClosing] = useState(false)

  const check = async () => {
    const r = await api.isSteamRunning()
    setRunning(r)
    onStatusChange?.(r)
  }

  useEffect(() => {
    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [])

  const handleClose = async () => {
    setClosing(true)
    await api.closeSteam()
    await check()
    setClosing(false)
  }

  if (running === null) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
        <Circle className="h-2 w-2 fill-muted-foreground" />
        Checking…
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
        running
          ? 'border-green-600/40 bg-green-600/10 text-green-400'
          : 'border-muted bg-muted/20 text-muted-foreground'
      )}
    >
      <Circle className={cn('h-2 w-2', running ? 'fill-green-400' : 'fill-muted-foreground')} />
      Steam {running ? 'running' : 'closed'}
      {running && (
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
          onClick={handleClose}
          disabled={closing}
        >
          <AlertCircle className="h-3 w-3 mr-1" />
          {closing ? 'Closing…' : 'Close Steam'}
        </Button>
      )}
    </div>
  )
}
