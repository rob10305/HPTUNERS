import type { TuneData } from '@/types/tuneData'
import osOffsets from '@/lib/osOffsets.json'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TableOffset2D {
  offset: number
  rows: number
  cols: number
  type: 'float32' | 'uint16'
  scale?: number
}

interface TableOffset1D {
  offset: number
  count: number
  type: 'float32' | 'uint16'
  scale?: number
}

interface TableOffsetScalar {
  offset: number
  type: 'float32' | 'uint16'
  scale?: number
}

interface OSEntry {
  label: string
  VE?: TableOffset2D
  spark?: TableOffset2D
  MAF?: TableOffset1D
  injectorFlow?: TableOffsetScalar
  WOT_AFR?: TableOffset1D
  injectorDeadTime?: TableOffset1D
  IAT_correction?: TableOffset2D
  boostTarget?: TableOffset2D
  wastegate_DC?: TableOffset2D
  revLimit?: TableOffsetScalar
  fuelCut?: TableOffsetScalar
}

const OS_DB = osOffsets as Record<string, OSEntry>

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Scan up to 512 bytes for sequences that look like an 8-digit GM OS version
 * (e.g. "12632454").  Returns first match or null.
 */
function detectOSVersion(view: DataView, scanBytes = 512): string | null {
  const limit = Math.min(scanBytes, view.byteLength)
  let run = ''

  for (let i = 0; i < limit; i++) {
    const c = view.getUint8(i)
    const ch = String.fromCharCode(c)
    if (c >= 48 && c <= 57) {
      // ASCII digit
      run += ch
      if (run.length === 8 && OS_DB[run]) return run
      if (run.length > 8) run = run.slice(1) // sliding window
    } else {
      if (run.length === 8 && OS_DB[run]) return run
      run = ''
    }
  }
  return null
}

function readFloat32(view: DataView, offset: number, littleEndian = false): number {
  if (offset + 4 > view.byteLength) return NaN
  return view.getFloat32(offset, littleEndian)
}

function readUint16(view: DataView, offset: number, littleEndian = false): number {
  if (offset + 2 > view.byteLength) return NaN
  return view.getUint16(offset, littleEndian)
}

function read2DTable(
  view: DataView,
  def: TableOffset2D,
  littleEndian = false
): number[][] | null {
  const { offset, rows, cols, type, scale = 1 } = def
  const bytesPerCell = type === 'float32' ? 4 : 2
  const totalBytes = rows * cols * bytesPerCell

  if (offset + totalBytes > view.byteLength) {
    console.warn(`BIN: 2D table at offset ${offset} exceeds file size`)
    return null
  }

  const grid: number[][] = []
  let pos = offset

  for (let r = 0; r < rows; r++) {
    const row: number[] = []
    for (let c = 0; c < cols; c++) {
      const raw =
        type === 'float32'
          ? readFloat32(view, pos, littleEndian)
          : readUint16(view, pos, littleEndian)
      row.push(isNaN(raw) ? 0 : raw * scale)
      pos += bytesPerCell
    }
    grid.push(row)
  }

  return grid
}

function read1DArray(
  view: DataView,
  def: TableOffset1D,
  littleEndian = false
): number[] | null {
  const { offset, count, type, scale = 1 } = def
  const bytesPerCell = type === 'float32' ? 4 : 2
  const totalBytes = count * bytesPerCell

  if (offset + totalBytes > view.byteLength) {
    console.warn(`BIN: 1D array at offset ${offset} exceeds file size`)
    return null
  }

  const arr: number[] = []
  let pos = offset

  for (let i = 0; i < count; i++) {
    const raw =
      type === 'float32'
        ? readFloat32(view, pos, littleEndian)
        : readUint16(view, pos, littleEndian)
    arr.push(isNaN(raw) ? 0 : raw * scale)
    pos += bytesPerCell
  }

  return arr
}

function readScalar(
  view: DataView,
  def: TableOffsetScalar,
  littleEndian = false
): number | null {
  const { offset, type, scale = 1 } = def
  const raw =
    type === 'float32'
      ? readFloat32(view, offset, littleEndian)
      : readUint16(view, offset, littleEndian)

  return isNaN(raw) ? null : raw * scale
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export async function parseBIN(file: File): Promise<TuneData> {
  const buffer = await file.arrayBuffer()
  const view = new DataView(buffer)

  const osVersion = detectOSVersion(view)

  if (!osVersion) {
    return {
      source: 'bin',
      vehicle: {
        osVersion: null,
        ecuType: null,
        vin: null,
        platform: null,
      },
      tables: {},
      rawFlags: {
        isForcedInduction: false,
        hasFlexFuel: false,
        hasBoostControl: false,
        detectedInjectorSize_cc: null,
      },
      _parseWarning:
        'OS version not recognised. All tables set to null. Use CSV fallback for manual table entry.',
    } as TuneData & { _parseWarning: string }
  }

  const entry = OS_DB[osVersion]

  // GM PCMs are big-endian — use littleEndian=false (default)
  const littleEndian = false

  const tables: TuneData['tables'] = {}

  if (entry.VE) {
    const t = read2DTable(view, entry.VE, littleEndian)
    if (t) tables.VE = t
  }
  if (entry.spark) {
    const t = read2DTable(view, entry.spark, littleEndian)
    if (t) tables.spark = t
  }
  if (entry.MAF) {
    const t = read1DArray(view, entry.MAF, littleEndian)
    if (t) tables.MAF = t
  }
  if (entry.injectorFlow) {
    const t = readScalar(view, entry.injectorFlow, littleEndian)
    if (t !== null) tables.injectorFlow = t
  }
  if (entry.WOT_AFR) {
    const t = read1DArray(view, entry.WOT_AFR, littleEndian)
    if (t) tables.WOT_AFR = t
  }
  if (entry.IAT_correction) {
    const t = read2DTable(view, entry.IAT_correction, littleEndian)
    if (t) tables.IAT_correction = t
  }
  if (entry.boostTarget) {
    const t = read2DTable(view, entry.boostTarget, littleEndian)
    if (t) tables.boostTarget = t
  }
  if (entry.wastegate_DC) {
    const t = read2DTable(view, entry.wastegate_DC, littleEndian)
    if (t) tables.wastegate_DC = t
  }
  if (entry.revLimit) {
    const t = readScalar(view, entry.revLimit, littleEndian)
    if (t !== null) tables.revLimit = t
  }
  if (entry.fuelCut) {
    const t = readScalar(view, entry.fuelCut, littleEndian)
    if (t !== null) tables.fuelCut = t
  }

  const hasBoostTables = !!(tables.boostTarget || tables.wastegate_DC)

  return {
    source: 'bin',
    vehicle: {
      osVersion,
      ecuType: entry.label,
      vin: null,
      platform: osVersion === '12632454' ? 'GM LS3' : osVersion === '12586243' ? 'GM LS1' : null,
    },
    tables,
    rawFlags: {
      isForcedInduction: hasBoostTables,
      hasFlexFuel: false,
      hasBoostControl: hasBoostTables,
      detectedInjectorSize_cc: tables.injectorFlow ?? null,
    },
  }
}
