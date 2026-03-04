# PyInstaller spec for the installer executable.
# Bundles HPTunersAIAdvisor.exe inside the setup exe.
# Build: pyinstaller installer_builder/setup.spec --distpath installer_output --workpath build_output/installer --noconfirm

import os as _os
_companion = _os.path.abspath(_os.path.join(SPECPATH, '..'))

block_cipher = None

a = Analysis(
    [_os.path.join(SPECPATH, 'setup.py')],
    pathex=[_companion],
    binaries=[],
    datas=[
        (_os.path.join(_companion, 'dist', 'HPTunersAIAdvisor.exe'), '.'),
        (_os.path.join(_companion, 'assets', 'icon.ico'), '.'),
    ],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
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
    name=f'HPTunersAIAdvisor_Setup_v1.0.0',
    debug=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    icon=_os.path.join(_companion, 'assets', 'icon.ico'),
    onefile=True,
)
