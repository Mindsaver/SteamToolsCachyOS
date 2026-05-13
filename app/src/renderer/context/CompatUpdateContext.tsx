import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/ipc'
import { installCompatToolUpdateFromCheck } from '../lib/installCompatFromCheck'
import type { CompatProviderId, CompatUpdateCheckResult } from '../../shared/types'

type ChecksMap = Partial<Record<CompatProviderId, CompatUpdateCheckResult>>

export type CompatInstallProgressUi = {
  provider: CompatProviderId
  percent: number
  indeterminate: boolean
  subtitle: string
}

type CompatUpdateContextValue = {
  checks: ChecksMap
  setCheckResult: (r: CompatUpdateCheckResult) => void
  clearCheck: (provider: CompatProviderId) => void
  installing: Partial<Record<CompatProviderId, boolean>>
  installForProvider: (provider: CompatProviderId) => Promise<void>
  /** Live progress for the compat install IPC stream (banner + shared UI). */
  installProgress: CompatInstallProgressUi | null
  beginCompatInstallProgress: (provider: CompatProviderId) => void
  endCompatInstallProgress: () => void
  /** Incremented after a successful compat install (any path) so pages can refresh lists. */
  installSuccessNonce: number
  bumpInstallSuccess: () => void
}

const CompatUpdateContext = createContext<CompatUpdateContextValue | null>(null)

export function CompatUpdateProvider({ children }: { children: React.ReactNode }) {
  const [checks, setChecks] = useState<ChecksMap>({})
  const [installing, setInstalling] = useState<Partial<Record<CompatProviderId, boolean>>>({})
  const [installProgress, setInstallProgress] = useState<CompatInstallProgressUi | null>(null)
  const [installSuccessNonce, setInstallSuccessNonce] = useState(0)
  const checksRef = useRef(checks)
  checksRef.current = checks
  const progressTrackingRef = useRef<CompatProviderId | null>(null)

  const endCompatInstallProgress = useCallback(() => {
    progressTrackingRef.current = null
    setInstallProgress(null)
  }, [])

  const beginCompatInstallProgress = useCallback((provider: CompatProviderId) => {
    progressTrackingRef.current = provider
    setInstallProgress({
      provider,
      percent: 0,
      indeterminate: true,
      subtitle: 'Starting…',
    })
  }, [])

  useEffect(() => {
    return api.onCompatToolsProgress((ev) => {
      const p = progressTrackingRef.current
      if (!p) return
      if (ev.type === 'progress') {
        const knownTotal = ev.total != null && ev.total > 0
        setInstallProgress({
          provider: p,
          percent: knownTotal ? Math.round(((ev.current ?? 0) / ev.total!) * 100) : 0,
          indeterminate: !knownTotal,
          subtitle: ev.message,
        })
        return
      }
      if (ev.type === 'log') {
        setInstallProgress((prev) =>
          prev && prev.provider === p ? { ...prev, subtitle: ev.message } : prev
        )
        return
      }
      if (ev.type === 'done' || ev.type === 'error') {
        endCompatInstallProgress()
      }
    })
  }, [endCompatInstallProgress])

  useEffect(() => {
    return api.onCompatToolsCheckResult((r) => {
      setChecks((c) => ({ ...c, [r.provider]: r }))
    })
  }, [])

  const setCheckResult = useCallback((r: CompatUpdateCheckResult) => {
    setChecks((c) => ({ ...c, [r.provider]: r }))
  }, [])

  const clearCheck = useCallback((provider: CompatProviderId) => {
    setChecks((c) => {
      const n = { ...c }
      delete n[provider]
      return n
    })
  }, [])

  const bumpInstallSuccess = useCallback(() => {
    setInstallSuccessNonce((n) => n + 1)
  }, [])

  const installForProvider = useCallback(async (provider: CompatProviderId) => {
    const r = checksRef.current[provider]
    const tag = r?.remoteTag
    if (!tag || !r?.hasUpdate) return
    setInstalling((m) => ({ ...m, [provider]: true }))
    beginCompatInstallProgress(provider)
    try {
      const steamRunning = await api.isSteamRunning()
      if (steamRunning) {
        toast.info(
          'Steam is running — you can still install. Restart Steam afterward so the new tool shows up in the compatibility list.'
        )
      }
      const result = await installCompatToolUpdateFromCheck({ provider, remoteTag: tag })
      if (result.ok) {
        toast.success('Installed')
        clearCheck(provider)
        bumpInstallSuccess()
      } else {
        toast.error(result.error)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Install failed')
    } finally {
      setInstalling((m) => ({ ...m, [provider]: false }))
      endCompatInstallProgress()
    }
  }, [clearCheck, bumpInstallSuccess, beginCompatInstallProgress, endCompatInstallProgress])

  const value = useMemo(
    () => ({
      checks,
      setCheckResult,
      clearCheck,
      installing,
      installForProvider,
      installProgress,
      beginCompatInstallProgress,
      endCompatInstallProgress,
      installSuccessNonce,
      bumpInstallSuccess,
    }),
    [
      checks,
      setCheckResult,
      clearCheck,
      installing,
      installForProvider,
      installProgress,
      beginCompatInstallProgress,
      endCompatInstallProgress,
      installSuccessNonce,
      bumpInstallSuccess,
    ]
  )

  return <CompatUpdateContext.Provider value={value}>{children}</CompatUpdateContext.Provider>
}

export function useCompatUpdate(): CompatUpdateContextValue {
  const v = useContext(CompatUpdateContext)
  if (!v) throw new Error('useCompatUpdate must be used within CompatUpdateProvider')
  return v
}
