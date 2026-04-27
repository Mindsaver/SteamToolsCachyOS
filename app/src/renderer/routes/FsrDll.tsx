import React, { useState } from 'react'
import { Play, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { DropZoneDll } from '../components/DropZoneDll'
import { LogStream } from '../components/LogStream'
import { api } from '../lib/ipc'
import type { DllVersionInfo, SymlinkProgress } from '../../shared/types'

export function FsrDll() {
  const [dllPath, setDllPath] = useState<string | null>(null)
  const [dllInfo, setDllInfo] = useState<DllVersionInfo | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [copying, setCopying] = useState(false)
  const [logs, setLogs] = useState<SymlinkProgress[]>([])

  const handleFileSelected = async (path: string) => {
    setDllPath(path)
    setDllInfo(null)
    setLogs([])
    setAnalyzing(true)
    const result = await api.analyzeDll(path)
    setAnalyzing(false)
    if (result?.ok) {
      setDllInfo(result.data)
    } else {
      toast.error(`Failed to analyze DLL: ${result?.error}`)
    }
  }

  const handleCopy = async () => {
    if (!dllPath) return
    setLogs([])
    setCopying(true)

    const off = api.onFsrProgress((p) => {
      setLogs((prev) => [...prev, p])
    })

    const result = await api.copyDll(dllPath)
    off()
    setCopying(false)

    if (result?.ok) {
      toast.success('DLL copied to all game prefixes')
    } else {
      toast.error(result?.error ?? 'Copy failed')
    }
  }

  return (
    <div className="p-6 space-y-5 h-full flex flex-col">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">FSR DLL Helper</h1>
        <p className="text-muted-foreground mt-1">
          Detect the FSR/FFX version in <code className="text-xs bg-muted px-1 py-0.5 rounded">amdxcffx64.dll</code>{' '}
          and copy it into all game Proton prefixes.
        </p>
      </div>

      {!dllPath ? (
        <DropZoneDll onFileSelected={handleFileSelected} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex-1 font-mono text-sm truncate text-muted-foreground">{dllPath}</div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => { setDllPath(null); setDllInfo(null); setLogs([]) }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {analyzing && (
            <p className="text-sm text-muted-foreground animate-pulse">Analyzing DLL…</p>
          )}

          {dllInfo && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Detected versions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {dllInfo.roles.length > 0 ? (
                    dllInfo.roles.map((r) => (
                      <Badge key={r} variant="secondary">{r}</Badge>
                    ))
                  ) : (
                    <Badge variant="outline">No known roles detected</Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">FSR version</p>
                    <p className="font-mono font-medium">{dllInfo.fsr ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">ML FI version</p>
                    <p className="font-mono font-medium">{dllInfo.ml ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Frame Gen version</p>
                    <p className="font-mono font-medium">{dllInfo.framegen ?? '—'}</p>
                  </div>
                </div>
                {dllInfo.rawVersions.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    All versions found: {dllInfo.rawVersions.join(', ')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {dllInfo && (
            <div className="flex gap-3">
              <Button onClick={handleCopy} disabled={copying} className="gap-2">
                <Play className="h-4 w-4" />
                {copying ? 'Copying…' : 'Copy DLL to all game prefixes'}
              </Button>
            </div>
          )}
        </div>
      )}

      {logs.length > 0 && (
        <div className="flex-1 min-h-0">
          <LogStream lines={logs} className="h-full" />
        </div>
      )}
    </div>
  )
}
