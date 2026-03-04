"""
HP Tuners AI Tune Advisor — Companion App
Windows desktop app. Opens .hpt/.bin/.hpl files, extracts calibration tables,
sends to the web app API, and opens the analysis in the browser.
"""

import json
import os
import sys
import threading
import webbrowser
from datetime import datetime
from pathlib import Path

import requests
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    HAS_DND = True
except ImportError:
    HAS_DND = False

from parsers.hpt_parser import parse_hpt
from parsers.bin_parser import parse_bin
from parsers.hpl_parser import parse_hpl

# ── Constants ──────────────────────────────────────────────────────────────────

APP_VERSION = "1.0.0"
APP_TITLE   = "HP Tuners AI Tune Advisor"

SETTINGS_PATH = Path(__file__).parent / "settings.json"
DEFAULT_SETTINGS = {
    "web_app_url":      "https://hptuners.vercel.app",
    "output_folder":    "",
    "auto_open_browser": True,
}

ACCEPTED_EXTENSIONS = {".hpt", ".bin", ".hpl"}

# ── Settings helpers ───────────────────────────────────────────────────────────

def load_settings() -> dict:
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH) as f:
                saved = json.load(f)
            merged = {**DEFAULT_SETTINGS, **saved}
            return merged
        except Exception:
            pass
    return dict(DEFAULT_SETTINGS)

def save_settings(settings: dict) -> None:
    with open(SETTINGS_PATH, "w") as f:
        json.dump(settings, f, indent=2)

# ── File type detection ────────────────────────────────────────────────────────

def detect_file_type(filepath: str) -> str:
    ext = Path(filepath).suffix.lower()
    if ext in (".hpt",):
        return "hpt"
    elif ext == ".bin":
        return "bin"
    elif ext in (".hpl", ".csv"):
        return "hpl"
    else:
        # Magic-byte sniff
        try:
            with open(filepath, "rb") as f:
                header = f.read(16)
            # HPT files often start with a known signature — extend as discovered
            if header[:4] == b"\x48\x50\x54\x00":  # 'HPT\0'
                return "hpt"
        except OSError:
            pass
        return "unknown"

# ── Main application ───────────────────────────────────────────────────────────

class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.settings = load_settings()
        self.loaded_file: str | None = None
        self.tune_data: dict | None = None
        self._build_ui()
        self._check_for_updates_async()

    # ── UI construction ────────────────────────────────────────────────────────

    def _build_ui(self):
        self.root.title(APP_TITLE)
        self.root.resizable(False, False)
        self.root.configure(bg="#1e1e2e")

        # Try to set icon
        icon_path = Path(__file__).parent / "assets" / "icon.ico"
        if icon_path.exists():
            try:
                self.root.iconbitmap(str(icon_path))
            except Exception:
                pass

        # ── Menu bar ──────────────────────────────────────────────────────────
        menubar = tk.Menu(self.root, bg="#2d2d44", fg="#cdd6f4",
                          activebackground="#3d3d5e", activeforeground="#cdd6f4",
                          bd=0)
        file_menu = tk.Menu(menubar, tearoff=0, bg="#2d2d44", fg="#cdd6f4",
                            activebackground="#3d3d5e", activeforeground="#cdd6f4")
        file_menu.add_command(label="Open file…", command=self._browse_file)
        file_menu.add_separator()
        file_menu.add_command(label="Settings…", command=self._open_settings)
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.root.quit)
        menubar.add_cascade(label="File", menu=file_menu)

        help_menu = tk.Menu(menubar, tearoff=0, bg="#2d2d44", fg="#cdd6f4",
                            activebackground="#3d3d5e", activeforeground="#cdd6f4")
        help_menu.add_command(label="About", command=self._show_about)
        help_menu.add_command(label="Check for updates", command=self._check_for_updates_manual)
        menubar.add_cascade(label="Help", menu=help_menu)
        self.root.config(menu=menubar)

        # ── Title bar ─────────────────────────────────────────────────────────
        title_frame = tk.Frame(self.root, bg="#181825", pady=10)
        title_frame.pack(fill="x")
        tk.Label(title_frame, text=f"🔧  {APP_TITLE}",
                 font=("Segoe UI", 14, "bold"),
                 bg="#181825", fg="#cdd6f4").pack(side="left", padx=16)

        # ── Drop zone ─────────────────────────────────────────────────────────
        drop_outer = tk.Frame(self.root, bg="#1e1e2e", pady=20, padx=20)
        drop_outer.pack(fill="x")

        self.drop_frame = tk.Frame(
            drop_outer,
            bg="#2d2d44",
            bd=2,
            relief="groove",
            width=460,
            height=130,
        )
        self.drop_frame.pack(fill="x")
        self.drop_frame.pack_propagate(False)

        # Inner labels
        center_frame = tk.Frame(self.drop_frame, bg="#2d2d44")
        center_frame.place(relx=0.5, rely=0.5, anchor="center")

        self.drop_icon_label = tk.Label(
            center_frame, text="📂",
            font=("Segoe UI Emoji", 28),
            bg="#2d2d44", fg="#89b4fa"
        )
        self.drop_icon_label.pack()

        self.drop_text_label = tk.Label(
            center_frame,
            text="Drag your .hpt, .bin or .hpl file here",
            font=("Segoe UI", 10),
            bg="#2d2d44", fg="#a6adc8"
        )
        self.drop_text_label.pack(pady=(4, 0))

        self.file_name_label = tk.Label(
            center_frame, text="",
            font=("Segoe UI", 9, "italic"),
            bg="#2d2d44", fg="#cba6f7"
        )
        self.file_name_label.pack()

        # Register drag-and-drop if available
        if HAS_DND:
            self.drop_frame.drop_target_register(DND_FILES)
            self.drop_frame.dnd_bind("<<Drop>>", self._on_drop)
        else:
            # Fallback: click-to-browse on the drop zone
            self.drop_frame.bind("<Button-1>", lambda e: self._browse_file())
            for widget in [self.drop_icon_label, self.drop_text_label]:
                widget.bind("<Button-1>", lambda e: self._browse_file())

        # ── Browse button ─────────────────────────────────────────────────────
        btn_frame = tk.Frame(self.root, bg="#1e1e2e", pady=4)
        btn_frame.pack()
        tk.Button(
            btn_frame, text="Browse for file…",
            command=self._browse_file,
            bg="#313244", fg="#cdd6f4",
            activebackground="#45475a", activeforeground="#cdd6f4",
            font=("Segoe UI", 9), relief="flat", padx=14, pady=5, cursor="hand2"
        ).pack()

        # ── Status bar ────────────────────────────────────────────────────────
        status_outer = tk.Frame(self.root, bg="#181825")
        status_outer.pack(fill="x")
        tk.Frame(status_outer, bg="#313244", height=1).pack(fill="x")
        status_inner = tk.Frame(status_outer, bg="#181825", pady=8, padx=16)
        status_inner.pack(fill="x")

        tk.Label(status_inner, text="Status:",
                 font=("Segoe UI", 9, "bold"),
                 bg="#181825", fg="#a6adc8").pack(side="left")
        self.status_var = tk.StringVar(value="Waiting for file…")
        self.status_label = tk.Label(
            status_inner, textvariable=self.status_var,
            font=("Segoe UI", 9),
            bg="#181825", fg="#cdd6f4",
            wraplength=380, justify="left"
        )
        self.status_label.pack(side="left", padx=6)

        # ── Action buttons ────────────────────────────────────────────────────
        action_frame = tk.Frame(self.root, bg="#1e1e2e", pady=14, padx=20)
        action_frame.pack(fill="x")

        self.upload_btn = tk.Button(
            action_frame, text="Upload & Analyse",
            command=self._start_upload_flow,
            state="disabled",
            bg="#89b4fa", fg="#1e1e2e",
            activebackground="#74c7ec", activeforeground="#1e1e2e",
            font=("Segoe UI", 10, "bold"), relief="flat",
            padx=18, pady=7, cursor="hand2", disabledforeground="#45475a"
        )
        self.upload_btn.pack(side="left")

        self.clear_btn = tk.Button(
            action_frame, text="Clear",
            command=self._clear,
            state="disabled",
            bg="#313244", fg="#cdd6f4",
            activebackground="#45475a", activeforeground="#cdd6f4",
            font=("Segoe UI", 10), relief="flat",
            padx=14, pady=7, cursor="hand2", disabledforeground="#45475a"
        )
        self.clear_btn.pack(side="left", padx=(10, 0))

        # ── Progress bar ──────────────────────────────────────────────────────
        self.progress_var = tk.DoubleVar(value=0)
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("HP.Horizontal.TProgressbar",
                        troughcolor="#313244", background="#89b4fa",
                        borderwidth=0, thickness=4)
        self.progress_bar = ttk.Progressbar(
            self.root, variable=self.progress_var,
            style="HP.Horizontal.TProgressbar",
            mode="determinate", length=460
        )
        self.progress_bar.pack(padx=20, pady=(0, 8))

        # ── Footer ────────────────────────────────────────────────────────────
        footer = tk.Frame(self.root, bg="#181825", pady=6)
        footer.pack(fill="x", side="bottom")
        tk.Frame(footer, bg="#313244", height=1).pack(fill="x")
        footer_inner = tk.Frame(footer, bg="#181825")
        footer_inner.pack(fill="x", padx=16, pady=4)

        tk.Label(footer_inner, text=f"v{APP_VERSION}",
                 font=("Segoe UI", 8),
                 bg="#181825", fg="#6c7086").pack(side="left")

        self.conn_label = tk.Label(
            footer_inner,
            text=f"Connected to: {self.settings['web_app_url'].replace('https://', '')}",
            font=("Segoe UI", 8),
            bg="#181825", fg="#6c7086"
        )
        self.conn_label.pack(side="right")

        # Fix window width to match content
        self.root.update_idletasks()
        self.root.geometry("500x420")

    # ── File handling ──────────────────────────────────────────────────────────

    def _on_drop(self, event):
        raw = event.data.strip()
        # tkinterdnd2 wraps paths with spaces in braces
        if raw.startswith("{") and raw.endswith("}"):
            raw = raw[1:-1]
        path = raw.split("} {")[0] if "} {" in raw else raw
        self._load_file(path)

    def _browse_file(self):
        path = filedialog.askopenfilename(
            title="Select tune file",
            filetypes=[
                ("Supported files", "*.hpt *.bin *.hpl"),
                ("HP Tuners calibration", "*.hpt"),
                ("Binary calibration", "*.bin"),
                ("VCM Scanner datalog", "*.hpl"),
                ("All files", "*.*"),
            ]
        )
        if path:
            self._load_file(path)

    def _load_file(self, path: str):
        if not os.path.isfile(path):
            self._set_status(f"❌  File not found: {path}", error=True)
            return

        ext = Path(path).suffix.lower()
        if ext not in ACCEPTED_EXTENSIONS:
            file_type = detect_file_type(path)
            if file_type == "unknown":
                messagebox.showerror(
                    "Unsupported file",
                    f"Cannot open files with extension '{ext}'.\n\n"
                    "Supported formats:\n"
                    "  • .hpt — HP Tuners calibration file\n"
                    "  • .bin — Raw PCM binary\n"
                    "  • .hpl — VCM Scanner datalog\n\n"
                    "If you have a CSV export, rename it to .hpl and try again."
                )
                return

        self.loaded_file = path
        self.tune_data   = None

        fname = Path(path).name
        self.file_name_label.config(text=fname)
        self.drop_icon_label.config(text="📄")
        self.drop_text_label.config(text="File loaded — ready to analyse")

        self._set_status(f"Loaded: {fname}")
        self.upload_btn.config(state="normal")
        self.clear_btn.config(state="normal")
        self.progress_var.set(0)

    def _clear(self):
        self.loaded_file  = None
        self.tune_data    = None
        self.drop_icon_label.config(text="📂")
        self.drop_text_label.config(text="Drag your .hpt, .bin or .hpl file here")
        self.file_name_label.config(text="")
        self._set_status("Waiting for file…")
        self.upload_btn.config(state="disabled")
        self.clear_btn.config(state="disabled")
        self.progress_var.set(0)

    # ── Status helpers ─────────────────────────────────────────────────────────

    def _set_status(self, msg: str, error: bool = False, ok: bool = False):
        self.status_var.set(msg)
        color = "#f38ba8" if error else ("#a6e3a1" if ok else "#cdd6f4")
        self.status_label.config(fg=color)

    def _set_progress(self, pct: float):
        self.progress_var.set(pct)
        self.root.update_idletasks()

    # ── Upload flow ────────────────────────────────────────────────────────────

    def _start_upload_flow(self):
        if not self.loaded_file:
            return
        # Parse + show consent dialog in a background thread so UI stays responsive
        self.upload_btn.config(state="disabled")
        self._set_status("Parsing file…")
        self._set_progress(10)
        threading.Thread(target=self._parse_and_review, daemon=True).start()

    def _parse_and_review(self):
        """Runs in background thread — parses file, then triggers consent dialog on main thread."""
        try:
            ftype = detect_file_type(self.loaded_file)
            if ftype == "hpt":
                data = parse_hpt(self.loaded_file)
            elif ftype == "bin":
                data = parse_bin(self.loaded_file)
            elif ftype == "hpl":
                data = parse_hpl(self.loaded_file)
            else:
                self.root.after(0, lambda: self._set_status("❌  Unknown file type", error=True))
                self.root.after(0, lambda: self.upload_btn.config(state="normal"))
                return

            self.tune_data = data
            self.root.after(0, lambda: self._set_progress(40))
            self.root.after(0, lambda: self._show_consent_dialog(data))

        except Exception as exc:
            msg = f"❌  Parse failed: {exc}"
            self.root.after(0, lambda: self._set_status(msg, error=True))
            self.root.after(0, lambda: self.upload_btn.config(state="normal"))
            self.root.after(0, lambda: self._set_progress(0))
            self.root.after(0, lambda: messagebox.showerror(
                "Parse error",
                f"Could not read file:\n{exc}\n\n"
                "If this is a CSV export, try renaming it to .hpl.\n"
                "If this is a .bin file, ensure it is a raw PCM dump."
            ))

    def _show_consent_dialog(self, data: dict):
        """Opens the pre-upload review & consent dialog (Sprint 6 logic)."""
        from consent_dialog import ConsentDialog
        dlg = ConsentDialog(self.root, data, self.loaded_file)
        self.root.wait_window(dlg.window)
        if dlg.confirmed:
            self._set_status("Uploading…")
            self._set_progress(60)
            threading.Thread(target=self._upload, args=(data,), daemon=True).start()
        else:
            self._set_status("Upload cancelled.")
            self.upload_btn.config(state="normal")
            self._set_progress(0)

    def _upload(self, data: dict):
        """Runs in background thread — POSTs to /api/ingest, opens browser."""
        from uploader import upload_and_launch
        url = self.settings["web_app_url"]
        auto_open = self.settings.get("auto_open_browser", True)

        def on_progress(pct: float, msg: str):
            self.root.after(0, lambda: self._set_progress(pct))
            self.root.after(0, lambda: self._set_status(msg))

        success, result_or_err = upload_and_launch(data, url, on_progress, auto_open)
        if success:
            self.root.after(0, lambda: self._set_progress(100))
            self.root.after(0, lambda: self._set_status(
                "✅  Uploaded! Analysis opening in your browser…", ok=True))
            self.root.after(0, lambda: self.upload_btn.config(state="normal"))
        else:
            self.root.after(0, lambda: self._set_status(
                f"❌  {result_or_err}", error=True))
            self.root.after(0, lambda: self._set_progress(0))
            self.root.after(0, lambda: self.upload_btn.config(state="normal"))

    # ── Settings window ────────────────────────────────────────────────────────

    def _open_settings(self):
        from settings_window import SettingsWindow
        SettingsWindow(self.root, self.settings, self._on_settings_saved)

    def _on_settings_saved(self, new_settings: dict):
        self.settings = new_settings
        save_settings(new_settings)
        url_display = new_settings["web_app_url"].replace("https://", "")
        self.conn_label.config(text=f"Connected to: {url_display}")

    # ── About / updates ────────────────────────────────────────────────────────

    def _show_about(self):
        messagebox.showinfo(
            "About",
            f"{APP_TITLE}\nVersion {APP_VERSION}\n\n"
            "Analyse your HP Tuners calibration files with AI.\n\n"
            "© 2025 HP Tuners AI Advisor"
        )

    def _check_for_updates_async(self):
        threading.Thread(target=self._check_updates_worker,
                         args=(APP_VERSION, False), daemon=True).start()

    def _check_for_updates_manual(self):
        threading.Thread(target=self._check_updates_worker,
                         args=(APP_VERSION, True), daemon=True).start()

    def _check_updates_worker(self, current_version: str, notify_if_current: bool):
        try:
            r = requests.get(
                "https://api.github.com/repos/rob10305/HPTUNERS/releases/latest",
                timeout=5
            )
            if r.status_code != 200:
                raise ValueError(f"HTTP {r.status_code}")
            latest_tag = r.json().get("tag_name", "").lstrip("v")
            html_url   = r.json().get("html_url", "")
            if latest_tag and latest_tag != current_version:
                self.root.after(0, lambda: self._prompt_update(latest_tag, html_url))
            elif notify_if_current:
                self.root.after(0, lambda: messagebox.showinfo(
                    "Up to date", f"You are running the latest version ({current_version})."))
        except Exception:
            if notify_if_current:
                self.root.after(0, lambda: messagebox.showwarning(
                    "Update check failed",
                    "Could not check for updates.\nCheck your internet connection."))

    def _prompt_update(self, latest: str, url: str):
        if messagebox.askyesno(
            "Update available",
            f"Version {latest} is available (you have {APP_VERSION}).\n\n"
            "Open the download page?",
            icon="info"
        ):
            webbrowser.open(url)


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    if HAS_DND:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()

    app = App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
