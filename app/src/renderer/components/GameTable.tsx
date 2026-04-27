import React, { useState, useMemo, useRef, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, FolderOpen, ExternalLink } from 'lucide-react'
import type { InstalledGame } from '../../shared/types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'
import { api } from '../lib/ipc'

const col = createColumnHelper<InstalledGame>()

interface GameTableProps {
  games: InstalledGame[]
  /** Single-select: highlights a row and fires onSelectGame on body click */
  onSelectGame?: (game: InstalledGame) => void
  selectedAppId?: number
  /** Multi-select: set of checked app IDs */
  selectedAppIds?: Set<number>
  onSelectionChange?: (ids: Set<number>) => void
  /** Extra right-side column label for compat info */
  compatMap?: Map<number, string>
  searchValue?: string
  onSearchChange?: (v: string) => void
}

export function GameTable({
  games,
  onSelectGame,
  selectedAppId,
  selectedAppIds,
  onSelectionChange,
  compatMap,
  searchValue,
  onSearchChange,
}: GameTableProps) {
  const [internalFilter, setInternalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const anchorRef = useRef<number | null>(null)

  const globalFilter = searchValue ?? internalFilter
  const setGlobalFilter = onSearchChange ?? setInternalFilter

  const multiMode = selectedAppIds !== undefined && onSelectionChange !== undefined

  const toggleOne = useCallback((appId: number, e: React.MouseEvent) => {
    if (!multiMode || !onSelectionChange || !selectedAppIds) return
    const next = new Set(selectedAppIds)
    if (e.shiftKey && anchorRef.current !== null) {
      // Range select from anchor to current
      const visibleIds = rows.map((r) => r.original.appId)
      const a = visibleIds.indexOf(anchorRef.current)
      const b = visibleIds.indexOf(appId)
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        for (let i = lo; i <= hi; i++) next.add(visibleIds[i])
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (next.has(appId)) next.delete(appId)
      else next.add(appId)
      anchorRef.current = appId
    } else {
      // Plain checkbox click = toggle
      if (next.has(appId)) next.delete(appId)
      else { next.add(appId); anchorRef.current = appId }
    }
    onSelectionChange(next)
  }, [multiMode, selectedAppIds, onSelectionChange])

  const columns = useMemo(() => {
    const cols = []

    if (multiMode) {
      cols.push(
        col.display({
          id: 'check',
          size: 36,
          header: ({ table: t }) => {
            const visibleIds = t.getRowModel().rows.map((r) => r.original.appId)
            const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedAppIds?.has(id))
            const someChecked = !allChecked && visibleIds.some((id) => selectedAppIds?.has(id))
            return (
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = someChecked }}
                onChange={() => {
                  if (!onSelectionChange) return
                  if (allChecked) onSelectionChange(new Set())
                  else onSelectionChange(new Set(visibleIds))
                }}
              />
            )
          },
              cell: ({ row }) => (
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary"
              checked={selectedAppIds?.has(row.original.appId) ?? false}
              onChange={() => {/* handled by onClick */}}
              onClick={(e) => {
                e.stopPropagation()
                // Checkbox always toggles the one game; shift extends range
                toggleOne(row.original.appId, e)
              }}
            />
          ),
        })
      )
    }

    cols.push(
      col.accessor('appId', {
        header: '#',
        size: 72,
        cell: (info) => (
          <span className="text-muted-foreground font-mono text-xs">{info.getValue()}</span>
        ),
      }),
      col.accessor('name', {
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 text-left hover:text-foreground"
            onClick={() => column.toggleSorting()}
          >
            Name
            <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: (info) => <span className="font-medium truncate">{info.getValue()}</span>,
      }),
      col.accessor('launchOptions', {
        header: 'Launch options',
        cell: (info) => {
          const v = info.getValue()
          return v ? (
            <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px] block">{v}</span>
          ) : (
            <span className="text-muted-foreground/40 text-xs italic">none</span>
          )
        },
      })
    )

    if (compatMap) {
      cols.push(
        col.display({
          id: 'compat',
          header: 'Compat',
          size: 90,
          cell: ({ row }) => {
            const c = compatMap.get(row.original.appId)
            return c ? (
              <Badge variant="secondary" className="text-xs py-0 max-w-[80px] truncate block">{c}</Badge>
            ) : (
              <Badge variant="outline" className="text-xs py-0">Native</Badge>
            )
          },
        })
      )
    } else {
      cols.push(
        col.accessor('compatDataPath', {
          header: 'Prefix',
          size: 70,
          cell: (info) =>
            info.getValue() ? (
              <Badge variant="secondary" className="text-xs py-0">Proton</Badge>
            ) : (
              <Badge variant="outline" className="text-xs py-0">Native</Badge>
            ),
        })
      )
    }

    cols.push(
      col.display({
        id: 'actions',
        header: '',
        size: 72,
        cell: ({ row }) => (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Open install dir"
              onClick={(e) => { e.stopPropagation(); api.openPath(row.original.installPath) }}
            >
              <FolderOpen className="h-3 w-3" />
            </Button>
            {row.original.compatDataPath && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Open prefix"
                onClick={(e) => { e.stopPropagation(); api.openPath(row.original.compatDataPath!) }}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>
        ),
      })
    )

    return cols
  }, [multiMode, selectedAppIds, onSelectionChange, compatMap, toggleOne])

  const table = useReactTable({
    data: games,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const { rows } = table.getRowModel()
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 10,
  })

  const handleRowClick = (game: InstalledGame, e: React.MouseEvent) => {
    if (multiMode) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // Modifier key = add to / range-select in multi set
        toggleOne(game.appId, e)
      } else {
        // Plain click = single-select (replace selection with just this game)
        anchorRef.current = game.appId
        onSelectionChange?.(new Set([game.appId]))
      }
    } else {
      anchorRef.current = game.appId
      onSelectGame?.(game)
    }
  }

  const selectedCount = selectedAppIds?.size ?? 0

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search games…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="flex-1"
        />
        {multiMode && selectedCount > 0 && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
            onClick={() => onSelectionChange?.(new Set())}
          >
            Clear ({selectedCount})
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-border min-h-0">
        {/* Header */}
        <div className="flex bg-muted/50 border-b border-border">
          {table.getFlatHeaders().map((header) => {
            const isStretch = header.column.id === 'name' || header.column.id === 'launchOptions'
            return (
              <div
                key={header.id}
                className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0"
                style={{ width: isStretch ? undefined : header.column.getSize(), flex: isStretch ? '1' : undefined }}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            )
          })}
        </div>

        {/* Virtualized rows */}
        <div ref={parentRef} className="overflow-y-auto" style={{ height: 'calc(100% - 33px)' }}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const row = rows[vRow.index]
              const singleSelected = !multiMode && row.original.appId === selectedAppId
              const multiSelected = multiMode && (selectedAppIds?.has(row.original.appId) ?? false)
              const isSelected = singleSelected || multiSelected
              return (
                <div
                  key={row.id}
                  data-index={vRow.index}
                  ref={virtualizer.measureElement}
                  className={cn(
                    'group flex items-center border-b border-border/40 cursor-pointer hover:bg-muted/30 transition-colors',
                    isSelected && 'bg-primary/10 border-primary/20 hover:bg-primary/15'
                  )}
                  style={{ position: 'absolute', top: vRow.start, left: 0, right: 0, height: `${vRow.size}px` }}
                  onClick={(e) => handleRowClick(row.original, e)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isStretch = cell.column.id === 'name' || cell.column.id === 'launchOptions'
                    return (
                      <div
                        key={cell.id}
                        className="px-2 py-1.5 text-sm overflow-hidden shrink-0"
                        style={{ width: isStretch ? undefined : cell.column.getSize(), flex: isStretch ? '1' : undefined }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {rows.length} of {games.length} games
        {multiMode && selectedCount > 0 && ` · ${selectedCount} selected`}
      </p>
    </div>
  )
}
