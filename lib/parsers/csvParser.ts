import Papa from 'papaparse'
import type { TuneData } from '@/types/tuneData'

interface LabelledFile {
  file: File
  label: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isNumeric(val: string): boolean {
  return val.trim() !== '' && !isNaN(Number(val.trim()))
}

/**
 * From a 2D string array (all rows/cols from PapaParse), extract the numeric
 * data region as a number[][].  Skips header rows and skips the first column
 * if it looks like a row-axis label column.
 */
function extractGrid(rows: string[][]): number[][] {
  const dataRows = rows.filter((row) => row.some((cell) => isNumeric(cell)))

  return dataRows
    .map((row) => {
      // Skip first cell if it looks like a label (non-numeric) or axis value we don't need
      const start = isNumeric(row[0]) ? 0 : 1
      return row.slice(start).filter((c) => c.trim() !== '').map(Number)
    })
    .filter((row) => row.length > 0)
}

/**
 * Extract a flat 1D numeric array — used for MAF, WOT_AFR, injectorDeadTime.
 */
function extractFlat(rows: string[][]): number[] {
  const grid = extractGrid(rows)
  return grid.flat()
}

/**
 * Extract a single scalar value — used for injectorFlow, revLimit, fuelCut.
 */
function extractScalar(rows: string[][]): number | undefined {
  const flat = extractFlat(rows)
  return flat.length > 0 ? flat[0] : undefined
}

// ─── Label → table mapping ───────────────────────────────────────────────────

type TableKey = keyof TuneData['tables']

const LABEL_MAP: Record<string, { key: TableKey; dim: '2d' | '1d' | 'scalar' }> = {
  'VE Table': { key: 'VE', dim: '2d' },
  'Spark Table': { key: 'spark', dim: '2d' },
  'MAF Table': { key: 'MAF', dim: '1d' },
  'WOT AFR': { key: 'WOT_AFR', dim: '1d' },
  'IAT Correction': { key: 'IAT_correction', dim: '2d' },
  'Injector Flow': { key: 'injectorFlow', dim: 'scalar' },
  'Boost Target': { key: 'boostTarget', dim: '2d' },
  'Wastegate DC': { key: 'wastegate_DC', dim: '2d' },
}

// ─── Main parser ─────────────────────────────────────────────────────────────

async function parseOneCSV(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(new Error(`PapaParse error: ${err.message}`)),
    })
  })
}

export async function parseCSV(labelledFiles: LabelledFile[]): Promise<TuneData> {
  const tables: TuneData['tables'] = {}
  let hasBoostTables = false

  for (const { file, label } of labelledFiles) {
    const mapping = LABEL_MAP[label]
    if (!mapping) continue // "Other" — skip

    let rows: string[][]
    try {
      rows = await parseOneCSV(file)
    } catch {
      console.warn(`Failed to parse CSV "${file.name}", skipping`)
      continue
    }

    if (rows.length === 0) continue

    if (mapping.dim === '2d') {
      const grid = extractGrid(rows)
      if (grid.length > 0) {
        ;(tables as Record<string, unknown>)[mapping.key] = grid
        if (mapping.key === 'boostTarget' || mapping.key === 'wastegate_DC') {
          hasBoostTables = true
        }
      }
    } else if (mapping.dim === '1d') {
      const arr = extractFlat(rows)
      if (arr.length > 0) {
        ;(tables as Record<string, unknown>)[mapping.key] = arr
      }
    } else {
      const scalar = extractScalar(rows)
      if (scalar !== undefined) {
        ;(tables as Record<string, unknown>)[mapping.key] = scalar
      }
    }
  }

  const injectorFlow = tables.injectorFlow ?? null

  return {
    source: 'csv',
    vehicle: {
      osVersion: null,
      ecuType: null,
      vin: null,
      platform: null,
    },
    tables,
    rawFlags: {
      isForcedInduction: hasBoostTables,
      hasFlexFuel: false,
      hasBoostControl: hasBoostTables,
      detectedInjectorSize_cc: injectorFlow ?? null,
    },
  }
}
