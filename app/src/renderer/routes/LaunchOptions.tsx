import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  Save, RefreshCw, AlertTriangle, FolderOpen, Undo2, Copy, X, ChevronDown, ChevronUp, Clipboard,
  FileCog,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { Select } from '../components/ui/select'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import { GameTable } from '../components/GameTable'
import { StructuredPanel } from '../components/StructuredPanel'
import { SteamStatusPill } from '../components/SteamStatusPill'
import { CopyToGamesDialog } from '../components/CopyToGamesDialog'
import { api } from '../lib/ipc'
import {
  parseLaunchOptions,
  serializeLaunchOptions,
  transformLaunchOptions,
  BATCH_SNIPPETS,
  COMMAND_TOKEN,
  tokenize,
  diffTokens,
} from '../../shared/launchOptions/compose'
import type { LaunchOptionsModel, ClassifiedToken, DiffToken } from '../../shared/launchOptions/compose'
import type {
  CompatToolInfo,
  InstalledGame,
  GpuInfo,
  SteamAccount,
  BatchOp,
  BatchTransformPreviewRow,
  MangoHudStatus,
  RunningFsrStatus,
} from '../../shared/types'

// ── Token chip rendering helpers ─────────────────────────────────────────────

const TOKEN_CLS: Record<ClassifiedToken['kind'], string> = {
  command: 'bg-primary/20 text-primary font-semibold',
  wrapper: 'bg-muted text-foreground',
  env: 'bg-muted/60 text-muted-foreground font-mono',
  gamescope: 'bg-muted/60 text-muted-foreground',
  other: 'text-muted-foreground',
}

function TokenChip({ token }: { token: ClassifiedToken }) {
  return (
    <span className={`inline-block rounded px-1 py-0.5 text-[11px] leading-tight ${TOKEN_CLS[token.kind]}`}>
      {token.raw}
    </span>
  )
}

const DIFF_CLS: Record<DiffToken['status'], string> = {
  same: TOKEN_CLS.other,
  added: 'bg-green-500/20 text-green-400 font-mono',
  removed: 'bg-red-500/20 text-red-400 line-through font-mono',
}

function DiffChip({ token }: { token: DiffToken }) {
  return (
    <span className={`inline-block rounded px-1 py-0.5 text-[11px] leading-tight ${DIFF_CLS[token.status]}`}>
      {token.raw}
    </span>
  )
}

// ── Batch op metadata ──────────────────────────────────────────────────────

const BATCH_OPS: { value: BatchOp; label: string; needsEditor: boolean }[] = [
  { value: 'set', label: 'Replace completely', needsEditor: true },
  { value: 'prefix', label: 'Add at start', needsEditor: true },
  { value: 'suffix', label: 'Add at end', needsEditor: true },
  { value: 'replace', label: 'Find & replace', needsEditor: false },
  { value: 'clear', label: 'Remove all options', needsEditor: false },
  { value: 'snippet', label: 'Insert preset', needsEditor: false },
]

export function LaunchOptions() {
  // ── Data state ─────────────────────────────────────────────────────────
  const [games, setGames] = useState<InstalledGame[]>([])
  const [loading, setLoading] = useState(true)
  const [steamRunning, setSteamRunning] = useState(false)
  const [accounts, setAccounts] = useState<SteamAccount[]>([])
  const [accountId, setAccountId] = useState<string>('')
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null)
  const [showTools, setShowTools] = useState(false)
  const [search, setSearch] = useState('')

  // ── Selection state ─────────────────────────────────────────────────────
  const [selectedAppIds, setSelectedAppIds] = useState<Set<number>>(new Set())

  // ── Editor state ────────────────────────────────────────────────────────
  const [editValue, setEditValue] = useState('')
  const [model, setModel] = useState<LaunchOptionsModel>(parseLaunchOptions(''))
  const [baseline, setBaseline] = useState('')  // value when game was selected (for dirty check)
  const syncing = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Batch multi-select state ─────────────────────────────────────────────
  const [batchOp, setBatchOp] = useState<BatchOp>('prefix')
  const [batchFindText, setBatchFindText] = useState('')
  const [batchReplaceText, setBatchReplaceText] = useState('')
  const [batchSnippet, setBatchSnippet] = useState(BATCH_SNIPPETS[0].snippet)
  const [batchPreview, setBatchPreview] = useState<BatchTransformPreviewRow[]>([])
  const [batchPreviewed, setBatchPreviewed] = useState(false)
  const [batchApplying, setBatchApplying] = useState(false)
  const [batchPreviewOpen, setBatchPreviewOpen] = useState(false)

  // ── Copy-to dialog ──────────────────────────────────────────────────────
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)

  // ── Global env (user_settings.py) ──────────────────────────────────────
  const [globalEnv, setGlobalEnv] = useState<Record<string, string>>({})
  /** Steam Play default from config.vdf CompatToolMapping "0" */
  const [steamPlayDefault, setSteamPlayDefault] = useState<{ toolName: string | null; toolDescription: string | null } | null>(null)
  const [compatByApp, setCompatByApp] = useState<Map<number, CompatToolInfo>>(new Map())
  /** Internal names found under compatibilitytools.d (user-editable installs). */
  const [installedCompatToolNames, setInstalledCompatToolNames] = useState<Set<string>>(new Set())
  const [mangoHudStatus, setMangoHudStatus] = useState<MangoHudStatus | null>(null)
  const [runningFsrStatus, setRunningFsrStatus] = useState<RunningFsrStatus | null>(null)

  // ── Saving ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)

  const selCount = selectedAppIds.size
  const singleGame = selCount === 1 ? games.find((g) => selectedAppIds.has(g.appId)) ?? null : null
  const isDirty = editValue !== baseline

  // ── Load ────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    const [gameList, accs, compatTools] = await Promise.all([
      api.listGames(),
      api.listAccounts(),
      api.listCompatToolsInstalled().catch(() => []),
    ])
    void api.getMangoHudStatus().then(setMangoHudStatus).catch(() => setMangoHudStatus(null))
    void api.getRunningFsrStatus().then(setRunningFsrStatus).catch(() => setRunningFsrStatus(null))
    const gamesArr = gameList ?? []
    setGames(gamesArr)
    setAccounts(accs ?? [])
    if (accs?.length && !accountId) setAccountId(accs[0].accountId)
    setInstalledCompatToolNames(
      new Set((compatTools ?? []).map((r) => (r.internalName ?? '').trim().toLowerCase()).filter(Boolean))
    )

    try {
      const snap = await api.getCompatSnapshot(gamesArr.map((g) => g.appId))
      setSteamPlayDefault(snap.steamPlayDefault)
      setCompatByApp(new Map(Object.entries(snap.perApp).map(([k, v]) => [Number(k), v])))
    } catch {
      setSteamPlayDefault(null)
      setCompatByApp(new Map())
    }

    setLoading(false)
  }, [accountId])

  useEffect(() => {
    loadAll()
    api.detectGpu().then(setGpuInfo)
  }, [])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (singleGame && isDirty && !steamRunning) handleSave()
      }
      if (e.key === 'Escape' && !inInput && selCount > 0) {
        setSelectedAppIds(new Set())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [singleGame, isDirty, steamRunning, selCount])

  // Reload launch options from selected game whenever account switches
  useEffect(() => {
    if (singleGame) {
      const v = singleGame.launchOptions ?? ''
      setEditValue(v)
      setBaseline(v)
      syncing.current = true
      setModel(parseLaunchOptions(v))
      syncing.current = false
      void api.getRunningFsrStatus(singleGame.appId).then(setRunningFsrStatus).catch(() => setRunningFsrStatus(null))
    }
  }, [accountId])

  // ── Game filter ─────────────────────────────────────────────────────────
  const displayGames = useMemo(() => {
    if (showTools) return games
    return games.filter((g) => g.compatDataPath !== null || g.launchOptions)
  }, [games, showTools])

  // ── Selection handling ──────────────────────────────────────────────────
  const handleSelectionChange = useCallback((ids: Set<number>) => {
    setSelectedAppIds(ids)
    if (ids.size === 1) {
      const game = games.find((g) => ids.has(g.appId))
      if (game) {
        const v = game.launchOptions ?? ''
        setEditValue(v)
        setBaseline(v)
        syncing.current = true
        setModel(parseLaunchOptions(v))
        syncing.current = false
        // Load global env overrides for this game's Proton tool
        api.getGlobalEnvOverrides(game.appId).then((env) => setGlobalEnv(env ?? {}))
        void api.getRunningFsrStatus(game.appId).then(setRunningFsrStatus).catch(() => setRunningFsrStatus(null))
      }
    } else {
      // Multi or zero: reset editor to empty, clear global env
      setEditValue('')
      setBaseline('')
      syncing.current = true
      setModel(parseLaunchOptions(''))
      syncing.current = false
      setGlobalEnv({})
      void api.getRunningFsrStatus(null).then(setRunningFsrStatus).catch(() => setRunningFsrStatus(null))
    }
    // Reset batch state
    setBatchPreviewed(false)
    setBatchPreview([])
  }, [games])

  // ── Raw ↔ Structured sync ────────────────────────────────────────────────
  const handleRawChange = (v: string) => {
    setEditValue(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (syncing.current) return
      syncing.current = true
      setModel(parseLaunchOptions(v))
      syncing.current = false
    }, 160)
  }

  const handleModelChange = (newModel: LaunchOptionsModel) => {
    if (syncing.current) return
    syncing.current = true
    const newValue = serializeLaunchOptions(newModel)
    setModel(newModel)
    setEditValue(newValue)
    syncing.current = false
  }

  // ── Save single ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!singleGame || steamRunning) return
    setSaving(true)
    const result = await api.setLaunchOptions(singleGame.appId, editValue)
    setSaving(false)
    if (result?.ok) {
      toast.success(`Saved for ${singleGame.name}`)
      setBaseline(editValue)
      setGames((prev) => prev.map((g) => g.appId === singleGame.appId ? { ...g, launchOptions: editValue } : g))
    } else {
      toast.error(result?.error ?? 'Save failed')
    }
  }

  const handleRevert = () => {
    setEditValue(baseline)
    syncing.current = true
    setModel(parseLaunchOptions(baseline))
    syncing.current = false
  }

  // ── Batch preview ─────────────────────────────────────────────────────────
  const buildBatchParams = () => {
    const currentOp = BATCH_OPS.find((o) => o.value === batchOp)!
    if (batchOp === 'replace') return { op: batchOp, find: batchFindText, replaceWith: batchReplaceText }
    if (batchOp === 'clear') return { op: batchOp }
    if (batchOp === 'snippet') return { op: batchOp, snippet: batchSnippet }
    // set / prefix / suffix: use editValue as the payload
    return { op: batchOp, setValue: editValue, prefix: editValue, suffix: editValue }
  }

  const handleBatchPreview = async () => {
    const params = buildBatchParams()
    const appIds = Array.from(selectedAppIds)
    // Compute locally for speed (same logic as server)
    const rows: BatchTransformPreviewRow[] = appIds.map((appId) => {
      const game = games.find((g) => g.appId === appId)!
      const before = game.launchOptions ?? ''
      const after = transformLaunchOptions(before, params)
      return { appId, name: game.name, before, after }
    })
    setBatchPreview(rows)
    setBatchPreviewed(true)
    setBatchPreviewOpen(true)
  }

  const handleBatchApply = async () => {
    if (!batchPreviewed || !batchPreview.length || steamRunning) return
    setBatchApplying(true)
    const result = await api.applyBatchTransform({
      rows: batchPreview.map(({ appId, after }) => ({ appId, after })),
      accountId,
    })
    setBatchApplying(false)
    if (result?.ok) {
      toast.success(`Applied to ${result.written} games`)
      setBatchPreviewed(false)
      setBatchPreview([])
      setBatchPreviewOpen(false)
      await loadAll()
    } else {
      toast.error(result?.error ?? 'Apply failed')
    }
  }

  // ── Toolbar helpers ─────────────────────────────────────────────────────
  const handleUndoBackup = async () => {
    if (!accountId) return
    const result = await api.restoreBackup(accountId)
    if (result?.ok) {
      toast.success(`Restored from ${result.restoredFrom}`)
      await loadAll()
    } else {
      toast.error(result?.error ?? 'Restore failed')
    }
  }

  const handleOpenFolder = () => {
    if (accountId) api.openLocalconfigFolder(accountId)
  }

  // ── Determine which batch op needs what inputs ──────────────────────────
  const currentOpMeta = BATCH_OPS.find((o) => o.value === batchOp)!

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="p-4 pb-3 border-b border-border space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold tracking-tight mr-1">Launch Options</h1>
          <SteamStatusPill onStatusChange={setSteamRunning} />
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Account picker */}
            {accounts.length > 1 && (
              <Select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-8 text-xs w-48"
              >
                {accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.persona ? `${a.persona} (${a.accountId})` : a.accountId}
                  </option>
                ))}
              </Select>
            )}
            <Button variant="ghost" size="sm" onClick={handleOpenFolder} title="Open Steam config folder" className="h-8">
              <FolderOpen className="h-3.5 w-3.5 mr-1" />
              Config folder
            </Button>
            <Button variant="ghost" size="sm" onClick={handleUndoBackup} title="Restore last backup" className="h-8">
              <Undo2 className="h-3.5 w-3.5 mr-1" />
              Undo last save
            </Button>
            <Button variant="ghost" size="sm" onClick={loadAll} className="h-8">
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground">
            <Switch checked={showTools} onCheckedChange={setShowTools} />
            Show Proton runtimes & tools
          </label>
          {steamPlayDefault?.toolDescription ? (
            <span className="text-xs text-muted-foreground">
              Steam Play default:{' '}
              <span className="font-medium text-foreground">{steamPlayDefault.toolDescription}</span>
            </span>
          ) : (
            <span
              className="text-xs text-muted-foreground"
              title={'Nothing under CompatToolMapping "0" in Steam config/config.vdf — set a default in Steam Settings → Steam Play.'}
            >
              Steam Play default: not set in Steam config
            </span>
          )}
          {steamRunning && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Steam is running — saves are blocked
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            MangoHud config: {mangoHudStatus?.configExists ? 'active' : 'not found'}
          </span>
          <span
            className="text-xs text-muted-foreground"
            title={
              runningFsrStatus
                ? `${runningFsrStatus.sourcePath ?? ''}\nAppID: ${runningFsrStatus.detectedAppId ?? '—'} | PID: ${runningFsrStatus.detectedGamePid ?? '—'} | Source kind: ${runningFsrStatus.dllPathKind}\nIndicator: ${runningFsrStatus.indicatorRequested ? 'requested' : 'not requested'} | DLL: ${runningFsrStatus.dllLoaded ? 'loaded' : 'not loaded'} | Likely active: ${runningFsrStatus.likelyActive ? 'yes' : 'no'}\nMapped families => FSR: ${runningFsrStatus.mappedDlls.fsr.length} | DLSS: ${runningFsrStatus.mappedDlls.dlss.length} | XeSS: ${runningFsrStatus.mappedDlls.xess.length}\nFSR: ${runningFsrStatus.fsrVersion ?? '—'} | ML FI: ${runningFsrStatus.mlfiVersion ?? '—'} | Frame Gen: ${runningFsrStatus.framegenVersion ?? '—'}`
                : ''
            }
          >
            Runtime FSR: {runningFsrStatus?.label ?? 'unknown'}
          </span>
        </div>
      </div>

      {/* ── Main split ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Left: game table */}
        <div className="w-[45%] min-w-0 border-r border-border p-3 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground animate-pulse text-sm">Loading games…</div>
          ) : (
            <GameTable
              games={displayGames}
              selectedAppIds={selectedAppIds}
              onSelectionChange={handleSelectionChange}
              searchValue={search}
              onSearchChange={setSearch}
              compatByApp={compatByApp.size > 0 ? compatByApp : undefined}
            />
          )}
        </div>

        {/* Right: editor pane */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto">
          {selCount === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select a game to edit its launch options
            </div>
          )}

          {selCount === 1 && singleGame && (
            <SingleGameEditor
              game={singleGame}
              compatInfo={compatByApp.get(singleGame.appId) ?? null}
              installedCompatToolNames={installedCompatToolNames}
              editValue={editValue}
              baseline={baseline}
              model={model}
              isDirty={isDirty}
              steamRunning={steamRunning}
              saving={saving}
              gpuInfo={gpuInfo}
              globalEnv={globalEnv}
              onRawChange={handleRawChange}
              onModelChange={handleModelChange}
              onSave={handleSave}
              onRevert={handleRevert}
              onCopyTo={() => setCopyDialogOpen(true)}
            />
          )}

          {selCount > 1 && (
            <MultiGameEditor
              selCount={selCount}
              editValue={editValue}
              model={model}
              steamRunning={steamRunning}
              gpuInfo={gpuInfo}
              globalEnv={globalEnv}
              batchOp={batchOp}
              batchFindText={batchFindText}
              batchReplaceText={batchReplaceText}
              batchSnippet={batchSnippet}
              batchPreview={batchPreview}
              batchPreviewed={batchPreviewed}
              batchApplying={batchApplying}
              batchPreviewOpen={batchPreviewOpen}
              currentOpMeta={currentOpMeta}
              onClearSelection={() => setSelectedAppIds(new Set())}
              onRawChange={handleRawChange}
              onModelChange={handleModelChange}
              onBatchOpChange={(op) => { setBatchOp(op); setBatchPreviewed(false); setBatchPreview([]) }}
              onBatchFindChange={(v) => { setBatchFindText(v); setBatchPreviewed(false) }}
              onBatchReplaceChange={(v) => { setBatchReplaceText(v); setBatchPreviewed(false) }}
              onBatchSnippetChange={(v) => { setBatchSnippet(v); setBatchPreviewed(false) }}
              onPreview={handleBatchPreview}
              onApply={handleBatchApply}
              onTogglePreview={() => setBatchPreviewOpen((o) => !o)}
            />
          )}
        </div>
      </div>

      {/* Copy-to dialog */}
      {singleGame && (
        <CopyToGamesDialog
          open={copyDialogOpen}
          onOpenChange={setCopyDialogOpen}
          sourceGame={singleGame}
          sourceValue={editValue}
          allGames={games}
          accountId={accountId}
          onDone={loadAll}
        />
      )}
    </div>
  )
}

// ── Single-game editor ───────────────────────────────────────────────────────

interface SingleGameEditorProps {
  game: InstalledGame
  compatInfo: CompatToolInfo | null
  installedCompatToolNames: Set<string>
  editValue: string
  baseline: string
  model: LaunchOptionsModel
  isDirty: boolean
  steamRunning: boolean
  saving: boolean
  gpuInfo: GpuInfo | null
  globalEnv: Record<string, string>
  onRawChange: (v: string) => void
  onModelChange: (m: LaunchOptionsModel) => void
  onSave: () => void
  onRevert: () => void
  onCopyTo: () => void
}

function SingleGameEditor({
  game, compatInfo, installedCompatToolNames, editValue, baseline, model, isDirty, steamRunning, saving, gpuInfo, globalEnv,
  onRawChange, onModelChange, onSave, onRevert, onCopyTo,
}: SingleGameEditorProps) {
  const navigate = useNavigate()
  const resolvedCompatToolForSettings =
    compatInfo && compatInfo.selectionKind !== 'native'
      ? (compatInfo.toolName ?? compatInfo.steamDefaultToolName ?? null)
      : null
  const protonToolForUserSettings =
    resolvedCompatToolForSettings &&
    installedCompatToolNames.has(resolvedCompatToolForSettings.trim().toLowerCase())
      ? resolvedCompatToolForSettings
      : null
  const charCount = editValue.length
  const charWarning = charCount > 256
  const isDirtyDiff = isDirty && baseline !== editValue
  const diffResult = isDirtyDiff ? diffTokens(baseline, editValue) : null
  const previewTokens = tokenize(editValue.trim() || COMMAND_TOKEN)

  const handleCopyRaw = () => {
    navigator.clipboard.writeText(editValue).then(() => toast.success('Copied to clipboard'))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Game header — fixed */}
      <div className="px-4 pt-4 pb-2 shrink-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-semibold truncate">{game.name}</h2>
            {isDirty && <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Unsaved changes (Ctrl+S to save)" />}
          </div>
          <Badge variant="secondary" className="text-xs shrink-0 ml-2">#{game.appId}</Badge>
        </div>
        {compatInfo && (
          <p className="text-xs text-muted-foreground leading-snug">
            {compatInfo.selectionKind === 'native' && (
              <>Compatibility tool: Linux native (forced for this title).</>
            )}
            {compatInfo.selectionKind === 'steam_default' && (
              compatInfo.toolDescription ? (
                <>
                  Compatibility tool: <span className="text-foreground">{compatInfo.toolDescription}</span>
                  {' '}— matches Steam Play default.
                </>
              ) : (
                <>Compatibility tool follows Steam Play default (not listed in Steam config).</>
              )
            )}
            {compatInfo.selectionKind === 'override' && compatInfo.toolDescription && (
              <>
                Compatibility tool: <span className="text-foreground">{compatInfo.toolDescription}</span>
                {' '}(custom).
                {compatInfo.steamDefaultDescription && (
                  <> Steam Play default is <span className="text-foreground">{compatInfo.steamDefaultDescription}</span>.</>
                )}
              </>
            )}
          </p>
        )}
        {protonToolForUserSettings && (
          <button
            type="button"
            className="text-xs text-primary hover:underline flex items-center gap-1.5 mt-1 w-fit"
            onClick={() =>
              navigate(`/proton-user-settings?tool=${encodeURIComponent(protonToolForUserSettings)}`)
            }
          >
            <FileCog className="h-3.5 w-3.5 shrink-0" />
            Edit user_settings.py for this Proton build
          </button>
        )}
      </div>

      {/* Structured panel — fills all remaining space, scrolls internally */}
      <div className="flex flex-1 flex-col min-h-0 overflow-y-auto px-4">
        <StructuredPanel
          model={model}
          onModelChange={onModelChange}
          gpuInfo={gpuInfo}
          globalEnv={globalEnv}
          disabledReason={steamRunning ? 'steam-running' : null}
        />
      </div>

      {/* Raw editor + preview — fixed above action bar */}
      <div className="px-4 pt-2 pb-1 space-y-2 border-t border-border/50 shrink-0">
        {/* Raw editor */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Raw launch options</label>
            <div className="flex items-center gap-3 text-[11px]">
              <span className={charWarning ? 'text-amber-400' : 'text-muted-foreground'}>
                {charCount} chars{charWarning ? ' — may truncate' : ''}
              </span>
              <button
                onClick={handleCopyRaw}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy raw to clipboard"
              >
                <Clipboard className="h-3 w-3" />
                Copy raw
              </button>
            </div>
          </div>
          <Textarea
            value={editValue}
            onChange={(e) => onRawChange(e.target.value)}
            placeholder={`e.g. mangohud gamemode ${COMMAND_TOKEN}`}
            className="font-mono text-sm h-16 resize-none"
            disabled={steamRunning}
            data-selectable
          />
        </div>

        {/* Live preview / diff */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            {diffResult ? 'Changes' : 'Preview'}
          </p>
          <div className="flex flex-wrap gap-1 rounded-md bg-black/30 px-3 py-1.5 min-h-[1.75rem]">
            {diffResult
              ? diffResult.map((t, i) => <DiffChip key={i} token={t} />)
              : previewTokens.map((t, i) => <TokenChip key={i} token={t} />)}
          </div>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 px-4 py-3 border-t border-border bg-background/95 backdrop-blur-sm flex gap-2 flex-wrap shrink-0">
        <Button variant="ghost" size="sm" onClick={onRevert} disabled={!isDirty}>
          Revert
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || steamRunning || !isDirty}
          className="gap-1.5"
          title="Ctrl+S"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="outline" size="sm" onClick={onCopyTo} className="gap-1.5 ml-auto">
          <Copy className="h-3.5 w-3.5" />
          Copy to other games…
        </Button>
      </div>
    </div>
  )
}

// ── Multi-game editor ────────────────────────────────────────────────────────

interface MultiGameEditorProps {
  selCount: number
  editValue: string
  model: LaunchOptionsModel
  steamRunning: boolean
  gpuInfo: GpuInfo | null
  globalEnv: Record<string, string>
  batchOp: BatchOp
  batchFindText: string
  batchReplaceText: string
  batchSnippet: string
  batchPreview: BatchTransformPreviewRow[]
  batchPreviewed: boolean
  batchApplying: boolean
  batchPreviewOpen: boolean
  currentOpMeta: typeof BATCH_OPS[number]
  onClearSelection: () => void
  onRawChange: (v: string) => void
  onModelChange: (m: LaunchOptionsModel) => void
  onBatchOpChange: (op: BatchOp) => void
  onBatchFindChange: (v: string) => void
  onBatchReplaceChange: (v: string) => void
  onBatchSnippetChange: (v: string) => void
  onPreview: () => void
  onApply: () => void
  onTogglePreview: () => void
}

function MultiGameEditor({
  selCount, editValue, model, steamRunning, gpuInfo, globalEnv,
  batchOp, batchFindText, batchReplaceText, batchSnippet,
  batchPreview, batchPreviewed, batchApplying, batchPreviewOpen,
  currentOpMeta,
  onClearSelection, onRawChange, onModelChange, onBatchOpChange,
  onBatchFindChange, onBatchReplaceChange, onBatchSnippetChange,
  onPreview, onApply, onTogglePreview,
}: MultiGameEditorProps) {
  const editorDisabled = steamRunning || batchOp === 'clear' || batchOp === 'snippet' || batchOp === 'replace'

  return (
    <div className="flex flex-col h-full">
      {/* Fixed header: breadcrumb + op selector + op-specific inputs */}
      <div className="px-4 pt-4 pb-2 space-y-3 shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{selCount} games selected</Badge>
          <button onClick={onClearSelection} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
            <X className="h-3 w-3" /> Clear
          </button>
        </div>

        {/* Op selector */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Operation</label>
          <Select value={batchOp} onChange={(e) => onBatchOpChange(e.target.value as BatchOp)} className="w-full">
            {BATCH_OPS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>

        {/* Op-specific inputs */}
        {batchOp === 'replace' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Find</label>
              <Input value={batchFindText} onChange={(e) => onBatchFindChange(e.target.value)} placeholder="Text to find" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Replace with</label>
              <Input value={batchReplaceText} onChange={(e) => onBatchReplaceChange(e.target.value)} placeholder="Replacement" className="h-8 text-xs" />
            </div>
          </div>
        )}

        {batchOp === 'snippet' && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Snippet to insert</label>
            <Select value={batchSnippet} onChange={(e) => onBatchSnippetChange(e.target.value)} className="w-full">
              {BATCH_SNIPPETS.map((s) => (
                <option key={s.id} value={s.snippet}>{s.label}</option>
              ))}
            </Select>
          </div>
        )}

        {batchOp === 'clear' && (
          <Card className="px-3 py-2">
            <p className="text-xs text-muted-foreground">This will remove all launch options for the {selCount} selected games.</p>
          </Card>
        )}
      </div>

      {/* Structured panel — fills remaining vertical space, scrolls internally */}
      <div className="flex flex-1 flex-col min-h-0 overflow-y-auto px-4">
        <StructuredPanel
          model={model}
          onModelChange={onModelChange}
          gpuInfo={gpuInfo}
          globalEnv={globalEnv}
          disabledReason={steamRunning ? 'steam-running' : !currentOpMeta.needsEditor ? 'op-no-editor' : null}
        />
      </div>

      {/* Raw editor for applicable ops — fixed above action bar */}
      {currentOpMeta.needsEditor && (
        <div className="px-4 pt-2 pb-1 border-t border-border/50 shrink-0">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {batchOp === 'set' ? 'New value (replaces each game)' : batchOp === 'prefix' ? 'Prefix to add' : 'Suffix to add'}
          </label>
          <Textarea
            value={editValue}
            onChange={(e) => onRawChange(e.target.value)}
            placeholder={`e.g. mangohud gamemode ${COMMAND_TOKEN}`}
            className="font-mono text-sm h-16 resize-none mt-1"
            disabled={steamRunning}
            data-selectable
          />
        </div>
      )}

      {/* Action bar + preview table — fixed at bottom */}
      <div className="px-4 py-3 border-t border-border bg-background/95 backdrop-blur-sm shrink-0 space-y-2">
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={onPreview} disabled={batchOp === 'replace' && !batchFindText}>
            Preview changes
          </Button>
          {batchPreviewed && (
            <Button
              size="sm"
              onClick={onApply}
              disabled={!batchPreviewed || !batchPreview.length || batchApplying || steamRunning}
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {batchApplying ? 'Applying…' : `Apply to ${batchPreview.length} games`}
            </Button>
          )}
        </div>

        {/* Before/After preview table */}
        {batchPreviewed && batchPreview.length > 0 && (
          <div className="space-y-1">
            <button
              onClick={onTogglePreview}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {batchPreviewOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {batchPreviewOpen ? 'Hide' : 'Show'} preview ({batchPreview.length} games)
            </button>
            {batchPreviewOpen && (
              <div className="overflow-y-auto max-h-44 rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-1/3">Game</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-1/3">Before</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-1/3">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchPreview.map((row) => (
                      <tr key={row.appId} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-2 py-1 font-medium truncate max-w-[150px]" title={row.name}>{row.name}</td>
                        <td className="px-2 py-1 font-mono text-muted-foreground truncate max-w-[150px]" title={row.before}>{row.before || <em>empty</em>}</td>
                        <td className="px-2 py-1 font-mono truncate max-w-[150px]" title={row.after}>{row.after || <em>empty</em>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
