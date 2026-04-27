import type {
  InstalledGame,
  GpuInfo,
  DllVersionInfo,
  AppSettings,
  CompatToolInfo,
  SymlinkProgress,
} from '../../../shared/types'

export const MOCK_STEAM_INFO = {
  installPath: '/home/arch/.local/share/Steam',
  libraries: [
    '/home/arch/.local/share/Steam',
    '/mnt/games/SteamLibrary',
    '/mnt/ssd/Steam',
  ],
  userDataPath: '/home/arch/.local/share/Steam/userdata',
  accounts: ['123456789', '987654321'],
}

export const MOCK_GAMES: InstalledGame[] = [
  {
    appId: 1091500,
    name: 'Cyberpunk 2077',
    installDir: 'Cyberpunk 2077',
    installPath: '/mnt/games/SteamLibrary/steamapps/common/Cyberpunk 2077',
    libraryPath: '/mnt/games/SteamLibrary',
    compatDataPath: '/mnt/games/SteamLibrary/steamapps/compatdata/1091500',
    system32Path: '/mnt/games/SteamLibrary/steamapps/compatdata/1091500/pfx/drive_c/windows/system32',
    launchOptions: 'mangohud gamemode %command%',
  },
  {
    appId: 1245620,
    name: 'Elden Ring',
    installDir: 'ELDEN RING',
    installPath: '/mnt/games/SteamLibrary/steamapps/common/ELDEN RING',
    libraryPath: '/mnt/games/SteamLibrary',
    compatDataPath: '/mnt/games/SteamLibrary/steamapps/compatdata/1245620',
    system32Path: '/mnt/games/SteamLibrary/steamapps/compatdata/1245620/pfx/drive_c/windows/system32',
    launchOptions: 'PROTON_LOG=1 mangohud %command%',
  },
  {
    appId: 292030,
    name: 'The Witcher 3: Wild Hunt',
    installDir: 'The Witcher 3',
    installPath: '/home/arch/.local/share/Steam/steamapps/common/The Witcher 3',
    libraryPath: '/home/arch/.local/share/Steam',
    compatDataPath: '/home/arch/.local/share/Steam/steamapps/compatdata/292030',
    system32Path: '/home/arch/.local/share/Steam/steamapps/compatdata/292030/pfx/drive_c/windows/system32',
    launchOptions: 'mangohud %command%',
  },
  {
    appId: 1623730,
    name: 'Palworld',
    installDir: 'Palworld',
    installPath: '/mnt/ssd/Steam/steamapps/common/Palworld',
    libraryPath: '/mnt/ssd/Steam',
    compatDataPath: '/mnt/ssd/Steam/steamapps/compatdata/1623730',
    system32Path: '/mnt/ssd/Steam/steamapps/compatdata/1623730/pfx/drive_c/windows/system32',
    launchOptions: '',
  },
  {
    appId: 1174180,
    name: 'Red Dead Redemption 2',
    installDir: 'Red Dead Redemption 2',
    installPath: '/mnt/games/SteamLibrary/steamapps/common/Red Dead Redemption 2',
    libraryPath: '/mnt/games/SteamLibrary',
    compatDataPath: '/mnt/games/SteamLibrary/steamapps/compatdata/1174180',
    system32Path: '/mnt/games/SteamLibrary/steamapps/compatdata/1174180/pfx/drive_c/windows/system32',
    launchOptions: 'WINE_FULLSCREEN_FSR=1 mangohud %command%',
  },
  {
    appId: 1716740,
    name: 'DAVE THE DIVER',
    installDir: 'DAVE THE DIVER',
    installPath: '/home/arch/.local/share/Steam/steamapps/common/DAVE THE DIVER',
    libraryPath: '/home/arch/.local/share/Steam',
    compatDataPath: null,
    system32Path: null,
    launchOptions: '',
  },
  {
    appId: 2050650,
    name: 'Resident Evil 4',
    installDir: 'RESIDENT EVIL 4  BIOHAZARD RE4',
    installPath: '/mnt/ssd/Steam/steamapps/common/RESIDENT EVIL 4  BIOHAZARD RE4',
    libraryPath: '/mnt/ssd/Steam',
    compatDataPath: '/mnt/ssd/Steam/steamapps/compatdata/2050650',
    system32Path: '/mnt/ssd/Steam/steamapps/compatdata/2050650/pfx/drive_c/windows/system32',
    launchOptions: 'gamemode %command%',
  },
  {
    appId: 271590,
    name: 'Grand Theft Auto V',
    installDir: 'Grand Theft Auto V',
    installPath: '/mnt/games/SteamLibrary/steamapps/common/Grand Theft Auto V',
    libraryPath: '/mnt/games/SteamLibrary',
    compatDataPath: '/mnt/games/SteamLibrary/steamapps/compatdata/271590',
    system32Path: '/mnt/games/SteamLibrary/steamapps/compatdata/271590/pfx/drive_c/windows/system32',
    launchOptions: 'PROTON_USE_WINED3D=1 %command%',
  },
  {
    appId: 1086940,
    name: "Baldur's Gate 3",
    installDir: 'Baldurs Gate 3',
    installPath: '/mnt/ssd/Steam/steamapps/common/Baldurs Gate 3',
    libraryPath: '/mnt/ssd/Steam',
    compatDataPath: '/mnt/ssd/Steam/steamapps/compatdata/1086940',
    system32Path: '/mnt/ssd/Steam/steamapps/compatdata/1086940/pfx/drive_c/windows/system32',
    launchOptions: 'mangohud gamemode %command%',
  },
  {
    appId: 1888160,
    name: 'Among Us',
    installDir: 'Among Us',
    installPath: '/home/arch/.local/share/Steam/steamapps/common/Among Us',
    libraryPath: '/home/arch/.local/share/Steam',
    compatDataPath: null,
    system32Path: null,
    launchOptions: '',
  },
  {
    appId: 730,
    name: 'Counter-Strike 2',
    installDir: 'Counter-Strike Global Offensive',
    installPath: '/home/arch/.local/share/Steam/steamapps/common/Counter-Strike Global Offensive',
    libraryPath: '/home/arch/.local/share/Steam',
    compatDataPath: null,
    system32Path: null,
    launchOptions: '-novid +fps_max 0',
  },
  {
    appId: 570,
    name: 'Dota 2',
    installDir: 'dota 2 beta',
    installPath: '/home/arch/.local/share/Steam/steamapps/common/dota 2 beta',
    libraryPath: '/home/arch/.local/share/Steam',
    compatDataPath: null,
    system32Path: null,
    launchOptions: 'mangohud %command% -high',
  },
  {
    appId: 1938090,
    name: 'Call of Duty',
    installDir: 'Call of Duty',
    installPath: '/mnt/ssd/Steam/steamapps/common/Call of Duty',
    libraryPath: '/mnt/ssd/Steam',
    compatDataPath: '/mnt/ssd/Steam/steamapps/compatdata/1938090',
    system32Path: '/mnt/ssd/Steam/steamapps/compatdata/1938090/pfx/drive_c/windows/system32',
    launchOptions: '',
  },
  {
    appId: 2144740,
    name: 'Hogwarts Legacy',
    installDir: 'Hogwarts Legacy',
    installPath: '/mnt/games/SteamLibrary/steamapps/common/Hogwarts Legacy',
    libraryPath: '/mnt/games/SteamLibrary',
    compatDataPath: '/mnt/games/SteamLibrary/steamapps/compatdata/2144740',
    system32Path: '/mnt/games/SteamLibrary/steamapps/compatdata/2144740/pfx/drive_c/windows/system32',
    launchOptions: 'WINE_FULLSCREEN_FSR=1 gamemode mangohud %command%',
  },
  {
    appId: 304930,
    name: 'Unturned',
    installDir: 'Unturned',
    installPath: '/home/arch/.local/share/Steam/steamapps/common/Unturned',
    libraryPath: '/home/arch/.local/share/Steam',
    compatDataPath: null,
    system32Path: null,
    launchOptions: '',
  },
]

export const MOCK_GPU_INFO: GpuInfo = {
  vendors: ['amd'],
  hasAmd: true,
  hasNvidia: false,
  hasIntel: false,
  primaryVendor: 'amd',
}

export const MOCK_DLL_INFO: DllVersionInfo = {
  filePath: '/home/arch/Downloads/amdxcffx64.dll',
  fsr: '4.1.0',
  ml: '1.2.0',
  framegen: '1.0.3',
  roles: ['FSR (upscaling)', 'ML Frame Interpolation', 'Frame Generation'],
  rawVersions: ['4.1.0', '1.2.0', '1.0.3', '2.0.1'],
}

export const MOCK_SETTINGS: AppSettings = {
  steamPath: null,
  hubRoot: null,
  gameFilter: 'heuristic',
  autoUpdate: true,
  autoUpdateThrottleHours: 1,
  theme: 'dark',
  geProtonChannel: 'pinned',
  geProtonAutoUpdate: false,
  geProtonAutoUpdateInternalName: null,
  geProtonPinnedTag: null,
  protonCachyosChannel: 'pinned',
  protonCachyosAutoUpdate: false,
  protonCachyosAutoUpdateInternalName: null,
  protonCachyosPinnedTag: null,
  protonCachyosSlrOnly: true,
  protonCachyosArch: 'x86_64',
  compatToolsCheckThrottleHours: 24,
  compatToolsSilentAutoInstall: false,
  compatGeLastCheckEpoch: 0,
  compatGeLastRemoteTag: null,
  compatCachyosLastCheckEpoch: 0,
  compatCachyosLastRemoteTag: null,
}

/** Simulated Steam Play default (CompatToolMapping "0"). */
export const MOCK_STEAM_PLAY_DEFAULT = {
  toolName: 'proton_experimental' as string | null,
  toolDescription: 'Proton Experimental' as string | null,
}

const SD = MOCK_STEAM_PLAY_DEFAULT

export const MOCK_COMPAT_INFO: Record<number, CompatToolInfo> = {
  1091500: {
    toolName: 'proton_experimental',
    toolDescription: 'Proton Experimental',
    sourceLabel: 'Steam default',
    selectionKind: 'steam_default',
    steamDefaultToolName: SD.toolName,
    steamDefaultDescription: SD.toolDescription,
  },
  1245620: {
    toolName: 'proton_90',
    toolDescription: 'Proton 9.0',
    sourceLabel: 'Per-game override',
    selectionKind: 'override',
    steamDefaultToolName: SD.toolName,
    steamDefaultDescription: SD.toolDescription,
  },
  292030: {
    toolName: 'proton_90',
    toolDescription: 'Proton 9.0',
    sourceLabel: 'Per-game override',
    selectionKind: 'override',
    steamDefaultToolName: SD.toolName,
    steamDefaultDescription: SD.toolDescription,
  },
  1623730: {
    toolName: null,
    toolDescription: 'Steam Linux native',
    sourceLabel: 'Linux native (per-game)',
    selectionKind: 'native',
    steamDefaultToolName: SD.toolName,
    steamDefaultDescription: SD.toolDescription,
  },
  1174180: {
    toolName: 'proton_experimental',
    toolDescription: 'Proton Experimental',
    sourceLabel: 'Steam default',
    selectionKind: 'steam_default',
    steamDefaultToolName: SD.toolName,
    steamDefaultDescription: SD.toolDescription,
  },
  2050650: {
    toolName: 'proton_90',
    toolDescription: 'Proton 9.0',
    sourceLabel: 'Per-game override',
    selectionKind: 'override',
    steamDefaultToolName: SD.toolName,
    steamDefaultDescription: SD.toolDescription,
  },
  271590: {
    toolName: 'proton_hotfix',
    toolDescription: 'Proton Hotfix',
    sourceLabel: 'Per-game override',
    selectionKind: 'override',
    steamDefaultToolName: SD.toolName,
    steamDefaultDescription: SD.toolDescription,
  },
  1086940: {
    toolName: 'proton_experimental',
    toolDescription: 'Proton Experimental',
    sourceLabel: 'Steam default',
    selectionKind: 'steam_default',
    steamDefaultToolName: SD.toolName,
    steamDefaultDescription: SD.toolDescription,
  },
  1938090: {
    toolName: 'proton_experimental',
    toolDescription: 'Proton Experimental',
    sourceLabel: 'Steam default',
    selectionKind: 'steam_default',
    steamDefaultToolName: SD.toolName,
    steamDefaultDescription: SD.toolDescription,
  },
  2144740: {
    toolName: 'proton_90',
    toolDescription: 'Proton 9.0',
    sourceLabel: 'Per-game override',
    selectionKind: 'override',
    steamDefaultToolName: SD.toolName,
    steamDefaultDescription: SD.toolDescription,
  },
}

/** Simulate a streamed symlink-hub run, calling cb once per tick. */
export async function simulateSymlinkStream(
  cb: (p: SymlinkProgress) => void,
  dryRun: boolean
): Promise<void> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const emit = async (p: SymlinkProgress, ms = 60) => { cb(p); await delay(ms) }

  await emit({ type: 'log', message: `Hub root: /home/arch/SteamToolsCachyOS (mode=folders, filter=heuristic)${dryRun ? ' [DRY RUN]' : ''}` }, 80)
  await emit({ type: 'log', message: 'Libraries: /home/arch/.local/share/Steam, /mnt/games/SteamLibrary, /mnt/ssd/Steam' }, 80)
  await emit({ type: 'log', message: `Found ${MOCK_GAMES.length} games` }, 120)

  for (let i = 0; i < MOCK_GAMES.length; i++) {
    await emit({
      type: 'progress',
      message: `[${i + 1}/${MOCK_GAMES.length}] ${MOCK_GAMES[i].name}`,
      current: i + 1,
      total: MOCK_GAMES.length,
    }, 80)
  }

  await emit({ type: 'done', message: `Done — ${MOCK_GAMES.length} games processed (mode=folders, filter=heuristic)`, exitCode: 0 }, 0)
}

/** Simulate a streamed FSR DLL copy. */
export async function simulateFsrStream(cb: (p: SymlinkProgress) => void): Promise<void> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const targets = MOCK_GAMES.filter((g) => g.system32Path)
  cb({ type: 'log', message: `Copying DLL to ${targets.length} game prefixes…` })
  await delay(100)
  for (let i = 0; i < targets.length; i++) {
    cb({ type: 'progress', message: `[${i + 1}/${targets.length}] ${targets[i].name}`, current: i + 1, total: targets.length })
    await delay(70)
  }
  cb({ type: 'done', message: `DLL copy done (${targets.length} targets).`, exitCode: 0 })
}
