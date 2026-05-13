import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, ExternalLink, Package, X } from 'lucide-react'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { api } from '../lib/ipc'
import { useCompatUpdate } from '../context/CompatUpdateContext'
import { providerLabel } from '../lib/compatToolsShared'
import type { CompatProviderId } from '../../shared/types'

const PROVIDERS: CompatProviderId[] = ['ge_proton', 'proton_cachyos']

export function CompatToolsUpdateBanner() {
  const navigate = useNavigate()
  const { checks, installing, installForProvider, installProgress } = useCompatUpdate()
  const [dismissed, setDismissed] = useState<Partial<Record<CompatProviderId, boolean>>>({})
  const lastSeenTag = useRef<Partial<Record<CompatProviderId, string>>>({})

  useEffect(() => {
    for (const p of PROVIDERS) {
      const tag = checks[p]?.remoteTag ?? ''
      if (tag && tag !== lastSeenTag.current[p]) {
        lastSeenTag.current[p] = tag
        setDismissed((d) => ({ ...d, [p]: false }))
      }
    }
  }, [checks])

  const pending = useMemo(
    () =>
      PROVIDERS.map((p) => ({ provider: p, r: checks[p] })).filter(
        (x) => x.r?.hasUpdate && Boolean(x.r.remoteTag) && !dismissed[x.provider]
      ),
    [checks, dismissed]
  )

  if (!pending.length) return null

  return (
    <div className="flex flex-col gap-2">
      {pending.map(({ provider, r }) => {
        const rowProgress = installProgress?.provider === provider ? installProgress : null
        const showProgress = Boolean(installing[provider] || rowProgress)

        return (
          <div
            key={provider}
            className="flex flex-col gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 py-2.5 text-sm"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Package className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium leading-tight">{providerLabel(provider)} — update available</p>
                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{r!.remoteTag}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={Boolean(installing[provider])}
                  onClick={() => void installForProvider(provider)}
                >
                  <Download className="h-3.5 w-3.5" />
                  {installing[provider] ? 'Installing…' : 'Install this update'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/compat-tools?provider=${provider}`)}>
                  Compat tools
                </Button>
                {r!.releaseUrl ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Open release"
                    onClick={() => void api.openExternalUrl(r!.releaseUrl!)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title="Dismiss"
                  onClick={() => setDismissed((d) => ({ ...d, [provider]: true }))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {showProgress ? (
              <div className="space-y-1.5 w-full min-w-0 border-t border-primary/15 pt-2">
                <Progress
                  value={rowProgress?.percent ?? 0}
                  indeterminate={rowProgress ? rowProgress.indeterminate : true}
                  className="h-2"
                />
                <p className="text-[11px] text-muted-foreground truncate">
                  {rowProgress?.subtitle ?? (installing[provider] ? 'Preparing download…' : '')}
                </p>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
