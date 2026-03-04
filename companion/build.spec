# PyInstaller build spec for HP Tuners AI Tune Advisor companion app.
# Build: pyinstaller build.spec

block_cipher = None

a = Analysis(
    ['companion.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('parsers/',        'parsers/'),
        ('os_offsets.json', '.'),
        ('assets/',         'assets/'),
    ],
    hiddenimports=[
        'tkinterdnd2',
        'parsers.hpt_parser',
        'parsers.bin_parser',
        'parsers.hpl_parser',
        'consent_dialog',
        'uploader',
        'tune_writer',
        'settings_window',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='HPTunersAIAdvisor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,       # No console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico',
    onefile=True,        # Single .exe
)
