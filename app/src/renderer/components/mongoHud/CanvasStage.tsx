import React from 'react'
import type { HudWidget } from '../../../shared/types'

interface Props {
  widgets: HudWidget[]
  selectedIds: string[]
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
}

export function CanvasStage({ widgets, selectedIds, onSelect, onMove }: Props) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 h-full overflow-auto">
      <div className="relative w-[960px] h-[540px] rounded-md border border-dashed border-border bg-card/70">
        {widgets.map((w) => {
          const selected = selectedIds.includes(w.id)
          return (
            <button
              key={w.id}
              type="button"
              className="absolute text-left overflow-hidden"
              style={{
                left: w.x,
                top: w.y,
                width: w.w,
                height: w.h,
                background: w.style.backgroundColor,
                color: w.style.color,
                borderRadius: w.style.borderRadius,
                border: `${w.style.borderWidth ?? 0}px solid ${w.style.borderColor ?? 'transparent'}`,
                opacity: w.style.opacity,
                padding: w.style.padding,
                boxShadow: w.style.shadow,
                outline: selected ? '2px solid #22d3ee' : 'none',
              }}
              onClick={() => onSelect(w.id)}
              onDoubleClick={() => onMove(w.id, w.x + 8, w.y + 8)}
            >
              <div className="text-xs uppercase tracking-wide opacity-70">{w.kind}</div>
              <div className="font-semibold">{w.title}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
