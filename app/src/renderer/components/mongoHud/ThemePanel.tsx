import React from 'react'
import type { HudTheme } from '../../../shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'

export function ThemePanel({
  theme,
  onThemeChange,
}: {
  theme: HudTheme
  onThemeChange: (patch: Partial<HudTheme>) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Theme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input value={theme.name} onChange={(e) => onThemeChange({ name: e.target.value })} placeholder="Theme name" />
        <div className="grid grid-cols-2 gap-2">
          <Input value={theme.foreground} onChange={(e) => onThemeChange({ foreground: e.target.value })} placeholder="Foreground" />
          <Input value={theme.background} onChange={(e) => onThemeChange({ background: e.target.value })} placeholder="Background" />
          <Input value={theme.accent} onChange={(e) => onThemeChange({ accent: e.target.value })} placeholder="Accent" />
          <Input value={theme.surface} onChange={(e) => onThemeChange({ surface: e.target.value })} placeholder="Surface" />
        </div>
      </CardContent>
    </Card>
  )
}
