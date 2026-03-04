"""
Sprint 4 — Raw .bin PCM parser.
.bin files are raw memory dumps. OS version is stored at known offsets.
Uses the same offset DB as hpt_parser.
"""

from pathlib import Path
from .hpt_parser import extract_tables_by_offset, derive_flags

KNOWN_OS_OFFSETS = [0x0100, 0x1000, 0x2000, 0x0200]


def parse_bin(filepath: str) -> dict:
    with open(filepath, "rb") as f:
        data = f.read()

    os_version = detect_bin_os_version(data)
    tables = extract_tables_by_offset(data, os_version) if os_version else {}

    return {
        "source": "companion_app",
        "vehicle": {
            "osVersion": os_version,
            "ecuType":   None,
            "vin":       None,
            "platform":  None,
        },
        "tables": tables,
        "rawFlags": derive_flags(tables),
        "_parseWarning": None if os_version else
            "Could not detect OS version from .bin file. "
            "No tables were extracted. Try exporting tables as CSV from VCM Editor.",
    }


def detect_bin_os_version(data: bytes) -> str | None:
    for offset in KNOWN_OS_OFFSETS:
        try:
            candidate = data[offset:offset + 8].decode("ascii")
            if candidate.isdigit() and len(candidate) == 8:
                return candidate
        except Exception:
            continue
    return None
