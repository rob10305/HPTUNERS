"""
Sprint 9 — Settings window.
Editable fields: web app URL, default output folder, auto-open browser.
"""

import tkinter as tk
from tkinter import filedialog
from typing import Callable


class SettingsWindow:
    def __init__(self, parent: tk.Tk, current: dict, on_save: Callable[[dict], None]):
        self.on_save = on_save
        self.current = dict(current)

        w = tk.Toplevel(parent)
        self.window = w
        w.title("Settings")
        w.configure(bg="#1e1e2e")
        w.resizable(False, False)
        w.grab_set()
        w.transient(parent)

        self._build(w)

        w.update_idletasks()
        px = parent.winfo_x() + (parent.winfo_width()  - w.winfo_width())  // 2
        py = parent.winfo_y() + (parent.winfo_height() - w.winfo_height()) // 2
        w.geometry(f"+{px}+{py}")

    def _build(self, w: tk.Toplevel):
        # ── Header ────────────────────────────────────────────────────────────
        hdr = tk.Frame(w, bg="#181825", pady=10, padx=16)
        hdr.pack(fill="x")
        tk.Label(hdr, text="⚙️  Settings",
                 font=("Segoe UI", 12, "bold"),
                 bg="#181825", fg="#cdd6f4").pack(side="left")
        tk.Frame(w, bg="#313244", height=1).pack(fill="x")

        body = tk.Frame(w, bg="#1e1e2e", padx=16, pady=14)
        body.pack(fill="x")

        # ── Web app URL ───────────────────────────────────────────────────────
        tk.Label(body, text="Web app URL",
                 font=("Segoe UI", 9, "bold"),
                 bg="#1e1e2e", fg="#a6adc8").pack(anchor="w")
        tk.Label(body,
                 text="The deployed HP Tuners AI Advisor URL. "
                      "Set to http://localhost:3000 for local dev.",
                 font=("Segoe UI", 8, "italic"),
                 bg="#1e1e2e", fg="#6c7086",
                 wraplength=380, justify="left").pack(anchor="w")

        self.url_var = tk.StringVar(value=self.current.get("web_app_url", ""))
        url_entry = tk.Entry(
            body, textvariable=self.url_var,
            font=("Segoe UI", 9),
            bg="#313244", fg="#cdd6f4",
            insertbackground="#cdd6f4",
            relief="flat", bd=4, width=50
        )
        url_entry.pack(fill="x", pady=(4, 12))

        # ── Output folder ─────────────────────────────────────────────────────
        tk.Label(body, text="Default output folder",
                 font=("Segoe UI", 9, "bold"),
                 bg="#1e1e2e", fg="#a6adc8").pack(anchor="w")
        tk.Label(body,
                 text="Where AI_Output folders are created. "
                      "Leave blank to save alongside the original file.",
                 font=("Segoe UI", 8, "italic"),
                 bg="#1e1e2e", fg="#6c7086",
                 wraplength=380, justify="left").pack(anchor="w")

        folder_row = tk.Frame(body, bg="#1e1e2e")
        folder_row.pack(fill="x", pady=(4, 12))

        self.folder_var = tk.StringVar(value=self.current.get("output_folder", ""))
        tk.Entry(
            folder_row, textvariable=self.folder_var,
            font=("Segoe UI", 9),
            bg="#313244", fg="#cdd6f4",
            insertbackground="#cdd6f4",
            relief="flat", bd=4, width=42
        ).pack(side="left", fill="x", expand=True)
        tk.Button(
            folder_row, text="Browse…",
            command=self._browse_folder,
            bg="#45475a", fg="#cdd6f4",
            activebackground="#585b70", activeforeground="#cdd6f4",
            font=("Segoe UI", 9), relief="flat",
            padx=8, pady=3, cursor="hand2"
        ).pack(side="left", padx=(6, 0))

        # ── Auto-open browser ─────────────────────────────────────────────────
        self.auto_open_var = tk.BooleanVar(
            value=self.current.get("auto_open_browser", True))
        chk = tk.Checkbutton(
            body,
            text="Auto-open browser after upload",
            variable=self.auto_open_var,
            bg="#1e1e2e", fg="#cdd6f4",
            selectcolor="#313244",
            activebackground="#1e1e2e", activeforeground="#cdd6f4",
            font=("Segoe UI", 9),
        )
        chk.pack(anchor="w", pady=(0, 8))

        # ── Clear session data ────────────────────────────────────────────────
        tk.Button(
            body, text="Clear session data",
            command=self._clear_session,
            bg="#313244", fg="#f38ba8",
            activebackground="#45475a", activeforeground="#f38ba8",
            font=("Segoe UI", 9), relief="flat",
            padx=10, pady=4, cursor="hand2"
        ).pack(anchor="w", pady=(4, 0))

        # ── Buttons ───────────────────────────────────────────────────────────
        tk.Frame(w, bg="#313244", height=1).pack(fill="x")
        btn_frame = tk.Frame(w, bg="#1e1e2e", padx=16, pady=10)
        btn_frame.pack(fill="x")

        tk.Button(
            btn_frame, text="Save",
            command=self._save,
            bg="#89b4fa", fg="#1e1e2e",
            activebackground="#74c7ec", activeforeground="#1e1e2e",
            font=("Segoe UI", 10, "bold"), relief="flat",
            padx=14, pady=6, cursor="hand2"
        ).pack(side="left")

        tk.Button(
            btn_frame, text="Cancel",
            command=self.window.destroy,
            bg="#313244", fg="#cdd6f4",
            activebackground="#45475a", activeforeground="#cdd6f4",
            font=("Segoe UI", 10), relief="flat",
            padx=14, pady=6, cursor="hand2"
        ).pack(side="left", padx=(10, 0))

    def _browse_folder(self):
        path = filedialog.askdirectory(title="Select output folder")
        if path:
            self.folder_var.set(path)

    def _clear_session(self):
        from tkinter import messagebox
        if messagebox.askyesno(
            "Clear session data",
            "This will clear any locally stored session information.\n\nContinue?"
        ):
            # Session data is not persisted locally in MVP — nothing to clear
            messagebox.showinfo("Done", "Session data cleared.")

    def _save(self):
        url = self.url_var.get().strip().rstrip("/")
        if not url.startswith("http"):
            from tkinter import messagebox
            messagebox.showerror("Invalid URL",
                                 "Web app URL must start with http:// or https://")
            return
        new_settings = {
            "web_app_url":       url,
            "output_folder":     self.folder_var.get().strip(),
            "auto_open_browser": self.auto_open_var.get(),
        }
        self.on_save(new_settings)
        self.window.destroy()
