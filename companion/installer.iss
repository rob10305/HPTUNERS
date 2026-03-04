; HP Tuners AI Tune Advisor — Inno Setup installer script
; Build: iscc installer.iss
; Output: installer_output\HPTunersAIAdvisor_Setup_v1.0.0.exe

#define AppName    "HP Tuners AI Tune Advisor"
#define AppVersion "1.0.0"
#define AppPublisher "HP Tuners AI Advisor"
#define AppURL     "https://hptuners.vercel.app"
#define AppExeName "HPTunersAIAdvisor.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\HPTunersAIAdvisor
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
LicenseFile=
; No licence file for MVP — remove this line if you add one
OutputDir=installer_output
OutputBaseFilename=HPTunersAIAdvisor_Setup_v{#AppVersion}
SetupIconFile=assets\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSmallImageFile=
; Require Windows 10 or later (build 17763+)
MinVersion=10.0.17763
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
; Allow per-user install without elevation
PrivilegesRequiredOverridesAllowed=commandline dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Main executable
Source: "dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion

; Icon for uninstaller / shortcuts
Source: "assets\icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Start Menu shortcut
Name: "{group}\{#AppName}";     Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

; Desktop shortcut (optional, unchecked by default)
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
; Offer to launch the app after install
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Remove settings file created at runtime
Type: files; Name: "{app}\settings.json"
