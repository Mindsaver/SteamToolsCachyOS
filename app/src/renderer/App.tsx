import React, { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderSymlink,
  Cpu,
  Gamepad2,
  Settings as SettingsIcon,
  Package,
  FileCog,
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { cn } from './lib/utils'
import { UpdateBanner } from './components/UpdateBanner'
import { SimBanner } from './components/SimBanner'
import { Dashboard } from './routes/Dashboard'
import { SymlinkHub } from './routes/SymlinkHub'
import { FsrDll } from './routes/FsrDll'
import { LaunchOptions } from './routes/LaunchOptions'
import { ProtonUserSettings } from './routes/ProtonUserSettings'
import { CompatTools } from './routes/CompatTools'
import { Settings } from './routes/Settings'
import { AboutDialog } from './components/AboutDialog'
import { api } from './lib/ipc'

// Sim mode is set by the preload at build time via contextBridge.
// window.api.__simMode is true when launched with dev:sim.
const IS_SIM = typeof window !== 'undefined' && (window as Window & { api?: { __simMode?: boolean } }).api?.__simMode === true

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/symlink', label: 'Symlink Hub', icon: FolderSymlink },
  { to: '/fsr', label: 'FSR DLL', icon: Cpu },
  { to: '/launch-options', label: 'Launch Options', icon: Gamepad2 },
  { to: '/proton-user-settings', label: 'Proton user settings', icon: FileCog },
  { to: '/compat-tools', label: 'Compat tools', icon: Package },
]

export default function App() {
  const navigate = useNavigate()
  const [aboutOpen, setAboutOpen] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    return api.onShowAbout(() => setAboutOpen(true))
  }, [])

  useEffect(() => {
    return api.onCompatToolsUpdateAvailable((p) => {
      const label = p.provider === 'ge_proton' ? 'GE-Proton' : 'Proton-CachyOS'
      toast.message(`${label}: auto update — newer build available`, {
        description: p.remoteTag,
        action: {
          label: 'Open compat tools',
          onClick: () => navigate('/compat-tools'),
        },
      })
    })
  }, [navigate])

  useEffect(() => {
    void api.getAboutInfo().then((i) => setAppVersion(i.version))
  }, [])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="flex flex-col w-52 shrink-0 border-r border-border bg-card">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              <FolderSymlink className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold leading-none">SteamTools</p>
                {IS_SIM && (
                  <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase leading-none bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    SIM
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-none mt-0.5">CachyOS</p>
              <p
                className="text-[10px] font-mono text-muted-foreground/80 tabular-nums mt-1.5"
                title="App version"
              >
                {appVersion ? `v${appVersion}` : 'v…'}
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom settings */}
        <div className="px-2 pb-3 border-t border-border pt-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )
            }
          >
            <SettingsIcon className="h-4 w-4 shrink-0" />
            Settings
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top banners */}
        {(IS_SIM || true) && (
          <div className="flex flex-col gap-2 px-4 pt-3">
            {IS_SIM && <SimBanner />}
            <UpdateBanner />
          </div>
        )}

        {/* Route content */}
        <main className="flex-1 min-h-0 overflow-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/symlink" element={<SymlinkHub />} />
            <Route path="/fsr" element={<FsrDll />} />
            <Route path="/launch-options" element={<LaunchOptions />} />
            <Route path="/proton-user-settings" element={<ProtonUserSettings />} />
            <Route path="/compat-tools" element={<CompatTools />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      <Toaster
        position="bottom-right"
        theme="dark"
        richColors
        toastOptions={{
          classNames: {
            toast: 'border border-border',
          },
        }}
      />
    </div>
  )
}
