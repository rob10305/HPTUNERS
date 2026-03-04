"""
Sprint 8 — Write modified table values back into a copy of the original .hpt file.
Patch-in-place strategy: only modified bytes are overwritten; everything else is untouched.
The original file is NEVER modified. Output goes to an AI_Output/ subfolder.
"""

import json
import struct
from datetime import datetime
from pathlib import Path

OFFSET_DB_PATH = Path(__file__).parent / "os_offsets.json"


def write_modified_hpt(
    original_path: str,
    modifications: dict,
    os_version: str,
) -> str:
    """
    Apply `modifications` to a copy of `original_path`.

    modifications: { 'VE': [[...]], 'spark': [[...]], 'MAF': [...], ... }
    Returns the path of the newly written file.
    Raises ValueError if the OS version is unknown.
    """
    if not OFFSET_DB_PATH.exists():
        raise FileNotFoundError(f"Offset database not found: {OFFSET_DB_PATH}")

    with open(OFFSET_DB_PATH) as f:
        offset_db = json.load(f)

    if os_version not in offset_db:
        raise ValueError(
            f"Cannot write — OS version '{os_version}' is not in the offset database. "
            "Add it to os_offsets.json and try again."
        )

    os_config = offset_db[os_version]

    with open(original_path, "rb") as f:
        data = bytearray(f.read())

    patched_tables = []
    skipped_tables = []

    for table_name, new_values in modifications.items():
        if table_name not in os_config or table_name == "label":
            skipped_tables.append(table_name)
            continue
        config = os_config[table_name]
        try:
            patch_table(data, config, new_values)
            patched_tables.append(table_name)
        except Exception as exc:
            print(f"[tune_writer] Could not patch {table_name}: {exc}")
            skipped_tables.append(table_name)

    # Always write to AI_Output subfolder — never overwrite original
    out_dir = Path(original_path).parent / "AI_Output"
    out_dir.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    stem      = Path(original_path).stem
    out_path  = out_dir / f"{stem}_AI_BASELINE_{timestamp}.hpt"

    with open(out_path, "wb") as f:
        f.write(data)

    return str(out_path)


def patch_table(data: bytearray, config: dict, new_values) -> None:
    """Overwrite the bytes for one table in `data` with `new_values`."""
    offset = config["offset"]
    dtype  = config["type"]
    scale  = config.get("scale", 1.0)

    # Flatten 2D arrays
    if new_values and isinstance(new_values, list) and isinstance(new_values[0], list):
        flat = [v for row in new_values for v in row]
    elif isinstance(new_values, list):
        flat = list(new_values)
    else:
        flat = [new_values]  # scalar

    if dtype == "float32":
        # Undo scale before packing
        raw = [float(v) / scale if scale != 1.0 else float(v) for v in flat]
        packed = struct.pack(f">{len(raw)}f", *raw)

    elif dtype in ("uint16", "uint16_scalar"):
        raw = [int(round(float(v) / scale)) if scale != 1.0 else int(round(float(v))) for v in flat]
        packed = struct.pack(f">{len(raw)}H", *raw)

    else:
        raise ValueError(f"Unknown dtype '{dtype}' — cannot pack table")

    end = offset + len(packed)
    if end > len(data):
        raise ValueError(
            f"Patch at offset {offset} length {len(packed)} "
            f"exceeds file size {len(data)}"
        )

    data[offset:end] = packed
