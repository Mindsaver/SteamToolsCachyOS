import React, { useEffect, useState, useCallback } from 'react'
import { Save, RefreshCw, AlertTriangle, Layers, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { GameTable } from '../components/GameTable'
import { StructuredPanel } from '../components/StructuredPanel'
import { SteamStatusPill } from '../components/SteamStatusPill'
import { Select } from '../components/ui/select'
import { api } from '../lib/ipc'
import { BATCH_SNIPPETS } from '../components/StructuredPanel'
import type { InstalledGame, GpuInfo, CompatToolInfo } from '../../shared/types'

export function LaunchOptions() {
  const [games, setGames] = useState<InstalledGame[]>([])
  const [loading, setLoading] = useState(true)
  const [steamRunning, setSteamRunning] = useState(false)
  const [selected, setSelected] = useState<InstalledGame | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null)
  const [compatInfo, setCompatInfo] = useState<CompatToolInfo | null>(null)

  // Batch
  const [batchSnippet, setBatchSnippet] = useState(BATCH_SNIPPETS[0].snippet)
  const [batchRunning, setBatchRunning] = useState(false)

  const loadGames = useCallback(async () => {
    setLoading(true)
    const list = await api.listGames()
    setGames(list ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadGames()
    api.detectGpu().then(setGpuInfo)
  }, [])

  const handleSelectGame = async (game: InstalledGame) => {
    setSelected(game)
    setEditValue(game.launchOptions ?? '')
    const compat = await api.getCompatInfo(game.appId)
    setCompatInfo(compat)
  }

  const handleSave = async () => {
    if (!selected) return
    if (steamRunning) {
      toast.error('Close Steam before saving launch options')
      return
    }
    setSaving(true)
    const result = await api.setLaunchOptions(selected.appId, editValue)
    setSaving(false)
    if (result?.ok) {
      toast.success(`Saved launch options for ${selected.name}`)
      setGames((prev) =>
        prev.map((g) => (g.appId === selected.appId ? { ...g, launchOptions: editValue } : g))
      )
      setSelected((s) => (s ? { ...s, launchOptions: editValue } : s))
    } else {
      toast.error(result?.error ?? 'Save failed')
    }
  }

  const handleBatchApply = async () => {
    if (steamRunning) {
      toast.error('Close Steam before applying batch changes')
      return
    }
    setBatchRunning(true)
    const allIds = games.map((g) => g.appId)
    const result = await api.batchSetLaunchOptions({ snippet: batchSnippet, appIds: allIds })
    setBatchRunning(false)
    if (result?.ok) {
      toast.success(`Applied "${batchSnippet}" to ${allIds.length} games`)
      await loadGames()
    } else {
      toast.error(result?.error ?? 'Batch apply failed')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-3 space-y-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Launch Options</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Edit per-game or batch Steam launch options. Steam must be closed to write.
            </p>
          </div>
          <SteamStatusPill onStatusChange={setSteamRunning} />
        </div>

        {steamRunning && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Steam is running — writes are blocked. Close Steam above to enable saving.
          </div>
        )}

        {/* Batch operations */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Layers className="h-4 w-4" />
              Batch apply to all games
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 items-center flex-wrap">
              <Select
                value={batchSnippet}
                onChange={(e) => setBatchSnippet(e.target.value)}
                className="w-64"
              >
                {BATCH_SNIPPETS.map((s) => (
                  <option key={s.id} value={s.snippet}>
                    {s.label}
                  </option>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchApply}
                disabled={batchRunning || steamRunning}
              >
                <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                {batchRunning ? 'Applying…' : `Apply to all ${games.length} games`}
              </Button>
              <Button variant="ghost" size="sm" onClick={loadGames}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Reload
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: game table */}
        <div className="w-1/2 border-r border-border p-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground animate-pulse">
              Loading games…
            </div>
          ) : (
            <GameTable
              games={games}
              onSelectGame={handleSelectGame}
              selectedAppId={selected?.appId}
            />
          )}
        </div>

        {/* Right: editor */}
        <div className="w-1/2 p-4 space-y-4 overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select a game to edit its launch options
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold truncate">{selected.name}</h2>
                  <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                    #{selected.appId}
                  </Badge>
                </div>
                {compatInfo && (
                  <p className="text-xs text-muted-foreground">
                    Compat: {compatInfo.toolDescription ?? 'default'} ({compatInfo.sourceLabel})
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Launch options
                </label>
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="e.g. mangohud gamemode %command%"
                  className="font-mono text-sm h-24 resize-none"
                  disabled={steamRunning}
                  data-selectable
                />
              </div>

              <StructuredPanel value={editValue} onChange={setEditValue} gpuInfo={gpuInfo} />

              <Button
                onClick={handleSave}
                disabled={saving || steamRunning || editValue === selected.launchOptions}
                className="gap-2 w-full"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save launch options'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
