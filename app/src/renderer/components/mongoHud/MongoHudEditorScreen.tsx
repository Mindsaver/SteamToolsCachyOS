import React, { useEffect, useMemo, useReducer, useState } from 'react'
import { toast } from 'sonner'
import type { HudDocument, HudWidgetKind, MongoConnectionProfile, MongoHudPreviewResult } from '../../../shared/types'
import { api } from '../../lib/ipc'
import { Input } from '../ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { EditorToolbar } from './EditorToolbar'
import { WidgetPalette } from './WidgetPalette'
import { CanvasStage } from './CanvasStage'
import { InspectorPanel } from './InspectorPanel'
import { ThemePanel } from './ThemePanel'
import { VersionPanel } from './VersionPanel'
import { DataPreviewPanel } from './DataPreviewPanel'
import { createEmptyDocument, editorReducer } from './editorState'

export function MongoHudEditorScreen() {
  const [state, dispatch] = useReducer(editorReducer, { doc: createEmptyDocument(), selectedIds: [] })
  const [documents, setDocuments] = useState<HudDocument[]>([])
  const [connections, setConnections] = useState<MongoConnectionProfile[]>([])
  const [versions, setVersions] = useState<Array<{ id: string; documentId: string; label: string; createdAt: number }>>([])
  const [preview, setPreview] = useState<MongoHudPreviewResult>({ ok: true, rows: [] })
  const [saving, setSaving] = useState(false)
  const [newConnection, setNewConnection] = useState({ id: '', name: '', connectionString: '', database: '' })

  const selectedWidget = useMemo(
    () => state.doc.widgets.find((w) => w.id === state.selectedIds[0]) ?? null,
    [state.doc.widgets, state.selectedIds]
  )

  const loadAll = async () => {
    const [docs, conns] = await Promise.all([api.listMongoHudDocuments(), api.listMongoHudConnections()])
    setDocuments(docs)
    setConnections(conns)
    if (!state.doc.id && docs.length > 0) dispatch({ type: 'set_doc', doc: docs[0] })
  }

  useEffect(() => {
    void loadAll()
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        void handleSave()
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        dispatch({ type: 'remove_selected' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await api.saveMongoHudDocument(state.doc)
      dispatch({ type: 'set_doc', doc: saved })
      await loadAll()
      toast.success('Mongo HUD saved')
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    const target = newConnection.connectionString || connections.find((c) => c.id === state.doc.connectionId)?.connectionString
    if (!target) {
      toast.error('Provide a connection string first')
      return
    }
    const result = await api.testMongoHudConnection(target)
    if (result.ok) toast.success('Mongo connection successful')
    else toast.error(result.error)
  }

  const handleSaveConnection = async () => {
    if (!newConnection.name || !newConnection.connectionString || !newConnection.database) {
      toast.error('Name, connection string and database are required')
      return
    }
    const saved = await api.saveMongoHudConnection(newConnection)
    setConnections(await api.listMongoHudConnections())
    dispatch({ type: 'set_doc', doc: { ...state.doc, connectionId: saved.id } })
    setNewConnection({ id: '', name: '', connectionString: '', database: '' })
    toast.success('Connection profile saved')
  }

  const handleRunPreview = async () => {
    if (!state.doc.connectionId || !state.doc.collection) {
      toast.error('Pick connection and collection first')
      return
    }
    const rows = await api.previewMongoHudData({
      connectionId: state.doc.connectionId,
      collection: state.doc.collection,
      query: state.doc.query,
      projection: state.doc.projection,
      limit: state.doc.limit,
    })
    setPreview(rows)
    if (!rows.ok) toast.error(rows.error)
  }

  const handleSnapshot = async () => {
    if (!state.doc.id) {
      toast.error('Save document first')
      return
    }
    const label = `Snapshot ${new Date().toLocaleString()}`
    const result = await api.createMongoHudVersion({ documentId: state.doc.id, label })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setVersions(await api.listMongoHudVersions(state.doc.id))
    toast.success('Snapshot created')
  }

  useEffect(() => {
    if (!state.doc.id) return
    void api.listMongoHudVersions(state.doc.id).then(setVersions)
  }, [state.doc.id])

  const handleImport = async () => {
    const src = window.prompt('Paste HUD JSON')
    if (!src) return
    const result = await api.importMongoHudDocument(src)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    dispatch({ type: 'set_doc', doc: result.doc })
    await loadAll()
    toast.success('Imported HUD document')
  }

  const handleExport = async () => {
    if (!state.doc.id) return
    const result = await api.exportMongoHudDocument(state.doc.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    await navigator.clipboard.writeText(result.json)
    toast.success('Export JSON copied to clipboard')
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <EditorToolbar
        name={state.doc.name}
        onNameChange={(name) => dispatch({ type: 'set_doc', doc: { ...state.doc, name } })}
        onAddWidget={() => dispatch({ type: 'add_widget', kind: 'text' })}
        onDeleteSelected={() => dispatch({ type: 'remove_selected' })}
        onSave={() => void handleSave()}
        onExport={() => void handleExport()}
        onImport={() => void handleImport()}
        onCreateVersion={() => void handleSnapshot()}
        onTestConnection={() => void handleTestConnection()}
        saving={saving}
      />

      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <Select
          value={state.doc.id}
          onChange={(e) => {
            const doc = documents.find((d) => d.id === e.target.value)
            if (doc) dispatch({ type: 'set_doc', doc })
          }}
          className="max-w-sm"
        >
          <option value="">Current document</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'set_doc', doc: createEmptyDocument() })}>
          New HUD
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-3 p-3 flex-1 min-h-0">
        <div className="col-span-2 min-h-0 space-y-3">
          <WidgetPalette onAdd={(kind: HudWidgetKind) => dispatch({ type: 'add_widget', kind })} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Connection profiles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select
                value={state.doc.connectionId ?? ''}
                onChange={(e) => dispatch({ type: 'set_doc', doc: { ...state.doc, connectionId: e.target.value || null } })}
              >
                <option value="">No connection</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Input value={newConnection.name} onChange={(e) => setNewConnection((v) => ({ ...v, name: e.target.value }))} placeholder="Name" />
              <Input value={newConnection.database} onChange={(e) => setNewConnection((v) => ({ ...v, database: e.target.value }))} placeholder="Database" />
              <Input value={newConnection.connectionString} onChange={(e) => setNewConnection((v) => ({ ...v, connectionString: e.target.value }))} placeholder="mongodb://..." />
              <Button size="sm" className="w-full" onClick={() => void handleSaveConnection()}>
                Save profile
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-7 min-h-0">
          <CanvasStage
            widgets={state.doc.widgets}
            selectedIds={state.selectedIds}
            onSelect={(id) => dispatch({ type: 'select_widget', widgetId: id })}
            onMove={(id, x, y) => dispatch({ type: 'update_widget_position', widgetId: id, x, y })}
          />
        </div>

        <div className="col-span-3 min-h-0 space-y-3 overflow-y-auto">
          <InspectorPanel
            widget={selectedWidget}
            onTitleChange={(value) =>
              selectedWidget && dispatch({ type: 'update_widget_title', widgetId: selectedWidget.id, title: value })
            }
            onStyleNumber={(key, value) =>
              selectedWidget && dispatch({ type: 'update_widget_style', widgetId: selectedWidget.id, patch: { [key]: value } })
            }
            onStyleText={(key, value) =>
              selectedWidget && dispatch({ type: 'update_widget_style', widgetId: selectedWidget.id, patch: { [key]: value } })
            }
            onBindingMode={(mode) => selectedWidget && dispatch({ type: 'set_binding', widgetId: selectedWidget.id, key: 'value', mode, value: '' })}
            onBindingValue={(value) => {
              if (!selectedWidget) return
              const current = selectedWidget.bindings.value?.mode ?? 'static'
              dispatch({ type: 'set_binding', widgetId: selectedWidget.id, key: 'value', mode: current, value })
            }}
          />
          <ThemePanel theme={state.doc.theme} onThemeChange={(theme) => dispatch({ type: 'set_theme', theme })} />
          <VersionPanel
            versions={versions}
            onRestore={(versionId) =>
              void api.restoreMongoHudVersion(versionId).then((res) => {
                if (!res.ok) return toast.error(res.error)
                dispatch({ type: 'set_doc', doc: res.doc })
                toast.success('Version restored')
              })
            }
          />
          <DataPreviewPanel
            connections={connections}
            connectionId={state.doc.connectionId ?? ''}
            collection={state.doc.collection ?? ''}
            query={state.doc.query}
            projection={state.doc.projection}
            limit={state.doc.limit}
            onChangeConnection={(id) => dispatch({ type: 'set_doc', doc: { ...state.doc, connectionId: id || null } })}
            onChangeQuery={(next) =>
              dispatch({
                type: 'set_query',
                collection: next.collection,
                query: next.query,
                projection: next.projection,
                limit: next.limit,
              })
            }
            onRun={() => void handleRunPreview()}
            rows={preview.ok ? preview.rows : []}
          />
        </div>
      </div>
    </div>
  )
}
