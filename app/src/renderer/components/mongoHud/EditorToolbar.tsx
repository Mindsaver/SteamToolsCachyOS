import React from 'react'
import { Plus, Save, Download, Upload, Trash2, Database, WandSparkles } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface Props {
  name: string
  onNameChange: (name: string) => void
  onAddWidget: () => void
  onDeleteSelected: () => void
  onSave: () => void
  onExport: () => void
  onImport: () => void
  onCreateVersion: () => void
  onTestConnection: () => void
  saving: boolean
}

export function EditorToolbar(props: Props) {
  return (
    <div className="border-b border-border px-4 py-3 flex flex-wrap gap-2 items-center">
      <div className="flex items-center gap-2 min-w-[260px] flex-1">
        <Database className="h-4 w-4 text-primary" />
        <Input
          value={props.name}
          onChange={(e) => props.onNameChange(e.target.value)}
          className="max-w-md"
          placeholder="HUD name"
        />
      </div>
      <Button size="sm" variant="secondary" onClick={props.onAddWidget}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add widget
      </Button>
      <Button size="sm" variant="outline" onClick={props.onDeleteSelected}>
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Delete
      </Button>
      <Button size="sm" variant="outline" onClick={props.onCreateVersion}>
        <WandSparkles className="h-3.5 w-3.5 mr-1" />
        Snapshot
      </Button>
      <Button size="sm" variant="outline" onClick={props.onExport}>
        <Download className="h-3.5 w-3.5 mr-1" />
        Export
      </Button>
      <Button size="sm" variant="outline" onClick={props.onImport}>
        <Upload className="h-3.5 w-3.5 mr-1" />
        Import
      </Button>
      <Button size="sm" variant="outline" onClick={props.onTestConnection}>
        Test Mongo
      </Button>
      <Button size="sm" onClick={props.onSave} disabled={props.saving}>
        <Save className="h-3.5 w-3.5 mr-1" />
        Save
      </Button>
    </div>
  )
}
