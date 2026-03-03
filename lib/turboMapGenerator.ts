import type {
  TuneData,
  TurboConversionInputs,
  TurboMapResult,
  CellModification,
} from '@/types/tuneData'

// ─── Constants ─────────────────────────────────────────────────────────────────

const ATMOSPHERIC_PSI = 14.7

/**
 * Standard GM RPM breakpoints used in HP Tuners VE/spark tables.
 * These are estimates — actual axis values depend on the specific calibration.
 */
const RPM_AXIS_24: number[] = [
  400, 800, 1200, 1600, 2000, 2400, 2800, 3200,
  3600, 4000, 4400, 4800, 5200, 5600, 6000, 6400,
  6800, 7200, 7600, 8000, 8400, 8800, 9200, 9600,
]
const RPM_AXIS_16: number[] = [
  500, 1000, 1500, 2000, 2500, 3000, 3500, 4000,
  4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000,
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Estimate the RPM axis from the number of table columns. */
function estimateRPMAxis(colCount: number): number[] {
  if (colCount === 24) return RPM_AXIS_24
  if (colCount === 16) return RPM_AXIS_16
  // Generic linear interpolation from 500 to 7500 RPM
  return Array.from({ length: colCount }, (_, i) =>
    Math.round(500 + (i * 7000) / Math.max(colCount - 1, 1))
  )
}

/** Find the first column index at or above a given RPM value. */
function spoolColumnIndex(rpmAxis: number[], spoolRPM: number): number {
  const idx = rpmAxis.findIndex((rpm) => rpm >= spoolRPM)
  return idx === -1 ? rpmAxis.length : idx
}

/** Deep-clone a 2D number array. */
function clone2D(table: number[][]): number[][] {
  return table.map((row) => [...row])
}

/** Linear interpolation between a and b. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

/** Build the modifiedCellIndex lookup from a flat modifications list. */
function buildIndex(mods: CellModification[]): Record<string, Set<string>> {
  const index: Record<string, Set<string>> = {}
  for (const m of mods) {
    if (!index[m.table]) index[m.table] = new Set()
    index[m.table].add(`${m.row},${m.col}`)
  }
  return index
}

// ─── Individual table modifiers ───────────────────────────────────────────────

/**
 * VE table: scale all values by (1 + boostRatio * 0.85) above spool RPM.
 * Leave NA values below spool unchanged.
 */
function modifyVE(
  original: number[][],
  inputs: TurboConversionInputs,
  mods: CellModification[]
): number[][] {
  const boostRatio = inputs.turboPSI / ATMOSPHERIC_PSI
  const scaleFactor = 1 + boostRatio * 0.85

  const rpmAxis = estimateRPMAxis(original[0]?.length ?? 0)
  const spoolCol = spoolColumnIndex(rpmAxis, inputs.turboSpoolRPM)

  const modified = clone2D(original)

  for (let r = 0; r < modified.length; r++) {
    for (let c = spoolCol; c < modified[r].length; c++) {
      const orig = modified[r][c]
      const scaled = +(orig * scaleFactor).toFixed(2)
      if (scaled !== orig) {
        mods.push({ table: 'VE', row: r, col: c, originalValue: orig, newValue: scaled })
        modified[r][c] = scaled
      }
    }
  }

  return modified
}

/**
 * WOT_AFR: set lambda targets to fuel-appropriate value above spool RPM.
 * The WOT_AFR table is 1D (RPM-indexed). We treat the index as a column.
 */
function modifyWOT_AFR(
  original: number[],
  inputs: TurboConversionInputs,
  mods: CellModification[]
): number[] {
  const targetLambda =
    inputs.fuelType === 'E85' ? 0.75
    : inputs.fuelType === 'E30' ? 0.78
    : 0.80 // pump91

  const rpmAxis = estimateRPMAxis(original.length)
  const spoolCol = spoolColumnIndex(rpmAxis, inputs.turboSpoolRPM)

  const modified = [...original]

  for (let c = spoolCol; c < modified.length; c++) {
    const orig = modified[c]
    if (Math.abs(orig - targetLambda) > 0.001) {
      mods.push({ table: 'WOT_AFR', row: 0, col: c, originalValue: orig, newValue: targetLambda })
      modified[c] = targetLambda
    }
  }

  return modified
}

/**
 * Spark table: reduce WOT rows by fuel-specific degree amount above spool RPM.
 * WOT rows = top 25% of load rows (highest load, last quarter of rows).
 */
function modifySpark(
  original: number[][],
  inputs: TurboConversionInputs,
  mods: CellModification[]
): number[][] {
  const timingReduction =
    inputs.fuelType === 'E85' ? 3
    : inputs.fuelType === 'E30' ? 4
    : 6 // pump91

  const rpmAxis = estimateRPMAxis(original[0]?.length ?? 0)
  const spoolCol = spoolColumnIndex(rpmAxis, inputs.turboSpoolRPM)

  // WOT rows: top 25% of load rows (round up to at least 1)
  const wotRowStart = Math.max(0, Math.ceil(original.length * 0.75))

  const modified = clone2D(original)

  for (let r = wotRowStart; r < modified.length; r++) {
    for (let c = spoolCol; c < modified[r].length; c++) {
      const orig = modified[r][c]
      if (!isFinite(orig) || orig <= 0) continue
      const reduced = +Math.max(0, orig - timingReduction).toFixed(2)
      if (reduced !== orig) {
        mods.push({ table: 'spark', row: r, col: c, originalValue: orig, newValue: reduced })
        modified[r][c] = reduced
      }
    }
  }

  return modified
}

/**
 * IAT correction: steepen slope by 15% for the hot half of the table.
 * Without axis values, we treat the second half of rows as >40°C.
 */
function modifyIATCorrection(
  original: number[][],
  mods: CellModification[]
): number[][] {
  if (original.length === 0) return original

  const hotRowStart = Math.floor(original.length / 2)
  const modified = clone2D(original)

  for (let r = hotRowStart; r < modified.length; r++) {
    for (let c = 0; c < modified[r].length; c++) {
      const orig = modified[r][c]
      if (!isFinite(orig)) continue
      // Steepen correction: values < 0 (reducing fuel) get 15% more negative
      // Values > 0 (enriching) get 15% more positive
      const steepened = +(orig * 1.15).toFixed(3)
      if (Math.abs(steepened - orig) > 0.0001) {
        mods.push({ table: 'IAT_correction', row: r, col: c, originalValue: orig, newValue: steepened })
        modified[r][c] = steepened
      }
    }
  }

  return modified
}

/**
 * Generate a boost target table from scratch.
 * Structure: rows = load levels, cols = RPM axis.
 * Values: 0 PSI below spool RPM, ramp to target PSI by spool+500 RPM, hold at target above that.
 */
function generateBoostTarget(
  inputs: TurboConversionInputs,
  refColCount: number,
  mods: CellModification[]
): number[][] {
  const colCount = refColCount > 0 ? refColCount : 16
  const rowCount = 4 // load breakpoints: 0%, 33%, 66%, 100% TPS
  const rpmAxis = estimateRPMAxis(colCount)

  const table: number[][] = Array.from({ length: rowCount }, () => new Array(colCount).fill(0))

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const rpm = rpmAxis[c]
      let value: number

      if (rpm < inputs.turboSpoolRPM) {
        value = 0
      } else if (rpm < inputs.turboSpoolRPM + 500) {
        const t = (rpm - inputs.turboSpoolRPM) / 500
        value = +lerp(0, inputs.turboPSI, t).toFixed(1)
      } else {
        value = inputs.turboPSI
      }

      if (value !== 0) {
        mods.push({ table: 'boostTarget', row: r, col: c, originalValue: 0, newValue: value })
      }
      table[r][c] = value
    }
  }

  return table
}

/**
 * Generate a conservative wastegate duty cycle table.
 * Row 0: at target boost → 30% DC
 * Row 1: at target + 2 PSI → 50% DC
 * Both rows span the full RPM axis.
 */
function generateWastegateDC(
  inputs: TurboConversionInputs,
  refColCount: number,
  mods: CellModification[]
): number[][] {
  const colCount = refColCount > 0 ? refColCount : 16

  const table: number[][] = [
    new Array(colCount).fill(30), // 30% DC at target boost
    new Array(colCount).fill(50), // 50% DC at target + 2 PSI
  ]

  for (let r = 0; r < table.length; r++) {
    for (let c = 0; c < colCount; c++) {
      mods.push({
        table: 'wastegate_DC',
        row: r,
        col: c,
        originalValue: 0,
        newValue: table[r][c],
      })
    }
  }

  return table
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function generateTurboMap(
  originalTuneData: TuneData,
  inputs: TurboConversionInputs
): TurboMapResult {
  const mods: CellModification[] = []
  const warnings: string[] = []
  const modifiedTables: string[] = []

  // Deep-clone the tune data so we never mutate the original
  const modifiedTuneData: TuneData = {
    ...originalTuneData,
    tables: { ...originalTuneData.tables },
    rawFlags: { ...originalTuneData.rawFlags, isForcedInduction: true, hasBoostControl: true },
  }

  const refColCount =
    originalTuneData.tables.VE?.[0]?.length ??
    originalTuneData.tables.spark?.[0]?.length ??
    16

  // ── VE table ──────────────────────────────────────────────────────────────
  if (originalTuneData.tables.VE && originalTuneData.tables.VE.length > 0) {
    const modsBefore = mods.length
    modifiedTuneData.tables.VE = modifyVE(originalTuneData.tables.VE, inputs, mods)
    if (mods.length > modsBefore) modifiedTables.push('VE')
  } else {
    warnings.push('VE table not present in source tune — VE scaling skipped. Upload a VE table for complete map generation.')
  }

  // ── WOT_AFR table ─────────────────────────────────────────────────────────
  if (originalTuneData.tables.WOT_AFR && originalTuneData.tables.WOT_AFR.length > 0) {
    const modsBefore = mods.length
    modifiedTuneData.tables.WOT_AFR = modifyWOT_AFR(originalTuneData.tables.WOT_AFR, inputs, mods)
    if (mods.length > modsBefore) modifiedTables.push('WOT_AFR')
  } else {
    // Generate a flat WOT_AFR table from scratch
    const targetLambda =
      inputs.fuelType === 'E85' ? 0.75
      : inputs.fuelType === 'E30' ? 0.78
      : 0.80
    const newTable = new Array(refColCount).fill(targetLambda)
    const rpmAxis = estimateRPMAxis(refColCount)
    const spoolCol = spoolColumnIndex(rpmAxis, inputs.turboSpoolRPM)
    for (let c = 0; c < refColCount; c++) {
      // Below spool: use conservative pump-gas NA target (0.87λ)
      newTable[c] = c < spoolCol ? 0.87 : targetLambda
      mods.push({ table: 'WOT_AFR', row: 0, col: c, originalValue: 0, newValue: newTable[c] })
    }
    modifiedTuneData.tables.WOT_AFR = newTable
    modifiedTables.push('WOT_AFR')
    warnings.push('WOT_AFR table was not present — generated a new baseline table.')
  }

  // ── Spark table ───────────────────────────────────────────────────────────
  if (originalTuneData.tables.spark && originalTuneData.tables.spark.length > 0) {
    const modsBefore = mods.length
    modifiedTuneData.tables.spark = modifySpark(originalTuneData.tables.spark, inputs, mods)
    if (mods.length > modsBefore) modifiedTables.push('spark')
  } else {
    warnings.push('Spark table not present in source tune — timing reduction skipped. This is critical: manually reduce WOT timing before boosted operation.')
  }

  // ── Injector flow ─────────────────────────────────────────────────────────
  const origInjector = originalTuneData.tables.injectorFlow ?? 0
  if (inputs.newInjector_cc !== origInjector) {
    mods.push({
      table: 'injectorFlow',
      row: 0,
      col: 0,
      originalValue: origInjector,
      newValue: inputs.newInjector_cc,
    })
    modifiedTuneData.tables.injectorFlow = inputs.newInjector_cc
    modifiedTables.push('injectorFlow')
  }

  // ── IAT correction ────────────────────────────────────────────────────────
  if (originalTuneData.tables.IAT_correction && originalTuneData.tables.IAT_correction.length > 0) {
    const modsBefore = mods.length
    modifiedTuneData.tables.IAT_correction = modifyIATCorrection(
      originalTuneData.tables.IAT_correction,
      mods
    )
    if (mods.length > modsBefore) modifiedTables.push('IAT_correction')
  } else {
    warnings.push('IAT correction table not present — heat soak correction not applied. Add IAT correction before boosted operation, especially without an intercooler.')
    if (!inputs.hasIntercooler) {
      warnings.push('WARNING: No intercooler configured and no IAT correction table. Inlet air temperatures under boost will be significantly elevated, risking detonation.')
    }
  }

  // ── Rev limit — leave unchanged, add flag ────────────────────────────────
  if (originalTuneData.tables.revLimit) {
    warnings.push(
      `Rev limit is ${originalTuneData.tables.revLimit} RPM — left unchanged. Review and adjust for your specific turbo application, cam, and head flow capability.`
    )
  }

  // ── Boost target (generated) ──────────────────────────────────────────────
  {
    const modsBefore = mods.length
    modifiedTuneData.tables.boostTarget = generateBoostTarget(inputs, refColCount, mods)
    if (mods.length > modsBefore) modifiedTables.push('boostTarget')
  }

  // ── Wastegate DC (generated) ──────────────────────────────────────────────
  {
    const modsBefore = mods.length
    modifiedTuneData.tables.wastegate_DC = generateWastegateDC(inputs, refColCount, mods)
    if (mods.length > modsBefore) modifiedTables.push('wastegate_DC')
    warnings.push(
      `Wastegate DC table generated conservatively (30% at ${inputs.turboPSI} PSI, 50% at ${inputs.turboPSI + 2} PSI). Actual values require boost control tuning on a dyno.`
    )
  }

  // ── Intercooler note ──────────────────────────────────────────────────────
  if (!inputs.hasIntercooler) {
    warnings.push(
      'No intercooler: boost target and timing are conservative starting points. Charge air temperatures will be high — do not increase boost or timing without an intercooler fitted.'
    )
  }

  // ── Safety warnings always added ─────────────────────────────────────────
  warnings.push(
    '⚠️ This is a STARTING POINT baseline only. Do NOT operate at WOT until verified on a dynamometer with wideband O2 and knock monitoring.',
    '⚠️ All modified values assume stock compression ratio and minimum octane for the selected fuel type. Verify before use.',
    '⚠️ Fuelling calibration (VE table, MAF scaling) must be verified by a qualified tuner before any full-power runs.'
  )

  return {
    modifiedTuneData,
    modifications: mods,
    modifiedCellIndex: buildIndex(mods),
    modifiedTables,
    warnings,
  }
}
