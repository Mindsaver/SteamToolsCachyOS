import React from 'react'
import type { HudVersionMeta } from '../../../shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'

export function VersionPanel({
  versions,
  onRestore,
}: {
  versions: HudVersionMeta[]
  onRestore: (versionId: string) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Versions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-56 overflow-y-auto">
        {versions.length === 0 && <p className="text-xs text-muted-foreground">No snapshots yet.</p>}
        {versions.map((v) => (
          <div key={v.id} className="border border-border rounded-md p-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{v.label}</p>
              <p className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onRestore(v.id)}>
              Restore
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
