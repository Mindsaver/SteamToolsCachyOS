import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileCog, FolderOpen, Save, Undo2, Plus, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { StructuredPanel } from '../components/StructuredPanel'
import { api } from '../lib/ipc'
import { modelFromUserSettingsEnv, userSettingsEnvFromModel } from '../../shared/launchOptions/compose'
import type { LaunchOptionsModel } from '../../shared/launchOptions/compose'
import type { InstalledCompatToolRow, ProtonUserSettingsBackupEntry } from '../../shared/types'
import {
  parseUserSettingsEnvFromText,
  replaceUserSettingsDictInSource,
  formatUserSettingsPyFile,
} from '../../shared/userSettingsPy'

const PARSE_DEBOUNCE_MS = 320

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Safe default backup file name: tool slug + local date-time */
function suggestedBackupFileName(internalName: string): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`
  const slug = internalName
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48)
  return `${slug || 'proton'}_${stamp}.py`
}

function formatBackupOptionLabel(e: ProtonUserSettingsBackupEntry): string {
  try {
    const d = new Date(e.mtimeMs)
    return `${e.fileName}  (${d.toLocaleString()})`
  } catch {
    return e.fileName
  }
}

export function ProtonUserSettings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const toolParam = searchParams.get('tool')?.trim() ?? ''

  const [rows, setRows] = useState<InstalledCompatToolRow[]>([])
  const [defaultTool, setDefaultTool] = useState<string | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [saving, setSaving] = useState(false)

  const [installPath, setInstallPath] = useState<string | null>(null)
  const [filePath, setFilePath] = useState<string>('')
  const [fileExists, setFileExists] = useState(false)
  const [fileText, setFileText] = useState('')
  const [baselineFileText, setBaselineFileText] = useState('')
  const [model, setModel] = useState<LaunchOptionsModel>(() =>
    modelFromUserSettingsEnv({})
  )
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [backupEntries, setBackupEntries] = useState<ProtonUserSettingsBackupEntry[]>([])
  const [backupLoadSelection, setBackupLoadSelection] = useState('')
  const [backupDialogOpen, setBackupDialogOpen] = useState(false)
  const [backupFileNameInput, setBackupFileNameInput] = useState('')
  const [savingBackup, setSavingBackup] = useState(false)

  const isDirty = fileText !== baselineFileText

  const refreshBackups = useCallback(async () => {
    if (!selected) {
      setBackupEntries([])
      return
    }
    const r = await api.listProtonUserSettingsBackups(selected)
    if (r.ok) setBackupEntries(r.entries)
    else setBackupEntries([])
  }, [selected])

  const loadList = useCallback(async () => {
    setLoadingList(true)
    try {
      const [list, snap] = await Promise.all([
        api.listCompatToolsInstalled(),
        api.getCompatSnapshot([]),
      ])
      setRows(list)
      setDefaultTool(snap.steamPlayDefault.toolName)
      let initial = ''
      if (toolParam && list.some((r) => r.internalName === toolParam)) {
        initial = toolParam
      } else if (snap.steamPlayDefault.toolName) {
        const match = list.find((r) => r.internalName === snap.steamPlayDefault.toolName)
        if (match) initial = match.internalName
      }
      if (!initial && list.length > 0) initial = list[0].internalName
      setSelected(initial)
      if (toolParam && !list.some((r) => r.internalName === toolParam) && initial) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.set('tool', initial)
          return next
        }, { replace: true })
      }
    } finally {
      setLoadingList(false)
    }
  }, [toolParam, setSearchParams])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    setBackupLoadSelection('')
    void refreshBackups()
  }, [selected, refreshBackups])

  const loadDoc = useCallback(async (internalName: string) => {
    if (!internalName) return
    setLoadingDoc(true)
    try {
      const r = await api.getProtonUserSettings(internalName)
      if (!r.ok) {
        toast.error(r.error)
        setFileText('')
        setBaselineFileText('')
        setFileExists(false)
        setFilePath('')
        setInstallPath(null)
        setModel(modelFromUserSettingsEnv({}))
        return
      }
      setInstallPath(r.installPath)
      setFilePath(r.filePath)
      setFileExists(r.fileExists)
      setFileText(r.fileText)
      setBaselineFileText(r.fileText)
      setModel(modelFromUserSettingsEnv(r.env))
    } finally {
      setLoadingDoc(false)
    }
  }, [])

  useEffect(() => {
    if (!selected) return
    void loadDoc(selected)
  }, [selected, loadDoc])

  useEffect(() => {
    if (loadingList || !toolParam || !rows.length) return
    if (rows.some((r) => r.internalName === toolParam) && selected !== toolParam) {
      setSelected(toolParam)
    }
  }, [loadingList, toolParam, rows, selected])

  const applyEnvToFileText = useCallback((prevText: string, env: Record<string, string>): string => {
    if (!prevText.trim()) return formatUserSettingsPyFile(env)
    return replaceUserSettingsDictInSource(prevText, env)
  }, [])

  const handleModelChange = useCallback(
    (next: LaunchOptionsModel) => {
      setModel(next)
      const env = userSettingsEnvFromModel(next)
      setFileText((t) => applyEnvToFileText(t, env))
    },
    [applyEnvToFileText]
  )

  const onFileTextChange = useCallback((raw: string) => {
    setFileText(raw)
    if (parseTimer.current) clearTimeout(parseTimer.current)
    parseTimer.current = setTimeout(() => {
      const env = parseUserSettingsEnvFromText(raw)
      setModel(modelFromUserSettingsEnv(env))
    }, PARSE_DEBOUNCE_MS)
  }, [])

  useEffect(
    () => () => {
      if (parseTimer.current) clearTimeout(parseTimer.current)
    },
    []
  )

  const handleSave = useCallback(async () => {
    if (!selected) return
    setSaving(true)
    try {
      const r = await api.saveProtonUserSettings({ internalName: selected, fileText })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setBaselineFileText(fileText)
      setFileExists(true)
      toast.success('Saved user_settings.py')
    } finally {
      setSaving(false)
    }
  }, [selected, fileText])

  const handleRevert = useCallback(() => {
    setFileText(baselineFileText)
    setModel(modelFromUserSettingsEnv(parseUserSettingsEnvFromText(baselineFileText)))
  }, [baselineFileText])

  const handleCreate = useCallback(async () => {
    if (!selected) return
    const r = await api.createProtonUserSettings(selected)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    const d = r.data
    setInstallPath(d.installPath)
    setFilePath(d.filePath)
    setFileExists(d.fileExists)
    setFileText(d.fileText)
    setBaselineFileText(d.fileText)
    setModel(modelFromUserSettingsEnv(d.env))
    toast.success('Created user_settings.py')
  }, [selected])

  const handleSelectTool = useCallback(
    (internalName: string) => {
      setSelected(internalName)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('tool', internalName)
        return next
      }, { replace: true })
    },
    [setSearchParams]
  )

  const handleLoadBackupPick = useCallback(
    async (fileName: string) => {
      if (!fileName || !selected) return
      const r = await api.readProtonUserSettingsBackup({ internalName: selected, fileName })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setFileText(r.fileText)
      setModel(modelFromUserSettingsEnv(parseUserSettingsEnvFromText(r.fileText)))
      toast.message(`Loaded “${fileName}”`, { description: 'Review in the editor, then Save to apply to user_settings.py' })
    },
    [selected]
  )

  const openBackupDialog = useCallback(() => {
    if (!selected) return
    setBackupFileNameInput(suggestedBackupFileName(selected))
    setBackupDialogOpen(true)
  }, [selected])

  const handleConfirmSaveBackup = useCallback(async () => {
    if (!selected) return
    setSavingBackup(true)
    try {
      const r = await api.saveProtonUserSettingsNamedBackup({
        internalName: selected,
        fileName: backupFileNameInput.trim(),
        fileText,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setBackupDialogOpen(false)
      toast.success('Backup saved', {
        description: `steamtools-user-settings-backups/${backupFileNameInput.trim()}`,
      })
      await refreshBackups()
    } finally {
      setSavingBackup(false)
    }
  }, [selected, backupFileNameInput, fileText, refreshBackups])

  const rowLabel = useMemo(() => {
    const r = rows.find((x) => x.internalName === selected)
    return r?.displayName ?? selected
  }, [rows, selected])

  if (loadingList) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground text-sm">
        Loading compatibility tools…
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-6 text-center">
        <FileCog className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground max-w-md">
          No custom compatibility tools found under Steam&apos;s{' '}
          <code className="text-xs bg-muted px-1 rounded">compatibilitytools.d</code>. Install GE-Proton
          or Proton-CachyOS from <strong>Compat tools</strong>, or check Settings → Steam path.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Dialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save backup</DialogTitle>
            <DialogDescription>
              Stores the <strong>current editor text</strong> under{' '}
              <code className="text-xs font-mono bg-muted/60 px-1 rounded">
                steamtools-user-settings-backups/
              </code>{' '}
              in this tool&apos;s folder. Adjust the file name if you like, then confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="backup-filename" className="text-xs font-medium text-muted-foreground">
              File name
            </label>
            <Input
              id="backup-filename"
              value={backupFileNameInput}
              onChange={(e) => setBackupFileNameInput(e.target.value)}
              className="font-mono text-sm"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBackupDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmSaveBackup()}
              disabled={savingBackup || !backupFileNameInput.trim()}
            >
              Save backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header className="shrink-0 border-b border-border px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <FileCog className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-lg font-semibold">Proton user settings</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Edit <code className="font-mono bg-muted/50 px-1 rounded">user_settings.py</code> for each
          installed Proton build. Use <strong>Save backup</strong> to store a named copy of the current
          editor text; <strong>Load backup</strong> loads it into the editor (use Save to write{' '}
          <code className="font-mono bg-muted/50 px-1 rounded">user_settings.py</code>).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground shrink-0">Load backup</label>
          <Select
            value={backupLoadSelection}
            onChange={(e) => {
              const v = e.target.value
              setBackupLoadSelection('')
              if (v) void handleLoadBackupPick(v)
            }}
            className="min-w-[200px] flex-1 max-w-sm"
            disabled={loadingDoc}
          >
            <option value="">
              {backupEntries.length === 0 ? 'No backups yet' : 'Choose backup…'}
            </option>
            {backupEntries.map((e) => (
              <option key={e.fileName} value={e.fileName}>
                {formatBackupOptionLabel(e)}
              </option>
            ))}
          </Select>
          <label className="text-xs text-muted-foreground shrink-0">Tool</label>
          <Select
            value={selected}
            onChange={(e) => handleSelectTool(e.target.value)}
            className="min-w-[220px] flex-1 max-w-md"
            disabled={loadingDoc}
          >
            {rows.map((r) => (
              <option key={r.internalName} value={r.internalName}>
                {r.displayName}
                {defaultTool === r.internalName ? ' (Steam Play default)' : ''}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openBackupDialog}
            disabled={loadingDoc || !selected}
          >
            <Archive className="h-3.5 w-3.5 mr-1" />
            Save backup…
          </Button>
          {!fileExists && (
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleCreate()}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create user_settings.py
            </Button>
          )}
          {installPath && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void api.openPath(installPath)}
            >
              <FolderOpen className="h-3.5 w-3.5 mr-1" />
              Open folder
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!isDirty || saving || loadingDoc}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRevert}
            disabled={!isDirty || loadingDoc}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Revert
          </Button>
        </div>
        {filePath && (
          <p className="text-[11px] font-mono text-muted-foreground truncate" title={filePath}>
            {filePath}
          </p>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="w-[48%] min-w-0 border-r border-border flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border/60 shrink-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Env presets — {rowLabel}
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {loadingDoc ? (
              <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
            ) : (
              <StructuredPanel
                model={model}
                onModelChange={handleModelChange}
                globalEnv={{}}
                disabledReason={null}
                panelMode="userSettings"
              />
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border/60 shrink-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">File</p>
          </div>
          <Textarea
            value={fileText}
            onChange={(e) => onFileTextChange(e.target.value)}
            className="flex-1 min-h-0 rounded-none border-0 font-mono text-xs resize-none focus-visible:ring-0"
            placeholder="# user_settings.py — create or paste content"
            spellCheck={false}
            disabled={loadingDoc}
          />
        </div>
      </div>
    </div>
  )
}
