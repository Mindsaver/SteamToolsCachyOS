import React from 'react'
import type { HudWidget } from '../../../shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Select } from '../ui/select'

interface Props {
  widget: HudWidget | null
  onTitleChange: (value: string) => void
  onStyleNumber: (key: 'fontSize' | 'fontWeight' | 'opacity' | 'borderRadius' | 'borderWidth' | 'padding', value: number) => void
  onStyleText: (key: 'color' | 'backgroundColor' | 'borderColor' | 'shadow', value: string) => void
  onBindingMode: (mode: 'static' | 'field') => void
  onBindingValue: (value: string) => void
}

export function InspectorPanel(props: Props) {
  const widget = props.widget
  if (!widget) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-sm">Inspector</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Select a widget to edit styles and bindings.</CardContent>
      </Card>
    )
  }

  const valueBinding = widget.bindings.value ?? { mode: 'static' as const, staticValue: '' }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Inspector</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input value={widget.title} onChange={(e) => props.onTitleChange(e.target.value)} placeholder="Widget title" />
        <div className="grid grid-cols-2 gap-2">
          <Input value={widget.style.color ?? ''} onChange={(e) => props.onStyleText('color', e.target.value)} placeholder="Text color" />
          <Input value={widget.style.backgroundColor ?? ''} onChange={(e) => props.onStyleText('backgroundColor', e.target.value)} placeholder="Bg color" />
          <Input value={String(widget.style.fontSize ?? 14)} onChange={(e) => props.onStyleNumber('fontSize', Number(e.target.value) || 14)} placeholder="Font size" />
          <Input value={String(widget.style.padding ?? 12)} onChange={(e) => props.onStyleNumber('padding', Number(e.target.value) || 0)} placeholder="Padding" />
        </div>
        <Select value={valueBinding.mode} onChange={(e) => props.onBindingMode(e.target.value as 'static' | 'field')}>
          <option value="static">Static value</option>
          <option value="field">Mongo field path</option>
        </Select>
        <Input
          value={valueBinding.mode === 'field' ? valueBinding.fieldPath ?? '' : String(valueBinding.staticValue ?? '')}
          onChange={(e) => props.onBindingValue(e.target.value)}
          placeholder={valueBinding.mode === 'field' ? 'stats.fps' : 'Value'}
        />
      </CardContent>
    </Card>
  )
}
