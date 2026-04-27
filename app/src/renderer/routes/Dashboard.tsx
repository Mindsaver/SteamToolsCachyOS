import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderSymlink, Cpu, Gamepad2, ChevronRight, HardDrive, Users, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { api } from '../lib/ipc'
import type { GpuInfo } from '../../shared/types'

interface SteamInfo {
  installPath: string
  libraries: string[]
  userDataPath: string | null
  accounts: string[]
}

export function Dashboard() {
  const [steamInfo, setSteamInfo] = useState<SteamInfo | null>(null)
  const [gameCount, setGameCount] = useState<number | null>(null)
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getSteamInfo(),
      api.listGames(),
      api.detectGpu(),
    ]).then(([info, games, gpu]) => {
      setSteamInfo(info)
      setGameCount(games?.length ?? 0)
      setGpuInfo(gpu)
    }).finally(() => setLoading(false))
  }, [])

  const gpuLabel = (g: GpuInfo) => {
    const parts: string[] = []
    if (g.hasAmd) parts.push('AMD')
    if (g.hasNvidia) parts.push('NVIDIA')
    if (g.hasIntel) parts.push('Intel')
    return parts.join(' + ') || 'Unknown'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground animate-pulse">Loading Steam info…</div>
      </div>
    )
  }

  if (!steamInfo) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-lg font-semibold">Steam installation not found</p>
        <p className="text-muted-foreground">
          Set the Steam path in{' '}
          <Link to="/settings" className="text-primary hover:underline">
            Settings
          </Link>{' '}
          or ensure Steam is installed in a standard location.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Steam toolkit overview and quick actions</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              Libraries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{steamInfo.libraries.length}</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{steamInfo.installPath}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Gamepad2 className="h-3.5 w-3.5" />
              Games
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{gameCount ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">installed titles</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              GPU
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{gpuInfo ? gpuLabel(gpuInfo) : '—'}</p>
            {gpuInfo?.hasAmd && (
              <Badge variant="success" className="mt-1.5 text-xs">FSR compatible</Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{steamInfo.accounts.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Steam accounts</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Quick actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link to="/symlink">
            <Card className="hover:border-primary/50 hover:bg-muted/10 transition-colors cursor-pointer group">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FolderSymlink className="h-5 w-5 text-primary" />
                    Symlink Hub
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Create per-game folders with symlinks to install dir, Proton prefix, system32, and userdata.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/fsr">
            <Card className="hover:border-primary/50 hover:bg-muted/10 transition-colors cursor-pointer group">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-primary" />
                    FSR DLL
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Detect FSR/FFX version in amdxcffx64.dll and copy it into all game Proton prefixes.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/launch-options">
            <Card className="hover:border-primary/50 hover:bg-muted/10 transition-colors cursor-pointer group">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Gamepad2 className="h-5 w-5 text-primary" />
                    Launch Options
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Edit per-game or batch Steam launch options with structured preset toggles.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/compat-tools">
            <Card className="hover:border-primary/50 hover:bg-muted/10 transition-colors cursor-pointer group">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    Compat tools
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Install GE-Proton or Proton-CachyOS into Steam, optional auto update from GitHub, and open tool folders.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Library paths */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Steam library paths
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
            {steamInfo.libraries.map((lib) => (
              <li key={lib} className="font-mono text-xs text-muted-foreground">
                {lib}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
