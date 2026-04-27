// All IPC channel names as constants — used in main, preload, and renderer

export const IPC = {
  // Steam info
  STEAM_GET_INFO: 'steam:get-info',
  STEAM_IS_RUNNING: 'steam:is-running',
  STEAM_CLOSE: 'steam:close',

  // Games
  GAMES_LIST: 'games:list',
  GAMES_GET_LAUNCH_OPTIONS: 'games:get-launch-options',
  GAMES_SET_LAUNCH_OPTIONS: 'games:set-launch-options',
  GAMES_BATCH_LAUNCH_OPTIONS: 'games:batch-launch-options',

  // Symlink hub
  SYMLINK_RUN: 'symlink:run',
  SYMLINK_PROGRESS: 'symlink:progress',

  // FSR DLL
  FSR_ANALYZE_DLL: 'fsr:analyze-dll',
  FSR_COPY_DLL: 'fsr:copy-dll',
  FSR_PROGRESS: 'fsr:progress',

  // GPU
  GPU_DETECT: 'gpu:detect',

  // Compat tool context
  COMPAT_GET: 'compat:get',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Updates
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_NOT_AVAILABLE: 'update:not-available',
  UPDATE_ERROR: 'update:error',
  UPDATE_DOWNLOADED: 'update:downloaded',

  // File dialogs
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_OPEN_DIR: 'dialog:open-dir',
  SHELL_OPEN_PATH: 'shell:open-path',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
