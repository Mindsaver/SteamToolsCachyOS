import React, { useCallback, useEffect, useState } from 'react'
import {
  Download, RefreshCw, FolderOpen, FileCode2, ExternalLink, Package,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Switch } from '../components/ui/switch'
import { Progress } from '../components/ui/progress'
import { LogStream } from '../components/LogStream'
import { SteamStatusPill } from '../components/SteamStatusPill'
import { api } from '../lib/ipc'
import type {
  AppSettings,
  CompatGithubReleaseRow,
  CompatInstallProgress,
  CompatProviderId,
  InstalledCompatToolRow,
  CompatUpdateCheckResult,
} from '../../shared/types'

function providerLabel(p: CompatProviderId): string {
  return p === 'ge_proton' ? 'GE-Proton' : 'Proton-CachyOS'
}

export function CompatTools() {
  const [provider, setProvider] = useState<CompatProviderId>('ge_proton')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [steamRunning, setSteamRunning] = useState(false)
  const [installed, setInstalled] = useState<InstalledCompatToolRow[]>([])
  const [releases, setReleases] = useState<CompatGithubReleaseRow[]>([])
  const [selectedTag, setSelectedTag] = useState('')
  const [loading, setLoading] = useState(true)
  const [releasesLoading, setReleasesLoading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<CompatInstallProgress[]>([])
  const [checkResult, setCheckResult] = useState<CompatUpdateCheckResult | null>(null)

  const loadSettings = useCallback(async () => {
    const s = await api.getSettings()
    setSettings(s)
  }, [])

  const loadInstalled = useCallback(async () => {
    const rows = await api.listCompatToolsInstalled()
    setInstalled(rows ?? [])
  }, [])

  const loadReleases = useCallback(async () => {
    setReleasesLoading(true)
    try {
      const s = await api.getSettings()
      const rows = await api.listCompatReleases({
        provider,
        slrOnly: provider === 'proton_cachyos' ? s.protonCachyosSlrOnly : undefined,
      })
      setReleases(rows ?? [])
      if (rows?.length) setSelectedTag(rows[0].tag_name)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load releases')
      setReleases([])
    } finally {
      setReleasesLoading(false)
    }
  }, [provider])

  useEffect(() => {
    void loadSettings()
    void loadInstalled()
    api.isSteamRunning().then(setSteamRunning)
  }, [loadInstalled, loadSettings])

  useEffect(() => {
    setLoading(true)
    void (async () => {
      await loadReleases()
      setLoading(false)
    })()
  }, [loadReleases])

  useEffect(() => {
    const off = api.onCompatToolsProgress((p) => {
      setLogs((prev) => [...prev, p])
      if (p.type === 'progress' && p.total) {
        setProgress(Math.round(((p.current ?? 0) / p.total) * 100))
      }
      if (p.type === 'error') toast.error(p.message)
      if (p.type === 'done') toast.success(p.message)
    })
    return off
  }, [])

  const persistSettings = async (next: Partial<AppSettings>) => {
    const base = (await api.getSettings()) ?? settings
    if (!base) return
    const merged = { ...base, ...next } as AppSettings
    await api.setSettings(merged)
    setSettings(merged)
  }

  const handleCheckUpdate = async () => {
    try {
      const r = await api.checkCompatToolsUpdate(provider)
      setCheckResult(r)
      if (r.hasUpdate && r.remoteTag) {
        toast.message(`Update available: ${r.remoteTag}`, {
          description: `Installed: ${r.installedBestTag ?? 'none'}`,
        })
      } else {
        toast.success('No newer release detected for this provider')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Check failed')
    }
  }

  const handleInstall = async () => {
    if (!selectedTag) return
    if (steamRunning) {
      toast.info('Steam is running — you can still install. Restart Steam afterward so the new tool shows up in the compatibility list.')
    }
    setLogs([])
    setProgress(0)
    setInstalling(true)
    try {
      const s = await api.getSettings()
      const result = await api.installCompatRelease({
        provider,
        tag: selectedTag,
        cachyosArch: provider === 'proton_cachyos' ? s.protonCachyosArch : undefined,
      })
      if (result?.ok) {
        toast.success('Installed')
        await loadInstalled()
      } else {
        toast.error(result?.error ?? 'Install failed')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Install failed')
    } finally {
      setInstalling(false)
    }
  }

  const filteredInstalled =
    provider === 'ge_proton'
      ? installed.filter((r) => r.provider === 'ge_proton')
      : installed.filter((r) => r.provider === 'proton_cachyos')

  return (
    <div className="p-6 space-y-5 h-full flex flex-col overflow-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-7 w-7 text-primary" />
            Compatibility tools
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Install <strong>GE-Proton</strong> or <strong>Proton-CachyOS</strong> into Steam&apos;s{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">compatibilitytools.d</code>.
            Optional <strong>auto update</strong> checks GitHub in the background after you start the app (throttle
            in Settings) — you do not need to keep this page open. Set{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">STEAMTOOLS_GITHUB_TOKEN</code> if you
            hit API rate limits.
          </p>
        </div>
        <SteamStatusPill onStatusChange={setSteamRunning} />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Provider</span>
        <Select
          value={provider}
          onChange={(e) => setProvider(e.target.value as CompatProviderId)}
          className="w-48"
        >
          <option value="ge_proton">GE-Proton</option>
          <option value="proton_cachyos">Proton-CachyOS</option>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void loadReleases()} disabled={releasesLoading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${releasesLoading ? 'animate-spin' : ''}`} />
          Refresh releases
        </Button>
        <Button variant="outline" size="sm" onClick={() => void loadInstalled()}>
          Refresh installed
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void handleCheckUpdate()}>
          Check for update
        </Button>
      </div>

      {provider === 'proton_cachyos' && settings && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Proton-CachyOS options</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6 items-center">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <Switch
                checked={settings.protonCachyosSlrOnly}
                onCheckedChange={(v) => void persistSettings({ protonCachyosSlrOnly: v })}
              />
              SLR tags only (<code className="text-xs">-slr</code>)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Arch</span>
              <Select
                value={settings.protonCachyosArch}
                onChange={(e) =>
                  void persistSettings({ protonCachyosArch: e.target.value as AppSettings['protonCachyosArch'] })
                }
                className="w-44"
              >
                <option value="x86_64">x86_64 (recommended)</option>
                <option value="x86_64_v4">x86_64_v4 (experimental)</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <Switch
                checked={settings.protonCachyosTrack === 'latest'}
                onCheckedChange={(v) => void persistSettings({ protonCachyosTrack: v ? 'latest' : 'none' })}
              />
              Auto update (CachyOS)
            </label>
          </CardContent>
        </Card>
      )}

      {provider === 'ge_proton' && settings && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">GE-Proton options</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
              <Switch
                checked={settings.geProtonTrack === 'latest'}
                onCheckedChange={(v) => void persistSettings({ geProtonTrack: v ? 'latest' : 'none' })}
              />
              Auto update (GE-Proton)
            </label>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2 flex-1 min-h-0">
        <Card className="min-h-[200px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Installed ({providerLabel(provider)})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {filteredInstalled.length === 0 ? (
              <p className="text-muted-foreground">No matching tools detected.</p>
            ) : (
              <ul className="space-y-2">
                {filteredInstalled.map((row) => (
                  <li
                    key={row.installPath}
                    className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-md px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{row.displayName}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{row.internalName}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" title="Open folder" onClick={() => api.openPath(row.installPath)}>
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="user_settings.py"
                        onClick={() => void api.openCompatUserSettings(row.internalName)}
                      >
                        <FileCode2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[200px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Install release</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 flex-1 flex flex-col">
            <div className="flex flex-wrap gap-2 items-center">
              <Select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="flex-1 min-w-[200px]"
                disabled={!releases.length || loading}
              >
                {releases.map((r) => (
                  <option key={r.tag_name} value={r.tag_name}>
                    {r.tag_name}
                    {r.published_at ? ` — ${r.published_at.slice(0, 10)}` : ''}
                  </option>
                ))}
              </Select>
              {checkResult?.releaseUrl && (
                <Button variant="ghost" size="icon" title="Open release" onClick={() => api.openExternalUrl(checkResult.releaseUrl!)}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button
              onClick={() => void handleInstall()}
              disabled={installing || !selectedTag || loading}
              className="gap-2 w-fit"
            >
              <Download className="h-4 w-4" />
              {installing ? 'Installing…' : 'Download & install'}
            </Button>
            {steamRunning && (
              <p className="text-xs text-muted-foreground">
                Steam is running — install is still allowed. <span className="text-amber-500/90">Restart Steam</span>{' '}
                after install so the new build appears in Properties → Compatibility.
              </p>
            )}
            {installing && (
              <div className="space-y-1">
                <Progress value={progress} className="h-2" />
              </div>
            )}
            {logs.length > 0 && (
              <div className="flex-1 min-h-[120px] border border-border rounded-md overflow-hidden">
                <LogStream lines={logs} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
