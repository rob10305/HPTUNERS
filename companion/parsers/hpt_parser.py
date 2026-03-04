"""
Sprint 3 — .hpt file parser.
Strategy: scan header for OS version → lookup offset DB → extract tables.
Falls back to pattern-matching for unknown OS versions.
"""

import json
import re
import struct
from pathlib import Path

OFFSET_DB_PATH = Path(__file__).parent.parent / "os_offsets.json"


# ── Public entry point ─────────────────────────────────────────────────────────

def parse_hpt(filepath: str) -> dict:
    with open(filepath, "rb") as f:
        data = f.read()

    vehicle = extract_vehicle_info(data)
    os_version = vehicle["osVersion"]

    if os_version:
        tables = extract_tables_by_offset(data, os_version)
    else:
        tables = attempt_pattern_extraction(data)

    return {
        "source": "companion_app",
        "vehicle": vehicle,
        "tables": tables,
        "rawFlags": derive_flags(tables),
        "_parseWarning": None if os_version else
            "OS version not detected — pattern extraction used. "
            "Results may be incomplete. Consider exporting tables as CSV from VCM Editor.",
    }


# ── Vehicle info ───────────────────────────────────────────────────────────────

def extract_vehicle_info(data: bytes) -> dict:
    text_region = data[:1024]

    # 8-digit OS version number
    os_matches = re.findall(rb"\d{8}", text_region)
    os_version = os_matches[0].decode("ascii") if os_matches else None

    # VIN — 17 alphanumeric (excluding I, O, Q)
    vin_matches = re.findall(rb"[A-HJ-NPR-Z0-9]{17}", text_region)
    vin = vin_matches[0].decode("ascii") if vin_matches else None

    # Try to resolve ECU label from offset DB
    ecu_label = None
    if os_version and OFFSET_DB_PATH.exists():
        try:
            with open(OFFSET_DB_PATH) as f:
                db = json.load(f)
            if os_version in db:
                ecu_label = db[os_version].get("label")
        except Exception:
            pass

    return {
        "osVersion": os_version,
        "ecuType": ecu_label,
        "vin": vin,       # raw — will be anonymised before upload
        "platform": None,
    }


# ── Offset-based extraction ────────────────────────────────────────────────────

def extract_tables_by_offset(data: bytes, os_version: str) -> dict:
    if not OFFSET_DB_PATH.exists():
        return {}

    with open(OFFSET_DB_PATH) as f:
        offset_db = json.load(f)

    if os_version not in offset_db:
        # Unknown OS — try pattern extraction
        return attempt_pattern_extraction(data)

    os_config = offset_db[os_version]
    tables = {}

    for table_name, config in os_config.items():
        if table_name == "label":
            continue
        try:
            tables[table_name] = extract_table(data, config)
        except Exception as exc:
            print(f"[hpt_parser] Failed to extract {table_name}: {exc}")
            tables[table_name] = None

    return tables


def extract_table(data: bytes, config: dict):
    offset = config["offset"]
    dtype  = config["type"]
    scale  = config.get("scale", 1.0)

    if dtype == "float32":
        rows = config.get("rows", 1)
        cols = config.get("cols", config.get("count", 1))
        count = rows * cols
        fmt = f">{count}f"   # big-endian GM
        values = list(struct.unpack_from(fmt, data, offset))
        values = [round(v * scale, 4) for v in values]

        if "rows" in config and "cols" in config:
            r, c = config["rows"], config["cols"]
            return [values[i * c:(i + 1) * c] for i in range(r)]
        # scalar
        if count == 1:
            return values[0]
        return values

    elif dtype == "uint16":
        count = config.get("count", 1)
        fmt = f">{count}H"
        values = list(struct.unpack_from(fmt, data, offset))
        result = [round(v * scale, 4) for v in values]
        if count == 1:
            return result[0]
        return result

    elif dtype == "uint16_scalar":
        raw = struct.unpack_from(">H", data, offset)[0]
        return round(raw * scale, 4)

    raise ValueError(f"Unknown dtype: {dtype}")


# ── Pattern matching fallback ──────────────────────────────────────────────────

def attempt_pattern_extraction(data: bytes) -> dict:
    """
    Heuristic scan for float32 arrays in typical VE/spark range (0–130).
    Returns candidates with byte offsets for manual review.
    """
    candidates = find_float_arrays(data, min_val=0.0, max_val=130.0, min_count=256)
    return {"_pattern_candidates": candidates}


def find_float_arrays(
    data: bytes,
    min_val: float,
    max_val: float,
    min_count: int,
) -> list[dict]:
    """
    Slide a window over the binary, looking for runs of float32 values
    all within [min_val, max_val]. Returns each qualifying run.
    """
    results = []
    i = 0
    n = len(data) - 4

    while i < n:
        try:
            v = struct.unpack_from(">f", data, i)[0]
        except struct.error:
            i += 4
            continue

        if min_val <= v <= max_val:
            # Count how many consecutive floats are in range
            run = [v]
            j = i + 4
            while j < n:
                try:
                    nv = struct.unpack_from(">f", data, j)[0]
                except struct.error:
                    break
                if min_val <= nv <= max_val:
                    run.append(nv)
                    j += 4
                else:
                    break
            if len(run) >= min_count:
                results.append({"offset": i, "count": len(run), "sample": run[:16]})
            i = j  # skip past this run
        else:
            i += 4

    return results


# ── Flags derivation ───────────────────────────────────────────────────────────

def derive_flags(tables: dict) -> dict:
    flags = {
        "isForcedInduction": False,
        "hasFlexFuel": False,
        "hasBoostControl": False,
        "detectedInjectorSize_cc": None,
    }

    # Injector flow
    inj = tables.get("injectorFlow")
    if isinstance(inj, (int, float)) and inj > 0:
        flags["detectedInjectorSize_cc"] = round(inj)

    # Boost tables present → forced induction
    if tables.get("boostTarget") is not None or tables.get("boostLimit") is not None:
        flags["isForcedInduction"] = True
        flags["hasBoostControl"] = True

    # Flex fuel tables
    if tables.get("flexFuelEthanol") is not None:
        flags["hasFlexFuel"] = True

    return flags
