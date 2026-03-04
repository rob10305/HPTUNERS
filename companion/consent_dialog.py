"""
Sprint 6 — Pre-upload consent & review dialog.
Shows exactly what tables will be sent. VIN is always anonymised.
User must confirm before upload proceeds.
"""

import tkinter as tk
from tkinter import ttk
from pathlib import Path


class ConsentDialog:
    """
    Modal window. After the user closes it, check `dlg.confirmed`.
    """

    def __init__(self, parent: tk.Tk, tune_data: dict, filepath: str):
        self.confirmed = False
        self.window    = tk.Toplevel(parent)
        self.window.title("Review before uploading")
        self.window.configure(bg="#1e1e2e")
        self.window.resizable(False, False)
        self.window.grab_set()          # modal
        self.window.transient(parent)

        self._build(tune_data, filepath)

        # Centre over parent
        self.window.update_idletasks()
        px = parent.winfo_x() + (parent.winfo_width()  - self.window.winfo_width())  // 2
        py = parent.winfo_y() + (parent.winfo_height() - self.window.winfo_height()) // 2
        self.window.geometry(f"+{px}+{py}")

    def _build(self, data: dict, filepath: str):
        w = self.window

        # ── Header ────────────────────────────────────────────────────────────
        hdr = tk.Frame(w, bg="#181825", pady=10, padx=16)
        hdr.pack(fill="x")
        tk.Label(hdr, text="📋  Review before uploading",
                 font=("Segoe UI", 12, "bold"),
                 bg="#181825", fg="#cdd6f4").pack(side="left")

        tk.Frame(w, bg="#313244", height=1).pack(fill="x")

        # ── File info ─────────────────────────────────────────────────────────
        info = tk.Frame(w, bg="#1e1e2e", padx=16, pady=10)
        info.pack(fill="x")

        fname   = Path(filepath).name
        vehicle = data.get("vehicle", {})
        os_ver  = vehicle.get("osVersion", "Unknown")
        ecu_lbl = vehicle.get("ecuType") or ""
        os_str  = f"{os_ver} ({ecu_lbl})" if ecu_lbl else os_ver

        _info_row(info, "File:",         fname)
        _info_row(info, "Detected OS:",  os_str)
        _info_row(info, "VIN:",          "Will be anonymised  ✅")

        warn = data.get("_parseWarning")
        if warn:
            tk.Label(info, text=f"⚠️  {warn}",
                     font=("Segoe UI", 8, "italic"),
                     bg="#1e1e2e", fg="#f9e2af",
                     wraplength=420, justify="left").pack(anchor="w", pady=(4, 0))

        tk.Frame(w, bg="#313244", height=1).pack(fill="x")

        # ── Tables list ───────────────────────────────────────────────────────
        tables_outer = tk.Frame(w, bg="#1e1e2e", padx=16, pady=10)
        tables_outer.pack(fill="x")
        tk.Label(tables_outer, text="Tables found:",
                 font=("Segoe UI", 9, "bold"),
                 bg="#1e1e2e", fg="#a6adc8").pack(anchor="w")

        tables = data.get("tables", {})
        for name, value in tables.items():
            if name.startswith("_"):
                continue
            icon, colour, detail = _describe_table(name, value)
            row = tk.Frame(tables_outer, bg="#1e1e2e")
            row.pack(fill="x", pady=1)
            tk.Label(row, text=icon, bg="#1e1e2e", fg=colour,
                     font=("Segoe UI Emoji", 9), width=3).pack(side="left")
            tk.Label(row, text=f"{name}{detail}",
                     bg="#1e1e2e", fg=colour,
                     font=("Segoe UI", 9)).pack(side="left")

        # If we have a datalog instead of tables (HPL files)
        datalog = data.get("datalog")
        if datalog:
            channels = datalog.get("channels", [])
            rows_n   = len(datalog.get("rows", []))
            row = tk.Frame(tables_outer, bg="#1e1e2e")
            row.pack(fill="x", pady=1)
            tk.Label(row, text="✅", bg="#1e1e2e", fg="#a6e3a1",
                     font=("Segoe UI Emoji", 9), width=3).pack(side="left")
            tk.Label(row,
                     text=f"Datalog: {len(channels)} channels, {rows_n} rows",
                     bg="#1e1e2e", fg="#a6e3a1",
                     font=("Segoe UI", 9)).pack(side="left")

        if not tables and not datalog:
            tk.Label(tables_outer,
                     text="⚠️  No tables extracted — only metadata will be sent.",
                     bg="#1e1e2e", fg="#f9e2af",
                     font=("Segoe UI", 9)).pack(anchor="w")

        tk.Frame(w, bg="#313244", height=1).pack(fill="x")

        # ── Privacy note ──────────────────────────────────────────────────────
        note = tk.Frame(w, bg="#1e1e2e", padx=16, pady=8)
        note.pack(fill="x")
        tk.Label(
            note,
            text="No raw binary data is sent — only the extracted table values listed above.",
            font=("Segoe UI", 8, "italic"),
            bg="#1e1e2e", fg="#6c7086",
            wraplength=440, justify="left"
        ).pack(anchor="w")

        # ── Buttons ───────────────────────────────────────────────────────────
        btn_frame = tk.Frame(w, bg="#1e1e2e", padx=16, pady=12)
        btn_frame.pack(fill="x")

        tk.Button(
            btn_frame, text="Upload & Open Analysis",
            command=self._confirm,
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

    def _confirm(self):
        self.confirmed = True
        self.window.destroy()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _info_row(parent, label: str, value: str):
    row = tk.Frame(parent, bg="#1e1e2e")
    row.pack(fill="x", pady=1)
    tk.Label(row, text=label,
             font=("Segoe UI", 9, "bold"),
             bg="#1e1e2e", fg="#a6adc8", width=14, anchor="w").pack(side="left")
    tk.Label(row, text=value,
             font=("Segoe UI", 9),
             bg="#1e1e2e", fg="#cdd6f4").pack(side="left")


def _describe_table(name: str, value) -> tuple[str, str, str]:
    """Return (icon, colour, detail_suffix) for a table entry."""
    if value is None:
        return "❌", "#f38ba8", " — Extraction failed"

    if isinstance(value, list):
        if value and isinstance(value[0], list):
            rows = len(value)
            cols = len(value[0]) if value else 0
            return "✅", "#a6e3a1", f" ({rows}×{cols})"
        return "✅", "#a6e3a1", f" ({len(value)} values)"

    if isinstance(value, (int, float)):
        return "✅", "#a6e3a1", f": {value}"

    if isinstance(value, str):
        return "⚠️", "#f9e2af", f" — {value}"

    return "ℹ️", "#89b4fa", ""
