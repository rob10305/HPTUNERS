import type { TuneData } from '@/types/tuneData'

// ─── Channel name aliases ─────────────────────────────────────────────────────
// HP Tuners uses various channel names — map them to canonical keys

const CHANNEL_ALIASES: Record<string, string> = {
  // RPM
  'engine speed': 'RPM',
  'engine speed (rpm)': 'RPM',
  rpm: 'RPM',
  'engine rpm': 'RPM',

  // TPS
  tps: 'TPS',
  'throttle position': 'TPS',
  'throttle position (%)': 'TPS',
  'throttle pos.': 'TPS',

  // MAP
  map: 'MAP',
  'manifold absolute pressure': 'MAP',
  'map (kpa)': 'MAP',
  'map (psi)': 'MAP',

  // MAF
  maf: 'MAF',
  'mass air flow': 'MAF',
  'maf (g/s)': 'MAF',

  // STFT
  stft: 'STFT',
  'short term fuel trim': 'STFT',
  'stft (%)': 'STFT',
  'fuel trim short term': 'STFT',
  'st fuel trim': 'STFT',

  // LTFT
  ltft: 'LTFT',
  'long term fuel trim': 'LTFT',
  'ltft (%)': 'LTFT',
  'fuel trim long term': 'LTFT',
  'lt fuel trim': 'LTFT',

  // O2 / Lambda
  o2: 'Lambda',
  lambda: 'Lambda',
  'o2 sensor': 'Lambda',
  'o2 (v)': 'Lambda',
  'wideband o2': 'Lambda',
  afr: 'Lambda',
  'air fuel ratio': 'Lambda',
  'equivalence ratio': 'Lambda',

  // Knock
  knock: 'KnockRetard',
  'knock retard': 'KnockRetard',
  'knock retard (deg)': 'KnockRetard',
  'spark knock retard': 'KnockRetard',
  'knock activity': 'KnockRetard',

  // IAT
  iat: 'IAT',
  'intake air temp': 'IAT',
  'intake air temperature': 'IAT',
  'iat (°c)': 'IAT',
  'iat (°f)': 'IAT',
  'air temperature': 'IAT',

  // Coolant
  coolant: 'Coolant',
  'engine coolant temperature': 'Coolant',
  ect: 'Coolant',
  'coolant temp': 'Coolant',
  'coolant (°c)': 'Coolant',
  'coolant (°f)': 'Coolant',

  // Boost
  boost: 'Boost',
  'boost pressure': 'Boost',
  'boost (psi)': 'Boost',
  'turbo boost': 'Boost',
  'manifold pressure': 'Boost',
}

const WANTED_CHANNELS = new Set([
  'RPM', 'TPS', 'MAP', 'MAF', 'STFT', 'LTFT',
  'Lambda', 'KnockRetard', 'IAT', 'Coolant', 'Boost',
])

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isDataRow(cells: string[]): boolean {
  // A data row has at least one cell that parses as a finite number
  return cells.some((c) => {
    const n = parseFloat(c.trim())
    return isFinite(n)
  })
}

function splitLine(line: string): string[] {
  // Handle both tab and comma delimiters
  if (line.includes('\t')) return line.split('\t')
  return line.split(',')
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export async function parseHPL(file: File): Promise<TuneData> {
  const text = await file.text()
  const lines = text.split(/\r?\n/)

  let headerRowIndex = -1
  let columnHeaders: string[] = []

  // Scan forward to find the column header row — look for a row that contains
  // known channel keywords, or the row just before the first all-numeric row
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cells = splitLine(lines[i])
    const normalised = cells.map(normaliseHeader)

    // Check if this row looks like a header (contains channel keywords)
    const matchCount = normalised.filter(
      (n) => CHANNEL_ALIASES[n] || WANTED_CHANNELS.has(n)
    ).length

    if (matchCount >= 2) {
      headerRowIndex = i
      columnHeaders = cells
      break
    }

    // Fallback: if next row is all-numeric, treat current row as headers
    if (i + 1 < lines.length) {
      const nextCells = splitLine(lines[i + 1])
      if (isDataRow(nextCells) && cells.length >= 2) {
        headerRowIndex = i
        columnHeaders = cells
        break
      }
    }
  }

  if (headerRowIndex === -1 || columnHeaders.length === 0) {
    // No structured header found — return empty datalog
    return buildEmptyTuneData('No channel header row found in .hpl file')
  }

  // Map column index → canonical channel name
  const colMap: Record<number, string> = {}
  columnHeaders.forEach((h, i) => {
    const canonical = CHANNEL_ALIASES[normaliseHeader(h)] ?? null
    if (canonical && WANTED_CHANNELS.has(canonical)) {
      colMap[i] = canonical
    }
  })

  const foundChannels = Object.values(colMap)

  if (foundChannels.length === 0) {
    return buildEmptyTuneData('No recognised channels found in .hpl file')
  }

  // Parse data rows
  const dataRows: Record<string, number>[] = []

  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const cells = splitLine(line)
    if (!isDataRow(cells)) continue

    const row: Record<string, number> = {}
    for (const [idxStr, channel] of Object.entries(colMap)) {
      const idx = Number(idxStr)
      const raw = cells[idx]?.trim()
      if (raw !== undefined && raw !== '') {
        const n = parseFloat(raw)
        if (isFinite(n)) row[channel] = n
      }
    }
    if (Object.keys(row).length > 0) dataRows.push(row)
  }

  // Infer forced induction from MAP/Boost values
  const maxMAP = dataRows.reduce((m, r) => Math.max(m, r.MAP ?? 0), 0)
  const maxBoost = dataRows.reduce((m, r) => Math.max(m, r.Boost ?? 0), 0)
  // MAP > 110 kPa or any positive boost reading implies boost
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
