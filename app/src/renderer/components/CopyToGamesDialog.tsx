import React, { useState, useMemo } from 'react'
import { Copy, Search } from 'lucide-react'
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
import { Select } from './ui/select'
import { Badge } from './ui/badge'
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

const OP_LABELS: Record<CopyOp, string> = {
  set: 'Replace',
  prefix: 'Prefix (prepend)',
  replace: 'Find → Replace',
}

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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<BatchTransformPreviewRow[]>([])
  const [previewed, setPreviewed] = useState(false)
  const [applying, setApplying] = useState(false)

  const candidates = useMemo(
    () => allGames.filter((g) => g.appId !== sourceGame.appId),
    [allGames, sourceGame.appId]
  )

  const filtered = useMemo(() => {
    if (!search) return candidates
    const q = search.toLowerCase()
    return candidates.filter((g) => g.name.toLowerCase().includes(q) || String(g.appId).includes(q))
  }, [candidates, search])

  const toggleOne = (appId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(appId)) next.delete(appId)
      else next.add(appId)
      return next
    })
    setPreviewed(false)
    setPreview([])
  }

  const toggleAll = () => {
    const allVisible = filtered.map((g) => g.appId)
    const allSelected = allVisible.every((id) => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(allVisible))
    setPreviewed(false)
    setPreview([])
  }

  const buildParams = () => ({
    op: op as BatchOp,
    setValue: op === 'set' ? sourceValue : undefined,
    prefix: op === 'prefix' ? sourceValue : undefined,
    find: op === 'replace' ? findText : undefined,
    replaceWith: op === 'replace' ? replaceText : undefined,
  })

  const handlePreview = async () => {
    if (!selectedIds.size) return
    const rows = Array.from(selectedIds).map((appId) => {
      const game = allGames.find((g) => g.appId === appId)!
      const before = game.launchOptions ?? ''
      const after = transformLaunchOptions(before, buildParams())
      return { appId, name: game.name, before, after }
    })
    setPreview(rows)
    setPreviewed(true)
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
  const someSelected = !allVisibleSelected && filtered.some((g) => selectedIds.has(g.appId))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            Copy launch options to other games
          </DialogTitle>
          <div className="mt-2 space-y-1">
            <p className="text-xs text-muted-foreground">Source: <span className="font-medium text-foreground">{sourceGame.name}</span></p>
            {sourceValue && (
              <code className="block text-xs font-mono bg-muted/40 rounded px-2 py-1 text-muted-foreground truncate">{sourceValue}</code>
            )}
          </div>
        </DialogHeader>

        <div className="px-6 py-4 space-y-3 border-b border-border">
          <div className="flex gap-3 items-center">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Operation</label>
              <Select value={op} onChange={(e) => { setOp(e.target.value as CopyOp); setPreviewed(false); setPreview([]) }} className="w-full">
                {(Object.entries(OP_LABELS) as [CopyOp, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </div>
          </div>
          {op === 'replace' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Find</label>
                <Input value={findText} onChange={(e) => { setFindText(e.target.value); setPreviewed(false) }} placeholder="Text to find" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Replace with</label>
                <Input value={replaceText} onChange={(e) => { setReplaceText(e.target.value); setPreviewed(false) }} placeholder="Replacement" className="h-8 text-xs" />
              </div>
            </div>
          )}
        </div>

        {/* Game picker */}
        <div className="flex flex-col min-h-0 flex-1 px-6 py-3 gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter games…" className="pl-7 h-8 text-xs" />
            </div>
            <button
              className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
              onClick={toggleAll}
            >
              {allVisibleSelected ? 'Deselect all' : 'Select all'}
            </button>
            <Badge variant="secondary" className="text-xs">{selectedIds.size} selected</Badge>
          </div>

          <div className="overflow-y-auto flex-1 rounded-md border border-border min-h-0 max-h-52">
            {filtered.map((game) => {
              const checked = selectedIds.has(game.appId)
              return (
                <label
                  key={game.appId}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-border/40 hover:bg-muted/30 transition-colors',
                    checked && 'bg-primary/8'
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary shrink-0"
                    checked={checked}
                    onChange={() => toggleOne(game.appId)}
                  />
                  <span className="text-sm flex-1 truncate">{game.name}</span>
                  <span className="text-xs text-muted-foreground font-mono shrink-0">#{game.appId}</span>
                  {game.launchOptions && (
                    <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">{game.launchOptions}</span>
                  )}
                </label>
              )
            })}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-6">No games found</p>
            )}
          </div>
        </div>

        {/* Preview table */}
        {previewed && preview.length > 0 && (
          <div className="px-6 pb-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</p>
            <div className="overflow-y-auto max-h-36 rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-muted-foreground w-1/3">Game</th>
                    <th className="px-2 py-1 text-left font-medium text-muted-foreground w-1/3">Before</th>
                    <th className="px-2 py-1 text-left font-medium text-muted-foreground w-1/3">After</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.appId} className="border-t border-border/40">
                      <td className="px-2 py-1 font-medium truncate max-w-[150px]" title={row.name}>{row.name}</td>
                      <td className="px-2 py-1 font-mono text-muted-foreground truncate max-w-[150px]" title={row.before}>{row.before || '(empty)'}</td>
                      <td className="px-2 py-1 font-mono truncate max-w-[150px]" title={row.after}>{row.after || '(empty)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="px-6 py-4 border-t border-border gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={handlePreview} disabled={!selectedIds.size}>
            Preview changes
          </Button>
          <Button onClick={handleApply} disabled={!previewed || !preview.length || applying}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {applying ? 'Applying…' : `Apply to ${preview.length} games`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
