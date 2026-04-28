import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, RefreshCw, X } from 'lucide-react'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { api } from '../lib/ipc'

interface UpdateState {
  available: boolean
  version: string | null
  downloaded: boolean
  downloading: boolean
  installing: boolean
  progress: number
  dismissed: boolean
}

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({
    available: false,
    version: null,
    downloaded: false,
    downloading: false,
    installing: false,
    progress: 0,
    dismissed: false,
  })

  useEffect(() => {
    const offAvail = api.onUpdateAvailable((info) => {
      setState((s) => ({
        ...s,
        available: true,
        version: info.version,
        dismissed: false,
      }))
    })
    const offDone = api.onUpdateDownloaded((info) => {
      setState((s) => ({ ...s, downloaded: true, downloading: false, installing: false, version: info.version }))
    })
    const offProgress = api.onUpdateProgress((p) => {
      setState((s) => ({ ...s, progress: p.percent }))
    })
    return () => {
      offAvail()
      offDone()
      offProgress()
    }
  }, [])

  useEffect(() => {
    const offNa = api.onUpdateNotAvailable(async () => {
      try {
        const { version } = await api.getAboutInfo()
        toast.success(`You're up to date (v${version}).`)
      } catch {
        toast.success("You're up to date.")
      }
    })
    const offErr = api.onUpdateError(({ message }) => {
      setState((s) => ({ ...s, installing: false }))
      toast.error(message || 'Update check failed.')
    })
    const offInstallStarted = api.onUpdateInstallStarted(() => {
      setState((s) => ({ ...s, installing: true }))
      toast.message('Restarting to install update…', {
        description: 'An authentication prompt may appear. Keep SteamTools open until prompted.',
      })
    })
    return () => {
      offNa()
      offErr()
      offInstallStarted()
    }
  }, [])

  if (!state.available || state.dismissed) return null

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm">
      <RefreshCw className="h-4 w-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        {state.downloaded ? (
          state.installing ? (
            <span>
              Preparing installer for <strong>{state.version}</strong>…
            </span>
          ) : (
            <span>
              Version <strong>{state.version}</strong> downloaded — restart to apply.
            </span>
          )
        ) : state.downloading ? (
          <div className="space-y-1">
            <span>Downloading update {state.version}…</span>
            <Progress value={state.progress} className="h-1" />
          </div>
        ) : (
          <span>
            Update available: <strong>{state.version}</strong>
          </span>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        {state.downloaded && (
          <Button
            size="sm"
            disabled={state.installing}
            onClick={async () => {
              setState((s) => ({ ...s, installing: true }))
              try {
                await api.installUpdate()
              } catch (e) {
                setState((s) => ({ ...s, installing: false }))
                toast.error(e instanceof Error ? e.message : 'Failed to start installer.')
              }
            }}
          >
            {state.installing ? 'Starting install…' : 'Restart & install'}
          </Button>
        )}
        {!state.downloaded && !state.downloading && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setState((s) => ({ ...s, downloading: true }))
              api.downloadUpdate()
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setState((s) => ({ ...s, dismissed: true }))}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
