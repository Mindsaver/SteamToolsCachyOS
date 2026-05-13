import { app, BrowserWindow, Menu, nativeImage, shell } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { initUpdater, checkForUpdates } from './services/updater'
import { loadSettings } from './services/settings'
import { runCompatToolsAutoCheck } from './services/steam/compatToolsAuto'
import { ensureDesktopEntry } from './services/desktopEntry'
import { IPC } from '../shared/ipc-channels'

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 740,
    minWidth: 900,
    minHeight: 560,
    title: 'SteamToolsCachyOS',
    backgroundColor: '#0f1117',
    icon: getIconPath(),
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload with contextBridge
    },
  })

  // Load app
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Intercept external links
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

function getIconPath(): string {
  // Try assets/ in repo root relative to app/
  const candidates = [
    path.join(__dirname, '../../resources/icons/256x256.png'),
    path.join(__dirname, '../../../assets/symlink-steam-logo.png'),
  ]
  for (const c of candidates) {
    try {
      const img = nativeImage.createFromPath(c)
      if (!img.isEmpty()) return c
    } catch {
      // skip
    }
  }
  return ''
}

function buildMenu(win: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for updates…',
          click: () => {
            checkForUpdates()
          },
        },
        { type: 'separator' },
        {
          label: 'Open GitHub',
          click: () => shell.openExternal('https://github.com/Mindsaver/SteamToolsCachyOS'),
        },
        { type: 'separator' },
        {
          label: 'About SteamToolsCachyOS',
          click: () => {
            win.webContents.send(IPC.ABOUT_SHOW)
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  mainWindow = createWindow()
  registerIpcHandlers(mainWindow)
  initUpdater(mainWindow)
  buildMenu(mainWindow)

  // Portable AppImage desktop entry
  ensureDesktopEntry(process.env.APPIMAGE, getIconPath())

  // Auto-update check (respects settings)
  const settings = loadSettings()
  if (settings.autoUpdate) {
    setTimeout(() => checkForUpdates(), 3000)
  }
  setTimeout(() => {
    void runCompatToolsAutoCheck(mainWindow)
  }, 5000)

  // Re-run compat GitHub checks while the app stays open (same cadence as before; checks are no longer epoch-throttled).
  const compatPollMs = 30 * 60 * 1000
  setInterval(() => {
    const win = mainWindow
    if (win && !win.isDestroyed()) void runCompatToolsAutoCheck(win)
  }, compatPollMs)

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
