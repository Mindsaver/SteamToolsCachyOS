import React, { useEffect, useState } from 'react'
import { Save, FolderOpen, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import { Select } from '../components/ui/select'
import { api } from '../lib/ipc'
import type { AppSettings } from '../../shared/types'

const DEFAULTS: AppSettings = {
  steamPath: null,
  hubRoot: null,
  gameFilter: 'heuristic',
  autoUpdate: true,
  autoUpdateThrottleHours: 1,
  theme: 'dark',
}

export function Settings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    api.getSettings().then(setSettings)
  }, [])

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    const result = await api.setSettings(settings)
    setSaving(false)
    if (result?.ok) {
      toast.success('Settings saved')
    } else {
      toast.error('Failed to save settings')
    }
  }

  const handleBrowseSteam = async () => {
    const dir = await api.openDirDialog()
    if (dir) update('steamPath', dir)
  }

  const handleBrowseHub = async () => {
    const dir = await api.openDirDialog()
    if (dir) update('hubRoot', dir)
  }

  const handleCheckUpdate = async () => {
    setChecking(true)
    await api.checkForUpdates()
    setChecking(false)
    toast.info('Update check triggered — watch for the banner')
  }

  return (
    <div className="p-6 space-y-5 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure paths, behavior, and appearance</p>
      </div>

      {/* Steam path */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Steam installation path</CardTitle>
          <CardDescription>Leave empty for autodetection (recommended)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={settings.steamPath ?? ''}
              onChange={(e) => update('steamPath', e.target.value || null)}
              placeholder="Auto-detect (~/.local/share/Steam)"
              className="flex-1 font-mono text-sm"
            />
            <Button variant="outline" size="icon" onClick={handleBrowseSteam}>
              <FolderOpen className="h-4 w-4" />
            </Button>
            {settings.steamPath && (
              <Button variant="ghost" size="icon" onClick={() => update('steamPath', null)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Hub root */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Symlink hub directory</CardTitle>
          <CardDescription>Where per-game folders are created. Default: ~/SteamToolsCachyOS</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={settings.hubRoot ?? ''}
              onChange={(e) => update('hubRoot', e.target.value || null)}
              placeholder="~/SteamToolsCachyOS"
              className="flex-1 font-mono text-sm"
            />
            <Button variant="outline" size="icon" onClick={handleBrowseHub}>
              <FolderOpen className="h-4 w-4" />
            </Button>
            {settings.hubRoot && (
              <Button variant="ghost" size="icon" onClick={() => update('hubRoot', null)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Game filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Default game filter</CardTitle>
          <CardDescription>Controls which Steam apps are included in the library scan</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={settings.gameFilter}
            onChange={(e) => update('gameFilter', e.target.value as AppSettings['gameFilter'])}
            className="w-64"
          >
            <option value="heuristic">Heuristic (skip Proton, SLR, redistributables)</option>
            <option value="all">All entries</option>
          </Select>
        </CardContent>
      </Card>

      {/* Updates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Updates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Automatic update check on startup</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Checks GitHub Releases once per throttle interval
              </p>
            </div>
            <Switch
              checked={settings.autoUpdate}
              onCheckedChange={(v) => update('autoUpdate', v)}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium">Check interval (hours)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Minimum 0.083 (5 min)</p>
            </div>
            <Input
              type="number"
              min={0.083}
              step={0.5}
              value={settings.autoUpdateThrottleHours}
              onChange={(e) => update('autoUpdateThrottleHours', parseFloat(e.target.value) || 1)}
              className="w-24 text-right"
              disabled={!settings.autoUpdate}
            />
          </div>

          <Button variant="outline" size="sm" onClick={handleCheckUpdate} disabled={checking}>
            {checking ? 'Checking…' : 'Check for updates now'}
          </Button>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={settings.theme}
            onChange={(e) => update('theme', e.target.value as AppSettings['theme'])}
            className="w-40"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">Follow system</option>
          </Select>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  )
}
