import fs from 'fs'
import path from 'path'
import os from 'os'

// Writes/updates the .desktop file when running as a portable AppImage.
// electron-builder handles this for installed packages, but the AppImage
// users may run it in-place and need the menu entry registered.

export function ensureDesktopEntry(appImagePath: string | undefined, iconPath: string): void {
  if (!appImagePath) return

  const applicationsDir = path.join(
    os.homedir(),
    '.local',
    'share',
    'applications'
  )
  fs.mkdirSync(applicationsDir, { recursive: true })

  const desktopPath = path.join(applicationsDir, 'SteamToolsCachyOS.desktop')
  const content = `[Desktop Entry]
Type=Application
Version=1.0
Name=SteamToolsCachyOS
GenericName=Steam Toolkit
Comment=Steam symlink hub, FSR DLL helper, and launch options manager
Exec="${appImagePath}" %U
Icon=${iconPath}
Terminal=false
Categories=Utility;Game;
Keywords=Steam;CachyOS;FSR;Proton;Gaming;
StartupNotify=true
`
  fs.writeFileSync(desktopPath, content, 'utf-8')
}
