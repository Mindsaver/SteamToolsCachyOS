import React from 'react'
import type { HudWidgetKind } from '../../../shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'

const WIDGETS: Array<{ kind: HudWidgetKind; label: string }> = [
  { kind: 'text', label: 'Text' },
  { kind: 'icon', label: 'Icon' },
  { kind: 'bar', label: 'Bar' },
  { kind: 'stat_card', label: 'Stat card' },
  { kind: 'panel', label: 'Panel' },
]

export function WidgetPalette({ onAdd }: { onAdd: (kind: HudWidgetKind) => void }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Widget library</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {WIDGETS.map((w) => (
          <Button key={w.kind} variant="outline" className="w-full justify-start" onClick={() => onAdd(w.kind)}>
            {w.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
