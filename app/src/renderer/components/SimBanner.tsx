import React from 'react'
import { FlaskConical } from 'lucide-react'

export function SimBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 font-medium">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      Simulation mode — all data is fake. No Steam installation required.
    </div>
  )
}
