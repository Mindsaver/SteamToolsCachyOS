// All IPC channel names as constants — used in main, preload, and renderer

export const IPC = {
  // Steam info
  STEAM_GET_INFO: 'steam:get-info',
  STEAM_IS_RUNNING: 'steam:is-running',
  STEAM_CLOSE: 'steam:close',
  STEAM_LIST_ACCOUNTS: 'steam:list-accounts',
  STEAM_GET_GLOBAL_ENV: 'steam:get-global-env',
  STEAM_PROTON_USER_SETTINGS_GET: 'steam:proton-user-settings-get',
  STEAM_PROTON_USER_SETTINGS_SAVE: 'steam:proton-user-settings-save',
  STEAM_PROTON_USER_SETTINGS_CREATE: 'steam:proton-user-settings-create',
  STEAM_PROTON_USER_SETTINGS_LIST_BACKUPS: 'steam:proton-user-settings-list-backups',
  STEAM_PROTON_USER_SETTINGS_READ_BACKUP: 'steam:proton-user-settings-read-backup',
  STEAM_PROTON_USER_SETTINGS_SAVE_NAMED_BACKUP: 'steam:proton-user-settings-save-named-backup',

  // Games
  GAMES_LIST: 'games:list',
  GAMES_GET_LAUNCH_OPTIONS: 'games:get-launch-options',
  GAMES_SET_LAUNCH_OPTIONS: 'games:set-launch-options',
  GAMES_BATCH_TRANSFORM_PREVIEW: 'games:batch-transform-preview',
  GAMES_BATCH_TRANSFORM_APPLY: 'games:batch-transform-apply',

  // Symlink hub
  SYMLINK_RUN: 'symlink:run',
  SYMLINK_PROGRESS: 'symlink:progress',

  // FSR DLL
  FSR_ANALYZE_DLL: 'fsr:analyze-dll',
  FSR_COPY_DLL: 'fsr:copy-dll',
  FSR_PROGRESS: 'fsr:progress',
  FSR_RUNTIME_STATUS: 'fsr:runtime-status',
  FSR_RUNTIME_SYNC_TO_MANGOHUD: 'fsr:runtime-sync-to-mangohud',

  // GPU
  GPU_DETECT: 'gpu:detect',

  // Compat tool context
  COMPAT_GET: 'compat:get',
  COMPAT_SNAPSHOT: 'compat:snapshot',

  // Localconfig
  LOCALCONFIG_RESTORE_BACKUP: 'localconfig:restore-backup',
  LOCALCONFIG_OPEN_FOLDER: 'localconfig:open-folder',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // About / app metadata (Help menu)
  APP_GET_ABOUT: 'app:get-about',
  ABOUT_SHOW: 'about:show',

  // Updates
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_NOT_AVAILABLE: 'update:not-available',
  UPDATE_ERROR: 'update:error',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_INSTALL_STARTED: 'update:install-started',

  // File dialogs
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_OPEN_DIR: 'dialog:open-dir',
  SHELL_OPEN_PATH: 'shell:open-path',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',

  // Compatibility tools (GE-Proton / Proton-CachyOS)
  COMPAT_TOOLS_LIST_INSTALLED: 'compat-tools:list-installed',
  COMPAT_TOOLS_LIST_RELEASES: 'compat-tools:list-releases',
  COMPAT_TOOLS_INSTALL: 'compat-tools:install',
  COMPAT_TOOLS_CHECK_UPDATE: 'compat-tools:check-update',
  COMPAT_TOOLS_PROGRESS: 'compat-tools:progress',
  COMPAT_TOOLS_UPDATE_AVAILABLE: 'compat-tools:update-available',
  COMPAT_TOOLS_OPEN_USER_SETTINGS: 'compat-tools:open-user-settings',

  // MangoHud system config
  MANGOHUD_STATUS: 'mangohud:status',
  MANGOHUD_CONFIG_GET: 'mangohud:config-get',
  MANGOHUD_CONFIG_SAVE: 'mangohud:config-save',
  MANGOHUD_RELOAD: 'mangohud:reload',
  MANGOHUD_BACKUPS_LIST: 'mangohud:backups-list',
  MANGOHUD_BACKUPS_READ: 'mangohud:backups-read',
  MANGOHUD_BACKUPS_RESTORE: 'mangohud:backups-restore',
  MANGOHUD_PROFILES_LIST: 'mangohud:profiles-list',
  MANGOHUD_PROFILES_SAVE: 'mangohud:profiles-save',
  MANGOHUD_PROFILES_DELETE: 'mangohud:profiles-delete',
  MANGOHUD_PROFILES_ASSIGN: 'mangohud:profiles-assign',
  MANGOHUD_PROFILES_RESOLVE_FOR_APP: 'mangohud:profiles-resolve-for-app',
  MANGOHUD_PROFILES_SAVE_SETTINGS: 'mangohud:profiles-save-settings',

  // Mongo HUD editor
  MONGO_HUD_CONNECTIONS_LIST: 'mongo-hud:connections-list',
  MONGO_HUD_CONNECTIONS_SAVE: 'mongo-hud:connections-save',
  MONGO_HUD_CONNECTIONS_DELETE: 'mongo-hud:connections-delete',
  MONGO_HUD_CONNECTIONS_TEST: 'mongo-hud:connections-test',
  MONGO_HUD_DOCS_LIST: 'mongo-hud:docs-list',
  MONGO_HUD_DOCS_GET: 'mongo-hud:docs-get',
  MONGO_HUD_DOCS_SAVE: 'mongo-hud:docs-save',
  MONGO_HUD_DOCS_DELETE: 'mongo-hud:docs-delete',
  MONGO_HUD_DOCS_EXPORT: 'mongo-hud:docs-export',
  MONGO_HUD_DOCS_IMPORT: 'mongo-hud:docs-import',
  MONGO_HUD_VERSIONS_LIST: 'mongo-hud:versions-list',
  MONGO_HUD_VERSIONS_CREATE: 'mongo-hud:versions-create',
  MONGO_HUD_VERSIONS_RESTORE: 'mongo-hud:versions-restore',
  MONGO_HUD_PREVIEW_QUERY: 'mongo-hud:preview-query',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
