import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Download,
  RefreshCw,
  FolderOpen,
  FileCode2,
  FileCog,
  ExternalLink,
  Package,
  Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Switch } from '../components/ui/switch'
import { Progress } from '../components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { LogStream } from '../components/LogStream'
import { SteamStatusPill } from '../components/SteamStatusPill'
import { api } from '../lib/ipc'
import { isRollingLineCompatToolRow } from '../../shared/compatToolsPure'
import type {
  AppSettings,
  CompatGithubReleaseRow,
  CompatInstallProgress,
  CompatProviderId,
  CompatReleaseChannel,
  InstalledCompatToolRow,
  CompatUpdateCheckResult,
} from '../../shared/types'

/** `<select>` value: install repository HEAD (`releases[0]`), not a duplicate of the first tag row. */
const INSTALL_LATEST_SENTINEL = '__install_latest__'

function providerLabel(p: CompatProviderId): string {
  return p === 'ge_proton' ? 'GE-Proton' : 'Proton-CachyOS'
}

/** Latest-line installs show per-row auto update (+ CachyOS cog). Bound row still shows if name changed. */
function showRollingControlsOnInstalledRow(row: InstalledCompatToolRow, s: AppSettings): boolean {
  if (row.provider === 'ge_proton') {
    return isRollingLineCompatToolRow(row) || s.geProtonAutoUpdateInternalName === row.internalName
  }
  if (row.provider === 'proton_cachyos') {
    return isRollingLineCompatToolRow(row) || s.protonCachyosAutoUpdateInternalName === row.internalName
  }
  return false
}

function normalizeReleaseChannel(
  s: AppSettings,
  p: CompatProviderId
): CompatReleaseChannel {
  const raw = p === 'ge_proton' ? s.geProtonChannel : s.protonCachyosChannel
  return raw === 'rolling' || raw === 'pinned' ? raw : 'pinned'
}

function normalizeCompatSettings(s: AppSettings): AppSettings {
  return {
    ...s,
    geProtonChannel:
      s.geProtonChannel === 'rolling' || s.geProtonChannel === 'pinned' ? s.geProtonChannel : 'pinned',
    protonCachyosChannel:
      s.protonCachyosChannel === 'rolling' || s.protonCachyosChannel === 'pinned'
        ? s.protonCachyosChannel
        : 'pinned',
    geProtonAutoUpdate: Boolean(s.geProtonAutoUpdate),
    protonCachyosAutoUpdate: Boolean(s.protonCachyosAutoUpdate),
    geProtonAutoUpdateInternalName: s.geProtonAutoUpdateInternalName ?? null,
    protonCachyosAutoUpdateInternalName: s.protonCachyosAutoUpdateInternalName ?? null,
    geProtonPinnedTag: s.geProtonPinnedTag ?? null,
    protonCachyosPinnedTag: s.protonCachyosPinnedTag ?? null,
    protonCachyosSlrOnly: s.protonCachyosSlrOnly !== false,
    protonCachyosArch: s.protonCachyosArch === 'x86_64_v4' ? 'x86_64_v4' : 'x86_64',
  }
}

export function CompatTools() {
  const navigate = useNavigate()
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
  const [cachyosDialogOpen, setCachyosDialogOpen] = useState(false)

  const loadSettings = useCallback(async () => {
    const s = await api.getSettings()
    setSettings(normalizeCompatSettings(s))
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
    if (!releases.length || !settings) return
    const ch = normalizeReleaseChannel(settings, provider)
    const pin = provider === 'ge_proton' ? settings.geProtonPinnedTag : settings.protonCachyosPinnedTag
    setSelectedTag((prev) => {
      if (ch === 'pinned' && pin && releases.some((r) => r.tag_name === pin)) return pin
      if (prev === INSTALL_LATEST_SENTINEL) return INSTALL_LATEST_SENTINEL
      if (prev && releases.some((r) => r.tag_name === prev)) return prev
      return INSTALL_LATEST_SENTINEL
    })
  }, [releases, settings, provider])

  useEffect(() => {
    const off = api.onCompatToolsProgress((p) => {
      if (p.type === 'progress') {
        if (p.total) {
          setProgress(Math.round(((p.current ?? 0) / p.total) * 100))
        }
        return
      }
      setLogs((prev) => [...prev, p])
      if (p.type === 'error') toast.error(p.message)
      if (p.type === 'done') toast.success(p.message)
    })
    return off
  }, [])

  const persistSettings = async (next: Partial<AppSettings>) => {
    const base = (await api.getSettings()) ?? settings
    if (!base) return
    const merged = normalizeCompatSettings({ ...base, ...next } as AppSettings)
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

  const setAutoUpdateForRow = (row: InstalledCompatToolRow, enabled: boolean) => {
    if (row.provider === 'ge_proton') {
      if (enabled) {
        void persistSettings({
          geProtonAutoUpdate: true,
          geProtonAutoUpdateInternalName: row.internalName,
        })
      } else if (settings?.geProtonAutoUpdateInternalName === row.internalName) {
        void persistSettings({ geProtonAutoUpdate: false, geProtonAutoUpdateInternalName: null })
      }
      return
    }
    if (row.provider === 'proton_cachyos') {
      if (enabled) {
        void persistSettings({
          protonCachyosAutoUpdate: true,
          protonCachyosAutoUpdateInternalName: row.internalName,
        })
      } else if (settings?.protonCachyosAutoUpdateInternalName === row.internalName) {
        void persistSettings({ protonCachyosAutoUpdate: false, protonCachyosAutoUpdateInternalName: null })
      }
    }
  }

  const handleInstall = async () => {
    const raw = await api.getSettings()
    const s = normalizeCompatSettings(raw)
    const ch = normalizeReleaseChannel(s, provider)
    const tag =
      selectedTag === INSTALL_LATEST_SENTINEL ? releases[0]?.tag_name : selectedTag
    if (!tag || !releases.some((r) => r.tag_name === tag)) return
    if (steamRunning) {
      toast.info(
        'Steam is running — you can still install. Restart Steam afterward so the new tool shows up in the compatibility list.'
      )
    }
    setLogs([])
    setProgress(0)
    setInstalling(true)
    try {
      const result = await api.installCompatRelease({
        provider,
        tag,
        cachyosArch: provider === 'proton_cachyos' ? s.protonCachyosArch : undefined,
        installLayout: selectedTag === INSTALL_LATEST_SENTINEL ? 'latest_slot' : 'default',
      })
      if (result?.ok) {
        toast.success('Installed')
        if (ch === 'pinned') {
          await persistSettings(
            provider === 'ge_proton' ? { geProtonPinnedTag: tag } : { protonCachyosPinnedTag: tag }
          )
        }
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

  const selectedTagValid = Boolean(
    releases.length &&
      (selectedTag === INSTALL_LATEST_SENTINEL ||
        Boolean(selectedTag && releases.some((r) => r.tag_name === selectedTag)))
  )
  const canInstall = selectedTagValid && !loading

  const onTagSelectChange = (v: string) => {
    setSelectedTag(v)
    if (v === INSTALL_LATEST_SENTINEL) {
      void persistSettings(provider === 'ge_proton' ? { geProtonPinnedTag: null } : { protonCachyosPinnedTag: null })
    } else {
      void persistSettings(
        provider === 'ge_proton' ? { geProtonPinnedTag: v } : { protonCachyosPinnedTag: v }
      )
    }
  }

  const hasCachyRollingRow =
    provider === 'proton_cachyos' &&
    settings &&
    filteredInstalled.some((r) => showRollingControlsOnInstalledRow(r, settings))

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
            Installs whose name looks like the <strong>Latest</strong> line show <strong>Auto update</strong> on that row
            (background GitHub checks; throttle in Settings). Other installed builds are listed without that control.             Under <strong>Install release</strong>, <strong>Latest</strong> is always the first option (current HEAD); then
            all tags. Set{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">STEAMTOOLS_GITHUB_TOKEN</code> if you hit API limits.
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
        {provider === 'proton_cachyos' && settings && !hasCachyRollingRow && (
          <Button variant="outline" size="sm" type="button" onClick={() => setCachyosDialogOpen(true)}>
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            SLR &amp; arch
          </Button>
        )}
      </div>

      {provider === 'proton_cachyos' && settings && (
        <Dialog open={cachyosDialogOpen} onOpenChange={setCachyosDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Proton-CachyOS</DialogTitle>
              <DialogDescription>Filter the tag list and pick the archive architecture.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <Switch
                  checked={settings.protonCachyosSlrOnly}
                  onCheckedChange={(v) => {
                    void persistSettings({ protonCachyosSlrOnly: v }).then(() => void loadReleases())
                  }}
                />
                SLR tags only (<code className="text-xs">-slr</code>)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">Arch</span>
                <Select
                  value={settings.protonCachyosArch}
                  onChange={(e) =>
                    void persistSettings({
                      protonCachyosArch: e.target.value as AppSettings['protonCachyosArch'],
                    })
                  }
                  className="flex-1 min-w-0"
                >
                  <option value="x86_64">x86_64 (recommended)</option>
                  <option value="x86_64_v4">x86_64_v4 (experimental)</option>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setCachyosDialogOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div className="grid gap-4 lg:grid-cols-2 flex-1 min-h-0">
        <Card className="min-h-[200px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Installed ({providerLabel(provider)})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm flex-1 flex flex-col">
            {filteredInstalled.length === 0 ? (
              <p className="text-muted-foreground">No matching tools detected.</p>
            ) : (
              <ul className="space-y-2">
                {filteredInstalled.map((row) => {
                  const rollingRow = Boolean(settings && showRollingControlsOnInstalledRow(row, settings))
                  const geBound = settings?.geProtonAutoUpdateInternalName === row.internalName
                  const caBound = settings?.protonCachyosAutoUpdateInternalName === row.internalName
                  const autoOn =
                    row.provider === 'ge_proton'
                      ? Boolean(settings?.geProtonAutoUpdate && geBound)
                      : Boolean(settings?.protonCachyosAutoUpdate && caBound)

                  return (
                    <li key={row.installPath} className="border border-border rounded-md px-2 py-2 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
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
                            title="Edit user_settings in app"
                            onClick={() =>
                              navigate(`/proton-user-settings?tool=${encodeURIComponent(row.internalName)}`)
                            }
                          >
                            <FileCog className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="user_settings.py in editor"
                            onClick={() => void api.openCompatUserSettings(row.internalName)}
                          >
                            <FileCode2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {settings && rollingRow && (
                        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                            <Switch
                              type="button"
                              checked={autoOn}
                              onCheckedChange={(v) => setAutoUpdateForRow(row, v)}
                            />
                            <span>Auto update</span>
                          </label>
                          {row.provider === 'proton_cachyos' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              title="SLR filter & architecture"
                              onClick={() => setCachyosDialogOpen(true)}
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[200px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Install release</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 flex-1 flex flex-col">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Version to install</p>
              <Select
                value={selectedTag}
                onChange={(e) => onTagSelectChange(e.target.value)}
                className="flex-1 min-w-[200px] w-full"
                disabled={!releases.length || loading}
              >
                <option value={INSTALL_LATEST_SENTINEL}>
                  Latest ({releases[0]?.tag_name ?? '—'})
                </option>
                {releases.slice(1).map((r) => (
                  <option key={r.tag_name} value={r.tag_name}>
                    {r.tag_name}
                    {r.published_at ? ` — ${r.published_at.slice(0, 10)}` : ''}
                  </option>
                ))}
              </Select>
            </div>

            {checkResult?.releaseUrl && (
              <Button variant="ghost" size="icon" title="Open release" onClick={() => api.openExternalUrl(checkResult.releaseUrl!)}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            <Button
              onClick={() => void handleInstall()}
              disabled={installing || !canInstall}
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
