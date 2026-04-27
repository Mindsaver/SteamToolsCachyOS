import React, { useState } from 'react'
import { Play, RotateCcw, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Switch } from '../components/ui/switch'
import { Input } from '../components/ui/input'
import { Progress } from '../components/ui/progress'
import { LogStream } from '../components/LogStream'
import { api } from '../lib/ipc'
import type { SymlinkProgress, GameFilter } from '../../shared/types'

export function SymlinkHub() {
  const [filter, setFilter] = useState<GameFilter>('heuristic')
  const [hubRoot, setHubRoot] = useState('')
  const [dryRun, setDryRun] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<SymlinkProgress[]>([])

  const handleBrowseHub = async () => {
    const dir = await api.openDirDialog()
    if (dir) setHubRoot(dir)
  }

  const handleRun = async () => {
    setLogs([])
    setProgress(0)
    setRunning(true)

    const off = api.onSymlinkProgress((p) => {
      setLogs((prev) => [...prev, p])
      if (p.type === 'progress' && p.total) {
        setProgress(Math.round(((p.current ?? 0) / p.total) * 100))
      }
    })

    const result = await api.runSymlinkHub({
      mode: 'folders',
      filter,
      hubRoot: hubRoot || undefined,
      dryRun,
    })

    off()
    setRunning(false)

    if (result?.ok) {
      toast.success(dryRun ? 'Dry run complete' : 'Symlink hub built successfully')
    } else {
      toast.error(result?.error ?? 'Failed to run symlink hub')
    }
  }

  return (
    <div className="p-6 space-y-5 h-full flex flex-col">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Symlink Hub</h1>
        <p className="text-muted-foreground mt-1">
          Create <code className="text-xs bg-muted px-1 py-0.5 rounded">~/SteamToolsCachyOS/&lt;Game&gt;/</code> folders
          with symlinks to each game's install dir, Proton prefix, system32, and userdata.
          To copy the FSR DLL into game prefixes, use the <strong>FSR DLL</strong> page.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Game filter</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as GameFilter)}
              className="w-full"
            >
              <option value="heuristic">Heuristic (skip Proton, SLR, redistributables)</option>
              <option value="all">All entries</option>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Hub directory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={hubRoot}
                onChange={(e) => setHubRoot(e.target.value)}
                placeholder="Default: ~/SteamToolsCachyOS"
                className="flex-1"
              />
              <Button variant="outline" onClick={handleBrowseHub} size="icon">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Switch checked={dryRun} onCheckedChange={setDryRun} />
          <span className="text-sm">Dry run (no changes written)</span>
        </label>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleRun} disabled={running} className="gap-2">
          <Play className="h-4 w-4" />
          {running ? 'Running…' : dryRun ? 'Dry Run' : 'Build Symlink Hub'}
        </Button>
        {logs.length > 0 && !running && (
          <Button variant="ghost" onClick={() => { setLogs([]); setProgress(0) }}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Clear
          </Button>
        )}
      </div>

      {running && <Progress value={progress} />}

      <div className="flex-1 min-h-0">
        <LogStream lines={logs} className="h-full" />
      </div>
    </div>
  )
}
