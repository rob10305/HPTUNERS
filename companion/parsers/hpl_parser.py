"""
VCM Scanner .hpl datalog parser.

Supports two formats:
  1. Text/CSV export — tab- or comma-separated rows with a header line.
  2. Binary HP Tuners native (.hpl "HPT " magic) — header is parsed for channel
     names, but the data section uses a proprietary encrypted format that cannot
     be decoded.  The parser returns a warning dict so the caller can prompt the
     user to export a text/CSV copy from VCM Scanner instead.
"""

from pathlib import Path
import struct

# ── Channel-name aliases (text format) ────────────────────────────────────────
CHANNEL_ALIASES: dict[str, str] = {
    # RPM
    "engine speed": "RPM", "engine speed (rpm)": "RPM",
    "enginespeed": "RPM", "rpm": "RPM", "engine rpm": "RPM",
    "rpm (rpm)": "RPM", "eng speed": "RPM",
    # TPS
    "tps": "TPS", "throttle position": "TPS",
    "throttle position (tps)": "TPS", "throttle position (%)": "TPS",
    "throttle pos.": "TPS", "throttle pos": "TPS",
    "throttle (%)": "TPS", "tps (%)": "TPS",
    # MAP
    "map": "MAP", "manifold absolute pressure": "MAP",
    "map (kpa)": "MAP", "map (psi)": "MAP", "map pressure": "MAP",
    "baro/map": "MAP", "manifold pressure": "MAP", "map sensor": "MAP",
    "map kpa": "MAP", "boost pressure": "MAP",
    # MAF
    "maf": "MAF", "mass air flow": "MAF",
    "maf (g/s)": "MAF", "mass airflow": "MAF",
    "massairflow": "MAF", "maf g/s": "MAF",
    "air flow": "MAF", "airflow (g/s)": "MAF", "maf sensor": "MAF",
    # STFT / LTFT  (map to combined keys; web app harmonises bank)
    "stft": "STFT", "short term fuel trim": "STFT",
    "short term fuel trim (%)": "STFT", "stft (%)": "STFT",
    "fuel trim short term": "STFT", "st fuel trim": "STFT",
    "stft b1": "STFT", "short term fuel trim b1": "STFT",
    "short term ft bank 1": "STFT", "fuel trim st b1": "STFT",
    "stft bank 1": "STFT", "short term fuel trim bank 1": "STFT",
    "st fuel trim (bank 1)": "STFT",
    "ltft": "LTFT", "long term fuel trim": "LTFT",
    "long term fuel trim (%)": "LTFT", "ltft (%)": "LTFT",
    "fuel trim long term": "LTFT", "lt fuel trim": "LTFT",
    "ltft b1": "LTFT", "long term fuel trim b1": "LTFT",
    "long term ft bank 1": "LTFT", "fuel trim lt b1": "LTFT",
    "ltft bank 1": "LTFT", "long term fuel trim bank 1": "LTFT",
    "lt fuel trim (bank 1)": "LTFT",
    # Lambda / O2 / AFR
    "o2": "Lambda", "lambda": "Lambda", "o2 sensor": "Lambda",
    "o2 (v)": "Lambda", "wideband o2": "Lambda", "afr": "Lambda",
    "air fuel ratio": "Lambda", "equivalence ratio": "Lambda",
    "wideband afr": "Lambda", "wb afr": "Lambda",
    "o2 b1 s1": "Lambda", "o2 sensor b1 s1": "Lambda",
    "fueling - afr commanded": "Lambda", "commanded afr": "Lambda",
    "target afr": "Lambda", "\u03bb": "Lambda",
    # Knock
    "knock": "KnockRetard", "knock retard": "KnockRetard",
    "knock retard (deg)": "KnockRetard", "spark knock retard": "KnockRetard",
    "knock activity": "KnockRetard", "ks retard": "KnockRetard",
    "knock sensor retard": "KnockRetard",
    "knock retard cyl avg": "KnockRetard", "knock retard avg": "KnockRetard",
    "total knock retard": "KnockRetard",
    "ignition - knock retard": "KnockRetard",
    # IAT
    "iat": "IAT", "intake air temp": "IAT",
    "intake air temperature": "IAT", "intakeairtemp": "IAT",
    "iat (\u00b0c)": "IAT", "iat (c)": "IAT",
    "iat (\u00b0f)": "IAT", "iat (f)": "IAT",
    "air temperature": "IAT", "inlet air temp": "IAT",
    "air temp": "IAT", "intake temp": "IAT",
    # CLT / Coolant
    "coolant": "CLT", "engine coolant temperature": "CLT",
    "ect": "CLT", "coolant temp": "CLT",
    "coolant (\u00b0c)": "CLT", "coolant (\u00b0f)": "CLT",
    "coolant temp (\u00b0c)": "CLT", "coolant temp (\u00b0f)": "CLT",
    "engine coolant temp": "CLT", "water temp": "CLT",
    "coolant temperature": "CLT",
    "enginecoolanttemp": "CLT", "ect \u00b0c": "CLT", "ect c": "CLT",
    # Boost (separate channel distinct from MAP)
    "boost": "Boost", "boost pressure": "Boost",
    "boost (psi)": "Boost", "boost (kpa)": "Boost",
    "turbo boost": "Boost", "boost pressure (psi)": "Boost",
    "boost pressure (kpa)": "Boost", "turbo boost pressure": "Boost",
}

RPM_LIKE  = {"rpm", "engine speed", "enginespeed", "engine speed (rpm)", "eng speed"}
MAP_LIKE  = {"map", "manifold absolute pressure", "map kpa", "boost pressure",
             "map (kpa)", "map (psi)", "manifold pressure"}
TPS_LIKE  = {"tps", "throttle position", "throttleposition", "throttle pos",
             "throttle position (tps)", "throttle position (%)"}

BINARY_HPL_MAGIC = b"HPT "   # HP Tuners native binary datalog signature

# ── Unit-string → canonical channel  (binary header channel info) ──────────────
_UNIT_TO_CANONICAL: dict[str, str] = {
    "rpm":    "RPM",
    "kpa":    "MAP",
    "g/s":    "MAF",
    "%":      "TPS",        # could also be STFT/LTFT — we label generically
    "v":      "Lambda",
    "\u03bb": "Lambda",
    "\u00b0": "IAT",        # bare '°' → temperature (IAT or CLT ambiguous)
    "\u00b0c": "CLT",
    "mpa":    "Boost",
}


# ─── Public entry point ────────────────────────────────────────────────────────

def parse_hpl(filepath: str) -> dict:
    """Return a TuneData-compatible dict for an HPL file.

    Binary HPL files cannot be decoded (proprietary encrypted format) but the
    channel names in the file header ARE readable.  In that case the function
    returns a dict with an empty datalog and a ``_parseWarning`` message so the
    caller can prompt the user to export a text/CSV copy from VCM Scanner.
    """
    with open(filepath, "rb") as f:
        raw_start = f.read(6)

    if raw_start[:4] == BINARY_HPL_MAGIC:
        return _handle_binary_hpl(filepath, raw_start)

    # ── Text/CSV format ────────────────────────────────────────────────────────
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    sep = _detect_separator(lines)

    header_row = None
    data_start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        cols = stripped.split(sep)
        lower_cols = [c.lower().strip().strip('"\'') for c in cols]
        hits = sum(
            1 for c in lower_cols
            if any(kw in c for kw in list(RPM_LIKE) + list(MAP_LIKE) + list(TPS_LIKE))
        )
        if hits > 0 or (len(cols) >= 3 and i < 20):
            header_row = cols
            data_start = i + 1
            break

    if not header_row:
        raise ValueError(
            "Could not find data headers in .hpl file. "
            "Ensure this is a VCM Scanner datalog exported as text/CSV."
        )

    normalised_headers = [_normalise_channel(h) for h in header_row]

    # Skip an optional units row (non-numeric row immediately after header)
    if data_start < len(lines):
        first_data = lines[data_start].strip()
        if first_data:
            test_cols = first_data.split(sep)
            num_count = sum(1 for c in test_cols if _is_numeric(c.strip().strip('"\'').strip()))
            if num_count < len(test_cols) * 0.3:
                data_start += 1

    rows = []
    for line in lines[data_start:]:
        stripped = line.strip()
        if not stripped:
            continue
        values = stripped.split(sep)
        row: dict[str, float | None] = {}
        for idx, col in enumerate(normalised_headers):
            if not col:
                continue
            try:
                raw = values[idx].strip().strip('"\'') if idx < len(values) else ""
                row[col] = float(raw) if raw else None
            except (ValueError, IndexError):
                row[col] = None
        if any(v is not None for v in row.values()):
            rows.append(row)

    is_fi = _detect_forced_induction(rows)

    return {
        "source": "companion_app",
        "vehicle": {
            "osVersion": None,
            "ecuType":   None,
            "vin":       None,
            "platform":  None,
        },
        "tables": {},
        "datalog": {
            "channels": normalised_headers,
            "rows":     rows,
        },
        "rawFlags": {
            "isForcedInduction": is_fi,
            "hasFlexFuel":       False,
            "hasBoostControl":   False,
            "detectedInjectorSize_cc": None,
        },
        "_parseWarning": None,
    }


# ── Binary HPL handling ────────────────────────────────────────────────────────

def _handle_binary_hpl(filepath: str, raw_start: bytes) -> dict:
    """Parse what we can from a binary HPL header and return a warning dict."""
    channels_found: list[str] = []
    n_channels = 0

    try:
        with open(filepath, "rb") as f:
            header = f.read(0x600)   # read first ~1.5 KB (covers all channel defs)

        # Version byte is at offset 5 (e.g. 0x09 for version 9)
        version = raw_start[5] if len(raw_start) > 5 else 0

        if version == 0x09:
            # Version 9: structured header with readable channel definitions.
            # Channel count at 0x27 (LE uint16).
            n_channels = struct.unpack_from("<H", header, 0x27)[0] if len(header) > 0x29 else 0
            channels_found = _extract_v9_channels(header, n_channels)

    except Exception:
        pass   # best-effort — fall through to warning

    ch_list = ""
    if channels_found:
        ch_list = (
            f"\n\nChannels detected in file header: {', '.join(channels_found)}"
            "\n(Channel data cannot be extracted from the binary format.)"
        )

    warning = (
        "Binary HP Tuners datalog detected.\n\n"
        "HP Tuners .hpl files saved directly by VCM Scanner use a proprietary "
        "encrypted format — the data cannot be read without HP Tuners software.\n\n"
        "To use this log:\n"
        "  1. Open the file in VCM Scanner\n"
        "  2. File \u2192 Export \u2192 Export to Text/CSV\n"
        "  3. Save as .csv or .hpl\n"
        "  4. Drop the exported file into this app"
        + ch_list
    )

    return {
        "source": "companion_app",
        "vehicle": {
            "osVersion": None,
            "ecuType":   None,
            "vin":       None,
            "platform":  None,
        },
        "tables": {},
        "datalog": {
            "channels": channels_found,
            "rows":     [],
        },
        "rawFlags": {
            "isForcedInduction": False,
            "hasFlexFuel":       False,
            "hasBoostControl":   False,
            "detectedInjectorSize_cc": None,
        },
        "_parseWarning": warning,
    }


def _extract_v9_channels(header: bytes, n_channels: int) -> list[str]:
    """Extract canonical channel names from a version-9 binary HPL header.

    Each channel definition contains (after the 8-byte scale=1.0 and 8-byte
    offset=0.0 fields): 1-byte padding, 1-byte unit-string length, the unit
    string (UTF-8), then 6 more bytes of per-channel metadata.
    """
    SCALE_1 = struct.pack("<d", 1.0)
    seen: dict[str, int] = {}
    found: list[str] = []
    pos = 0
    limit = min(len(header), 0x600)

    while len(found) < max(n_channels, 1) and pos < limit:
        idx = header.find(SCALE_1, pos, limit)
        if idx == -1:
            break
        after = idx + 16     # past scale (8) + offset (8)
        if after + 3 > len(header):
            break
        unit_len  = header[after + 1]
        unit_end  = after + 2 + unit_len
        if unit_end > len(header):
            break
        unit_raw = header[after + 2: unit_end]
        unit_str = unit_raw.decode("utf-8", errors="replace").strip().lower()
        canonical = _UNIT_TO_CANONICAL.get(unit_str)
        if canonical:
            count = seen.get(canonical, 0)
            label = canonical if count == 0 else f"{canonical}_{count + 1}"
            seen[canonical] = count + 1
            found.append(label)
        pos = idx + 1

    return found


# ── Helpers ────────────────────────────────────────────────────────────────────

def _detect_separator(lines: list[str]) -> str:
    tabs   = sum(line.count("\t") for line in lines[:20])
    commas = sum(line.count(",")  for line in lines[:20])
    return "\t" if tabs >= commas else ","


def _normalise_channel(name: str) -> str:
    key = name.strip().strip('"\'').lower().replace("  ", " ")
    return CHANNEL_ALIASES.get(key, name.strip().strip('"\''))


def _is_numeric(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False


def _detect_forced_induction(rows: list[dict]) -> bool:
    for row in rows:
        map_val   = row.get("MAP")
        boost_val = row.get("Boost")
        if isinstance(map_val,   (int, float)) and map_val   > 110:
            return True
        if isinstance(boost_val, (int, float)) and boost_val > 2:
            return True
    return False
