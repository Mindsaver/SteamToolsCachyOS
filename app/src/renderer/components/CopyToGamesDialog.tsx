import React, { useState, useMemo } from 'react'
import { Copy, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Switch } from './ui/switch'
import { cn } from '../lib/utils'
import { api } from '../lib/ipc'
import { transformLaunchOptions } from '../../shared/launchOptions/compose'
import type { InstalledGame, BatchOp, BatchTransformPreviewRow } from '../../shared/types'

interface CopyToGamesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceGame: InstalledGame
  sourceValue: string
  allGames: InstalledGame[]
  accountId: string
  onDone?: () => void
}

type CopyOp = 'set' | 'prefix' | 'replace'

const OPS: { value: CopyOp; label: string }[] = [
  { value: 'set', label: 'Replace' },
  { value: 'prefix', label: 'Prefix' },
  { value: 'replace', label: 'Find → Replace' },
]

export function CopyToGamesDialog({
  open,
  onOpenChange,
  sourceGame,
  sourceValue,
  allGames,
  accountId,
  onDone,
}: CopyToGamesDialogProps) {
  const [op, setOp] = useState<CopyOp>('set')
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [search, setSearch] = useState('')
  const [onlyWithOptions, setOnlyWithOptions] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<BatchTransformPreviewRow[]>([])
  const [previewed, setPreviewed] = useState(false)
  const [applying, setApplying] = useState(false)
  const [pickerCollapsed, setPickerCollapsed] = useState(false)

  const candidates = useMemo(
    () => allGames.filter((g) => g.appId !== sourceGame.appId),
    [allGames, sourceGame.appId]
  )

  const filtered = useMemo(() => {
    let base = candidates
    if (onlyWithOptions) base = base.filter((g) => !!g.launchOptions)
    if (!search) return base
    const q = search.toLowerCase()
    return base.filter((g) => g.name.toLowerCase().includes(q) || String(g.appId).includes(q))
  }, [candidates, search, onlyWithOptions])

  const resetPreview = () => { setPreviewed(false); setPreview([]) }

  const toggleOne = (appId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(appId)) next.delete(appId)
      else next.add(appId)
      return next
    })
    resetPreview()
  }

  const toggleAll = () => {
    const allVisible = filtered.map((g) => g.appId)
    const allSelected = allVisible.every((id) => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(allVisible))
    resetPreview()
  }

  const buildParams = () => ({
    op: op as BatchOp,
    setValue: op === 'set' ? sourceValue : undefined,
    prefix: op === 'prefix' ? sourceValue : undefined,
    find: op === 'replace' ? findText : undefined,
    replaceWith: op === 'replace' ? replaceText : undefined,
  })

  const handlePreview = () => {
    if (!selectedIds.size) return
    const rows = Array.from(selectedIds).map((appId) => {
      const game = allGames.find((g) => g.appId === appId)!
      const before = game.launchOptions ?? ''
      const after = transformLaunchOptions(before, buildParams())
      return { appId, name: game.name, before, after }
    })
    setPreview(rows)
    setPreviewed(true)
    setPickerCollapsed(true)
  }

  const handleApply = async () => {
    if (!previewed || !preview.length) return
    setApplying(true)
    try {
      const result = await api.applyBatchTransform({
        rows: preview.map(({ appId, after }) => ({ appId, after })),
        accountId,
      })
      if (result?.ok) {
        toast.success(`Copied to ${result.written} games`)
        onDone?.()
        onOpenChange(false)
      } else {
        toast.error(result?.error ?? 'Apply failed')
      }
    } finally {
      setApplying(false)
    }
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((g) => selectedIds.has(g.appId))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(1100px,95vw)] max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Copy className="h-4 w-4" />
            Copy launch options to other games
          </DialogTitle>
          <div className="mt-2.5 space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Source: <span className="font-medium text-foreground">{sourceGame.name}</span>
              <span className="ml-2 text-muted-foreground/60">#{sourceGame.appId}</span>
            </p>
            {sourceValue ? (
              <code className="block text-xs font-mono bg-muted/40 rounded px-2.5 py-1.5 text-muted-foreground break-all">
                {sourceValue}
              </code>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">No launch options set</p>
            )}
          </div>
        </DialogHeader>

        {/* Operation section */}
        <div className="px-6 py-4 border-b border-border space-y-3">
          {/* Op chips */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Operation</label>
            <div className="flex gap-1.5">
              {OPS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { setOp(o.value); resetPreview() }}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
                    op === o.value
                      ? 'border-primary/50 bg-primary/15 text-primary'
                      : 'border-border bg-card/40 text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Find / Replace inputs */}
          {op === 'replace' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Find</label>
                <Input
                  value={findText}
                  onChange={(e) => { setFindText(e.target.value); resetPreview() }}
                  placeholder="Text to find"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Replace with</label>
                <Input
                  value={replaceText}
                  onChange={(e) => { setReplaceText(e.target.value); resetPreview() }}
                  placeholder="Replacement (empty = delete)"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {op === 'prefix' && (
            <p className="text-xs text-muted-foreground">
              The source launch options will be prepended to each target game's existing options.
            </p>
          )}
        </div>

        {/* Body — picker + preview in a two-pane layout */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Game picker pane */}
          <div className={cn(
            'flex flex-col border-r border-border transition-all duration-200',
            pickerCollapsed ? 'w-48 min-w-0' : 'w-96 min-w-0'
          )}>
            {/* Picker header */}
            <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-2">
              <button
                onClick={() => setPickerCollapsed((c) => !c)}
                className="text-muted-foreground hover:text-foreground"
                title={pickerCollapsed ? 'Expand picker' : 'Collapse picker'}
              >
                {pickerCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <span className="text-xs font-medium">Games</span>
              {selectedIds.size > 0 && (
                <Badge variant="secondary" className="text-xs ml-auto">{selectedIds.size}</Badge>
              )}
            </div>

            {!pickerCollapsed && (
              <>
                {/* Search + filters */}
                <div className="px-3 py-2 border-b border-border/60 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter games…"
                      className="pl-7 h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Switch checked={onlyWithOptions} onCheckedChange={setOnlyWithOptions} />
                      With options only
                    </label>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={toggleAll}
                    >
                      {allVisibleSelected ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                </div>

                {/* Game list */}
                <div className="overflow-y-auto flex-1 min-h-0">
                  {filtered.map((game) => {
                    const checked = selectedIds.has(game.appId)
                    return (
                      <label
                        key={game.appId}
                        className={cn(
                          'flex items-start gap-2.5 px-3 py-2 cursor-pointer border-b border-border/30 hover:bg-muted/30 transition-colors',
                          checked && 'bg-primary/8'
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-primary shrink-0 mt-0.5"
                          checked={checked}
                          onChange={() => toggleOne(game.appId)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{game.name}</p>
                          {game.launchOptions && (
                            <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                              {game.launchOptions}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">#{game.appId}</span>
                      </label>
                    )
                  })}
                  {filtered.length === 0 && (
                    <p className="text-center text-muted-foreground text-xs py-8">No games found</p>
                  )}
                </div>
              </>
            )}

            {pickerCollapsed && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground rotate-90 whitespace-nowrap">
                  {selectedIds.size} selected
                </p>
              </div>
            )}
          </div>

          {/* Preview pane */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {previewed && preview.length > 0 ? (
              <>
                <div className="px-4 py-2.5 border-b border-border/60">
                  <p className="text-xs font-medium">Preview — {preview.length} games</p>
                </div>
                <div className="overflow-y-auto flex-1 min-h-0">
                  <table className="w-full text-xs table-fixed">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground w-1/4">Game</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[37.5%]">Before</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[37.5%]">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row) => (
                        <tr key={row.appId} className="border-t border-border/40 align-top">
                          <td className="px-3 py-2 font-medium break-words">{row.name}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground whitespace-pre-wrap break-all">
                            {row.before || <span className="italic not-italic text-muted-foreground/50">(empty)</span>}
                          </td>
                          <td className="px-3 py-2 font-mono whitespace-pre-wrap break-all">
                            {row.after || <span className="italic not-italic text-muted-foreground/50">(empty)</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                {selectedIds.size > 0
                  ? <p className="text-xs">Select an operation and click <strong>Preview changes</strong></p>
                  : <p className="text-xs">Select games from the list to get started</p>}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={!selectedIds.size}
          >
            Preview changes
          </Button>
          <Button
            onClick={handleApply}
            disabled={!previewed || !preview.length || applying}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {applying ? 'Applying…' : `Apply to ${preview.length || selectedIds.size} games`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
