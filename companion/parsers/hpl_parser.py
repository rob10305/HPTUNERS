"""
Sprint 5 — VCM Scanner .hpl datalog parser.
HPL files are tab-separated text with a header block followed by channel columns.
"""

from pathlib import Path

# Aliases: normalise variant channel names to canonical keys
CHANNEL_ALIASES: dict[str, str] = {
    # RPM
    "engine speed": "RPM", "enginespeed": "RPM", "rpm": "RPM",
    # TPS
    "throttle position": "TPS", "throttleposition": "TPS", "throttle pos": "TPS",
    # MAP
    "manifold absolute pressure": "MAP", "map kpa": "MAP", "boost pressure": "MAP",
    # MAF
    "mass air flow": "MAF", "massairflow": "MAF", "maf g/s": "MAF",
    # IAT
    "intake air temperature": "IAT", "intakeairtemp": "IAT", "iat °c": "IAT", "iat c": "IAT",
    # CLT
    "coolant temperature": "CLT", "enginecoolanttemp": "CLT", "ect °c": "CLT", "ect c": "CLT",
    # STFT / LTFT
    "short term fuel trim bank 1": "STFT_B1", "stft b1": "STFT_B1",
    "long term fuel trim bank 1":  "LTFT_B1", "ltft b1": "LTFT_B1",
    "short term fuel trim bank 2": "STFT_B2", "stft b2": "STFT_B2",
    "long term fuel trim bank 2":  "LTFT_B2", "ltft b2": "LTFT_B2",
    # Knock
    "knock retard":          "KnockRetard",
    "knock retard cyl avg":  "KnockRetard",
    "knock activity":        "KnockRetard",
    # Wideband / O2
    "wideband afr":          "WB_AFR",
    "o2 sensor":             "WB_AFR",
    "lambda":                "WB_AFR",
    # Injector PW
    "injector pulse width":  "InjPW",
    "inj pw ms":             "InjPW",
    # VE
    "ve":                    "VE",
    "volumetric efficiency": "VE",
}

RPM_LIKE = {"rpm", "engine speed", "enginespeed"}
MAP_LIKE = {"map", "manifold absolute pressure", "map kpa", "boost pressure"}
TPS_LIKE = {"tps", "throttle position", "throttleposition", "throttle pos"}


def parse_hpl(filepath: str) -> dict:
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    # Detect separator (tab or comma)
    sep = _detect_separator(lines)

    # Find the header row
    header_row = None
    data_start  = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        cols = stripped.split(sep)
        # Header row contains recognisable channel names
        lower_cols = [c.lower().strip() for c in cols]
        hits = sum(
            1 for c in lower_cols
            if any(kw in c for kw in list(RPM_LIKE) + list(MAP_LIKE) + list(TPS_LIKE) + ["rpm"])
        )
        if hits > 0 or (len(cols) >= 3 and i < 20):
            header_row = cols
            data_start = i + 1
            break

    if not header_row:
        raise ValueError(
            "Could not find data headers in .hpl file. "
            "Ensure this is a VCM Scanner datalog exported as .hpl or tab-separated text."
        )

    # Normalise header names
    normalised_headers = [_normalise_channel(h) for h in header_row]

    # Parse data rows
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
                row[col] = float(values[idx].strip()) if idx < len(values) else None
            except (ValueError, IndexError):
                row[col] = None
        rows.append(row)

    # Detect boost from MAP > 110 kPa
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


# ── Helpers ────────────────────────────────────────────────────────────────────

def _detect_separator(lines: list[str]) -> str:
    tabs   = sum(line.count("\t") for line in lines[:20])
    commas = sum(line.count(",")  for line in lines[:20])
    return "\t" if tabs >= commas else ","


def _normalise_channel(name: str) -> str:
    key = name.strip().lower()
    return CHANNEL_ALIASES.get(key, name.strip())


def _detect_forced_induction(rows: list[dict]) -> bool:
    for row in rows:
        map_val = row.get("MAP")
        if isinstance(map_val, (int, float)) and map_val > 110:
            return True
    return False
