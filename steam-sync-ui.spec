# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['/home/mindsaver/Dev/projects/fsrpatch/scripts/steam-sync-ui.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('/home/mindsaver/Dev/projects/fsrpatch/scripts/steam-game-symlinks.sh', '.'),
        ('/home/mindsaver/Dev/projects/fsrpatch/assets/symlink-steam-logo.png', '.'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='steam-sync-ui',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
