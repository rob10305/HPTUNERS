"""
HP Tuners AI Tune Advisor — Windows Installer
Self-contained setup.exe built with PyInstaller.
Installs per-user (no elevation required).
"""

import os
import shutil
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import messagebox

APP_NAME       = "HP Tuners AI Tune Advisor"
APP_EXE        = "HPTunersAIAdvisor.exe"
APP_VERSION    = "1.0.0"
PUBLISHER      = "HP Tuners AI Advisor"
INSTALL_SUBDIR = "HPTunersAIAdvisor"

# Source exe is bundled alongside this installer by PyInstaller
def _bundled_exe() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(sys._MEIPASS)
    else:
        base = Path(__file__).parent
    return base / APP_EXE


def _default_install_dir() -> Path:
    local_appdata = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    return local_appdata / "Programs" / INSTALL_SUBDIR


def _start_menu_dir() -> Path:
    appdata = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    return appdata / "Microsoft" / "Windows" / "Start Menu" / "Programs" / APP_NAME


def create_shortcut(target: str, shortcut_path: str, description: str = "", icon: str = "") -> bool:
    """Create a Windows .lnk shortcut via PowerShell — no pywin32 needed."""
    ps = f"""
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('{shortcut_path}')
$s.TargetPath = '{target}'
$s.Description = '{description}'
$s.IconLocation = '{icon if icon else target}'
$s.Save()
"""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
            capture_output=True, timeout=15
        )
        return result.returncode == 0
    except Exception:
        return False


def add_uninstall_registry(install_dir: Path) -> None:
    """Add entry to Windows Apps & Features (per-user registry, no elevation)."""
    uninstall_cmd = f'"{install_dir / APP_EXE}" --uninstall'
    ps = f"""
$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{INSTALL_SUBDIR}'
New-Item -Path $path -Force | Out-Null
Set-ItemProperty -Path $path -Name 'DisplayName'       -Value '{APP_NAME}'
Set-ItemProperty -Path $path -Name 'DisplayVersion'    -Value '{APP_VERSION}'
Set-ItemProperty -Path $path -Name 'Publisher'         -Value '{PUBLISHER}'
Set-ItemProperty -Path $path -Name 'InstallLocation'   -Value '{install_dir}'
Set-ItemProperty -Path $path -Name 'UninstallString'   -Value '{uninstall_cmd}'
Set-ItemProperty -Path $path -Name 'NoModify'          -Value 1 -Type DWord
Set-ItemProperty -Path $path -Name 'NoRepair'          -Value 1 -Type DWord
"""
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                   capture_output=True, timeout=15)


def remove_uninstall_registry() -> None:
    ps = f"Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{INSTALL_SUBDIR}' -Force -ErrorAction SilentlyContinue"
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                   capture_output=True, timeout=10)


# ── Uninstall mode ─────────────────────────────────────────────────────────────

def run_uninstall():
    install_dir = _default_install_dir()
    if not install_dir.exists():
        messagebox.showinfo("Uninstall", f"{APP_NAME} does not appear to be installed.")
        return

    root = tk.Tk(); root.withdraw()
    if not messagebox.askyesno("Uninstall", f"Remove {APP_NAME} from your computer?"):
        return

    # Remove start menu
    sm = _start_menu_dir()
    if sm.exists():
        shutil.rmtree(sm, ignore_errors=True)

    # Remove desktop shortcut
    desktop = Path(os.environ.get("USERPROFILE", Path.home())) / "Desktop" / f"{APP_NAME}.lnk"
    desktop.unlink(missing_ok=True)

    # Remove registry entry
    remove_uninstall_registry()

    # Remove install directory (schedule via cmd if exe is running)
    bat = install_dir / "_uninstall.bat"
    bat.write_text(
        f'@echo off\n'
        f'timeout /t 2 /nobreak >nul\n'
        f'rd /s /q "{install_dir}"\n'
        f'del "%~f0"\n'
    )
    subprocess.Popen(["cmd", "/c", str(bat)], creationflags=0x08000000)
    messagebox.showinfo("Uninstall complete", f"{APP_NAME} has been removed.")
    sys.exit(0)


# ── Installer GUI ──────────────────────────────────────────────────────────────

class InstallerApp:
    def __init__(self):
        self.install_dir = _default_install_dir()
        self.add_desktop  = tk.BooleanVar(value=False)

        self.root = tk.Tk()
        self.root.title(f"{APP_NAME} Setup")
        self.root.resizable(False, False)
        self.root.configure(bg="#1e1e2e")
        self._build()
        self.root.geometry("480x340")
        self.root.eval("tk::PlaceWindow . center")

    def _build(self):
        r = self.root

        # Header
        hdr = tk.Frame(r, bg="#181825", pady=14)
        hdr.pack(fill="x")
        tk.Label(hdr, text=f"🔧  {APP_NAME}",
                 font=("Segoe UI", 14, "bold"),
                 bg="#181825", fg="#cdd6f4").pack(side="left", padx=16)
        tk.Label(hdr, text=f"v{APP_VERSION}",
                 font=("Segoe UI", 10),
                 bg="#181825", fg="#6c7086").pack(side="right", padx=16)
        tk.Frame(r, bg="#313244", height=1).pack(fill="x")

        body = tk.Frame(r, bg="#1e1e2e", padx=20, pady=16)
        body.pack(fill="both", expand=True)

        tk.Label(body, text="Install location:",
                 font=("Segoe UI", 9, "bold"),
                 bg="#1e1e2e", fg="#a6adc8").pack(anchor="w")

        self.dir_var = tk.StringVar(value=str(self.install_dir))
        tk.Entry(body, textvariable=self.dir_var,
                 font=("Segoe UI", 9),
                 bg="#313244", fg="#cdd6f4",
                 insertbackground="#cdd6f4",
                 relief="flat", bd=4, width=52).pack(fill="x", pady=(4, 14))

        tk.Checkbutton(body,
                       text="Create desktop shortcut",
                       variable=self.add_desktop,
                       bg="#1e1e2e", fg="#cdd6f4",
                       selectcolor="#313244",
                       activebackground="#1e1e2e",
                       font=("Segoe UI", 9)).pack(anchor="w")

        tk.Label(body,
                 text="Installs for current user only — no administrator rights required.",
                 font=("Segoe UI", 8, "italic"),
                 bg="#1e1e2e", fg="#6c7086",
                 wraplength=420, justify="left").pack(anchor="w", pady=(10, 0))

        # Progress
        self.status_var = tk.StringVar(value="Ready to install.")
        tk.Label(body, textvariable=self.status_var,
                 font=("Segoe UI", 9),
                 bg="#1e1e2e", fg="#cdd6f4",
                 wraplength=420, justify="left").pack(anchor="w", pady=(14, 0))

        # Buttons
        tk.Frame(r, bg="#313244", height=1).pack(fill="x")
        btns = tk.Frame(r, bg="#1e1e2e", padx=20, pady=12)
        btns.pack(fill="x")

        self.install_btn = tk.Button(
            btns, text="Install",
            command=self._do_install,
            bg="#89b4fa", fg="#1e1e2e",
            activebackground="#74c7ec",
            font=("Segoe UI", 10, "bold"),
            relief="flat", padx=18, pady=6, cursor="hand2"
        )
        self.install_btn.pack(side="left")

        tk.Button(btns, text="Cancel",
                  command=self.root.quit,
                  bg="#313244", fg="#cdd6f4",
                  activebackground="#45475a",
                  font=("Segoe UI", 10),
                  relief="flat", padx=14, pady=6, cursor="hand2"
                  ).pack(side="left", padx=(10, 0))

    def _set_status(self, msg: str):
        self.status_var.set(msg)
        self.root.update_idletasks()

    def _do_install(self):
        self.install_btn.config(state="disabled")
        install_dir = Path(self.dir_var.get().strip())

        src = _bundled_exe()
        if not src.exists():
            messagebox.showerror("Error", f"Bundled executable not found:\n{src}")
            self.install_btn.config(state="normal")
            return

        try:
            # 1. Create install directory
            self._set_status("Creating install directory…")
            install_dir.mkdir(parents=True, exist_ok=True)

            # 2. Copy exe
            self._set_status("Copying application files…")
            dest_exe = install_dir / APP_EXE
            shutil.copy2(src, dest_exe)

            # 3. Start Menu shortcut
            self._set_status("Creating Start Menu shortcut…")
            sm_dir = _start_menu_dir()
            sm_dir.mkdir(parents=True, exist_ok=True)
            create_shortcut(
                target=str(dest_exe),
                shortcut_path=str(sm_dir / f"{APP_NAME}.lnk"),
                description=f"Analyse HP Tuners calibration files with AI",
                icon=str(dest_exe),
            )

            # 4. Desktop shortcut (optional)
            if self.add_desktop.get():
                self._set_status("Creating desktop shortcut…")
                desktop = Path(os.environ.get("USERPROFILE", Path.home())) / "Desktop"
                create_shortcut(
                    target=str(dest_exe),
                    shortcut_path=str(desktop / f"{APP_NAME}.lnk"),
                    icon=str(dest_exe),
                )

            # 5. Registry entry (Apps & Features)
            self._set_status("Registering with Windows…")
            add_uninstall_registry(install_dir)

            self._set_status(f"Installation complete!")
            if messagebox.askyesno(
                "Installation complete",
                f"{APP_NAME} has been installed to:\n{install_dir}\n\n"
                "Launch the app now?"
            ):
                subprocess.Popen([str(dest_exe)], creationflags=0x08000000)

            self.root.quit()

        except Exception as exc:
            self._set_status(f"Error: {exc}")
            messagebox.showerror("Installation failed", str(exc))
            self.install_btn.config(state="normal")

    def run(self):
        self.root.mainloop()


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--uninstall" in sys.argv:
        root = tk.Tk(); root.withdraw()
        run_uninstall()
    else:
        InstallerApp().run()
