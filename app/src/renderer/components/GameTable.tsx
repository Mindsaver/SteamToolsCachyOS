import React, { useState, useMemo } from 'react'
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
  onSelectGame?: (game: InstalledGame) => void
  selectedAppId?: number
}

export function GameTable({ games, onSelectGame, selectedAppId }: GameTableProps) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])

  const columns = useMemo(
    () => [
      col.accessor('appId', {
        header: 'AppID',
        size: 80,
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
        header: 'Launch Options',
        cell: (info) => {
          const v = info.getValue()
          return v ? (
            <span className="font-mono text-xs text-muted-foreground truncate max-w-[220px] block">{v}</span>
          ) : (
            <span className="text-muted-foreground/40 text-xs italic">none</span>
          )
        },
      }),
      col.accessor('compatDataPath', {
        header: 'Prefix',
        size: 64,
        cell: (info) =>
          info.getValue() ? (
            <Badge variant="secondary" className="text-xs py-0">Proton</Badge>
          ) : (
            <Badge variant="outline" className="text-xs py-0">Native</Badge>
          ),
      }),
      col.display({
        id: 'actions',
        header: '',
        size: 80,
        cell: ({ row }) => (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Open install dir"
              onClick={(e) => {
                e.stopPropagation()
                api.openPath(row.original.installPath)
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
            {row.original.compatDataPath && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Open prefix"
                onClick={(e) => {
                  e.stopPropagation()
                  api.openPath(row.original.compatDataPath!)
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ),
      }),
    ],
    []
  )

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
  const parentRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  })

  return (
    <div className="flex flex-col gap-2 h-full">
      <Input
        placeholder="Search games…"
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="max-w-xs"
      />
      <div className="flex-1 overflow-hidden rounded-lg border border-border">
        {/* Header */}
        <div className="flex bg-muted/50 border-b border-border">
          {table.getFlatHeaders().map((header) => (
            <div
              key={header.id}
              className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0"
              style={{ width: header.column.getSize(), flex: header.column.getSize() === 150 ? '1' : undefined }}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
            </div>
          ))}
        </div>
        {/* Virtualized rows */}
        <div ref={parentRef} className="overflow-y-auto" style={{ height: 'calc(100% - 36px)' }}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const row = rows[vRow.index]
              const selected = row.original.appId === selectedAppId
              return (
                <div
                  key={row.id}
                  data-index={vRow.index}
                  ref={virtualizer.measureElement}
                  className={cn(
                    'group flex items-center border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors',
                    selected && 'bg-primary/10 border-primary/20'
                  )}
                  style={{
                    position: 'absolute',
                    top: vRow.start,
                    left: 0,
                    right: 0,
                    height: `${vRow.size}px`,
                  }}
                  onClick={() => onSelectGame?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div
                      key={cell.id}
                      className="px-3 py-2 text-sm overflow-hidden shrink-0"
                      style={{
                        width: cell.column.getSize(),
                        flex: cell.column.getSize() === 150 ? '1' : undefined,
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {rows.length} of {games.length} games
      </p>
    </div>
  )
}
