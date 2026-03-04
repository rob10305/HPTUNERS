import type { TuneData } from '@/types/tuneData'

// ─── Channel name aliases ─────────────────────────────────────────────────────
// HP Tuners VCM Scanner exports many variations — map them all to canonical keys.
// Aliases are matched after: trim, lowercase, strip surrounding quotes,
// collapse whitespace, remove trailing units in parentheses.

const CHANNEL_ALIASES: Record<string, string> = {
  // ── RPM ───────────────────────────────────────────────────────────────────
  'engine speed': 'RPM',
  'engine speed (rpm)': 'RPM',
  'enginespeed': 'RPM',
  rpm: 'RPM',
  'engine rpm': 'RPM',
  'rpm (rpm)': 'RPM',
  'eng speed': 'RPM',

  // ── TPS ───────────────────────────────────────────────────────────────────
  tps: 'TPS',
  'throttle position': 'TPS',
  'throttle position (tps)': 'TPS',
  'throttle position (%)': 'TPS',
  'throttle pos.': 'TPS',
  'throttle pos': 'TPS',
  'throttle (%)': 'TPS',
  'tps (%)': 'TPS',

  // ── MAP ───────────────────────────────────────────────────────────────────
  map: 'MAP',
  'manifold absolute pressure': 'MAP',
  'map (kpa)': 'MAP',
  'map (psi)': 'MAP',
  'map pressure': 'MAP',
  'baro/map': 'MAP',
  'manifold pressure': 'MAP',
  'map sensor': 'MAP',

  // ── MAF ───────────────────────────────────────────────────────────────────
  maf: 'MAF',
  'mass air flow': 'MAF',
  'maf (g/s)': 'MAF',
  'mass airflow': 'MAF',
  'air flow': 'MAF',
  'airflow (g/s)': 'MAF',
  'maf sensor': 'MAF',

  // ── STFT ──────────────────────────────────────────────────────────────────
  stft: 'STFT',
  'short term fuel trim': 'STFT',
  'short term fuel trim (%)': 'STFT',
  'stft (%)': 'STFT',
  'fuel trim short term': 'STFT',
  'st fuel trim': 'STFT',
  'stft b1': 'STFT',
  'short term fuel trim b1': 'STFT',
  'short term ft bank 1': 'STFT',
  'fuel trim st b1': 'STFT',
  'stft bank 1': 'STFT',
  'short term fuel trim bank 1': 'STFT',
  'st fuel trim (bank 1)': 'STFT',

  // ── LTFT ──────────────────────────────────────────────────────────────────
  ltft: 'LTFT',
  'long term fuel trim': 'LTFT',
  'long term fuel trim (%)': 'LTFT',
  'ltft (%)': 'LTFT',
  'fuel trim long term': 'LTFT',
  'lt fuel trim': 'LTFT',
  'ltft b1': 'LTFT',
  'long term fuel trim b1': 'LTFT',
  'long term ft bank 1': 'LTFT',
  'fuel trim lt b1': 'LTFT',
  'ltft bank 1': 'LTFT',
  'long term fuel trim bank 1': 'LTFT',
  'lt fuel trim (bank 1)': 'LTFT',

  // ── Lambda / O2 / AFR ─────────────────────────────────────────────────────
  o2: 'Lambda',
  lambda: 'Lambda',
  'o2 sensor': 'Lambda',
  'o2 (v)': 'Lambda',
  'wideband o2': 'Lambda',
  afr: 'Lambda',
  'air fuel ratio': 'Lambda',
  'equivalence ratio': 'Lambda',
  'wideband afr': 'Lambda',
  'wb afr': 'Lambda',
  'o2 b1 s1': 'Lambda',
  'o2 sensor b1 s1': 'Lambda',
  'fueling - afr commanded': 'Lambda',
  'commanded afr': 'Lambda',
  'target afr': 'Lambda',
  'lambda (λ)': 'Lambda',

  // ── Knock ─────────────────────────────────────────────────────────────────
  knock: 'KnockRetard',
  'knock retard': 'KnockRetard',
  'knock retard (deg)': 'KnockRetard',
  'spark knock retard': 'KnockRetard',
  'knock activity': 'KnockRetard',
  'ks retard': 'KnockRetard',
  'knock sensor retard': 'KnockRetard',
  'knock retard cyl avg': 'KnockRetard',
  'knock retard avg': 'KnockRetard',
  'total knock retard': 'KnockRetard',
  'ignition - knock retard': 'KnockRetard',
  'knock retard (°)': 'KnockRetard',

  // ── IAT ───────────────────────────────────────────────────────────────────
  iat: 'IAT',
  'intake air temp': 'IAT',
  'intake air temperature': 'IAT',
  'iat (°c)': 'IAT',
  'iat (°f)': 'IAT',
  'iat (c)': 'IAT',
  'iat (f)': 'IAT',
  'air temperature': 'IAT',
  'inlet air temp': 'IAT',
  'air temp': 'IAT',
  'intake temp': 'IAT',
  'air temperature (°c)': 'IAT',
  'air temperature (°f)': 'IAT',

  // ── Coolant ───────────────────────────────────────────────────────────────
  coolant: 'Coolant',
  'engine coolant temperature': 'Coolant',
  ect: 'Coolant',
  'coolant temp': 'Coolant',
  'coolant (°c)': 'Coolant',
  'coolant (°f)': 'Coolant',
  'coolant temp (°c)': 'Coolant',
  'coolant temp (°f)': 'Coolant',
  'engine coolant temp': 'Coolant',
  'water temp': 'Coolant',
  'coolant temperature': 'Coolant',

  // ── Boost ─────────────────────────────────────────────────────────────────
  boost: 'Boost',
  'boost pressure': 'Boost',
  'boost (psi)': 'Boost',
  'boost (kpa)': 'Boost',
  'turbo boost': 'Boost',
  'boost pressure (psi)': 'Boost',
  'boost pressure (kpa)': 'Boost',
  'turbo boost pressure': 'Boost',
}

const WANTED_CHANNELS = new Set([
  'RPM', 'TPS', 'MAP', 'MAF', 'STFT', 'LTFT',
  'Lambda', 'KnockRetard', 'IAT', 'Coolant', 'Boost',
])

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip surrounding quotes, trim, lowercase, collapse whitespace. */
function normaliseHeader(h: string): string {
  return h
    .trim()
    .replace(/^["']|["']$/g, '')   // strip surrounding " or '
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Normalise then also try stripping trailing unit block e.g. " (rpm)" → try without it too. */
function canonicalise(raw: string): string | null {
  const norm = normaliseHeader(raw)

  // Direct match
  if (CHANNEL_ALIASES[norm]) return CHANNEL_ALIASES[norm]
  if (WANTED_CHANNELS.has(norm.toUpperCase())) return norm.toUpperCase()

  // Try stripping trailing "(units)" block
  const withoutUnits = norm.replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (withoutUnits !== norm && CHANNEL_ALIASES[withoutUnits]) return CHANNEL_ALIASES[withoutUnits]
  if (withoutUnits !== norm && WANTED_CHANNELS.has(withoutUnits.toUpperCase())) return withoutUnits.toUpperCase()

  return null
}

function looksNumeric(cell: string): boolean {
  const n = parseFloat(cell.trim().replace(/^["']|["']$/g, ''))
  return isFinite(n)
}

function isDataRow(cells: string[]): boolean {
  return cells.filter((c) => looksNumeric(c)).length >= Math.ceil(cells.length * 0.5)
}

function isUnitsRow(cells: string[]): boolean {
  // A units row has mostly non-numeric cells but no channel keyword hits
  const numericCount = cells.filter((c) => looksNumeric(c)).length
  if (numericCount > cells.length * 0.3) return false  // too many numbers → data row
  const channelHits = cells.filter((c) => canonicalise(c) !== null).length
  return channelHits === 0  // no channel names → probably units
}

function splitLine(line: string): string[] {
  // Prefer tab; fall back to comma
  if (line.includes('\t')) return line.split('\t')
  return line.split(',')
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export async function parseHPL(file: File): Promise<TuneData> {
  const text = await file.text()
  const lines = text.split(/\r?\n/)

  let headerRowIndex = -1
  let columnHeaders: string[] = []

  // ── Step 1: find the column header row ──────────────────────────────────
  // Strategy: scan every row; prefer the first row with ≥1 recognised channel.
  // Fallback: first row where any non-blank row within the next 3 lines is all-numeric.
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const cells = splitLine(line)
    if (cells.length < 2) continue

    // Count recognisable channel names (threshold: 1 is enough)
    const matchCount = cells.filter((c) => canonicalise(c) !== null).length

    if (matchCount >= 1) {
      headerRowIndex = i
      columnHeaders = cells
      break
    }

    // Lookahead fallback: look up to 3 rows ahead for a numeric row
    for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
      const nextLine = lines[j]
      if (!nextLine.trim()) continue
      if (isDataRow(splitLine(nextLine)) && cells.length >= 3) {
        headerRowIndex = i
        columnHeaders = cells
        break
      }
    }
    if (headerRowIndex !== -1) break
  }

  if (headerRowIndex === -1 || columnHeaders.length === 0) {
    return buildEmptyTuneData('No channel header row found in .hpl file')
  }

  // ── Step 2: map column index → canonical channel name ───────────────────
  const colMap: Record<number, string> = {}
  columnHeaders.forEach((h, i) => {
    const canonical = canonicalise(h)
    if (canonical && WANTED_CHANNELS.has(canonical)) {
      colMap[i] = canonical
    }
  })

  const foundChannels = Object.values(colMap)

  if (foundChannels.length === 0) {
    // Diagnostics can still try to run on an empty datalog;
    // return the raw channel list so the user knows what was found
    const rawNames = columnHeaders
      .map((h) => normaliseHeader(h))
      .filter((h) => h.length > 0)
      .slice(0, 10)
      .join(', ')
    return buildEmptyTuneData(
      `No recognised channels found in .hpl file. ` +
      `Columns detected: ${rawNames || '(none)'}. ` +
      `Check that this is a VCM Scanner datalog and that channel names match expected HP Tuners format.`
    )
  }

  // ── Step 3: parse data rows, skipping units row if present ──────────────
  const dataRows: Record<string, number>[] = []
  let skippedUnitsRow = false

  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const cells = splitLine(line)

    // Skip the units row (first non-blank row after header that has no channel hits and is not numeric)
    if (!skippedUnitsRow && isUnitsRow(cells)) {
      skippedUnitsRow = true
      continue
    }

    if (!isDataRow(cells)) continue

    const row: Record<string, number> = {}
    for (const [idxStr, channel] of Object.entries(colMap)) {
      const idx = Number(idxStr)
      const raw = cells[idx]?.trim().replace(/^["']|["']$/g, '')
      if (raw !== undefined && raw !== '') {
        const n = parseFloat(raw)
        if (isFinite(n)) row[channel] = n
      }
    }
    if (Object.keys(row).length > 0) dataRows.push(row)
  }

  // ── Step 4: derive flags ─────────────────────────────────────────────────
  const maxMAP   = dataRows.reduce((m, r) => Math.max(m, r.MAP   ?? 0), 0)
  const maxBoost = dataRows.reduce((m, r) => Math.max(m, r.Boost ?? 0), 0)
  const isForcedInduction = maxMAP > 110 || maxBoost > 2

  return {
    source: 'hpl',
    vehicle: {
      osVersion: null,
      ecuType: null,
      vin: null,
      platform: null,
    },
    tables: {},
    datalog: {
      channels: foundChannels,
      rows: dataRows,
    },
    rawFlags: {
      isForcedInduction,
      hasFlexFuel: false,
      hasBoostControl: isForcedInduction,
      detectedInjectorSize_cc: null,
    },
  }
}

function buildEmptyTuneData(warning: string): TuneData {
  return {
    source: 'hpl',
    vehicle: { osVersion: null, ecuType: null, vin: null, platform: null },
    tables: {},
    datalog: { channels: [], rows: [] },
    rawFlags: {
      isForcedInduction: false,
      hasFlexFuel: false,
      hasBoostControl: false,
      detectedInjectorSize_cc: null,
    },
    _parseWarning: warning,
  } as TuneData & { _parseWarning: string }
}
