import type { TuneData, HardwareProfile, DiagnosticResult } from '@/types/tuneData'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

function flatMax(arr: number[]): number {
  return arr.reduce((a, b) => Math.max(a, b), -Infinity)
}

function flatMin(arr: number[]): number {
  return arr.reduce((a, b) => Math.min(a, b), Infinity)
}

function datalogChannel(
  rows: Record<string, number>[] | undefined,
  channel: string
): number[] {
  if (!rows) return []
  return rows
    .map((r) => r[channel])
    .filter((v): v is number => v !== undefined && isFinite(v))
}

/** Build a result record with all required fields. */
function result(
  partial: Omit<DiagnosticResult, 'value' | 'limit' | 'tableRef'> &
    Partial<Pick<DiagnosticResult, 'value' | 'limit' | 'tableRef'>>
): DiagnosticResult {
  return {
    value: null,
    limit: null,
    tableRef: null,
    ...partial,
  }
}

// ─── Fuelling checks ─────────────────────────────────────────────────────────

function checkWOTLambda(tuneData: TuneData): DiagnosticResult[] {
  const results: DiagnosticResult[] = []
  const wotAFR = tuneData.tables.WOT_AFR
  if (!wotAFR || wotAFR.length === 0) {
    results.push(
      result({
        system: 'fuelling',
        check: 'WOT Lambda Target',
        status: 'info',
        severity: 1,
        finding: 'WOT AFR table not present — cannot evaluate WOT fuel target.',
        recommendation: 'Upload a WOT AFR / lambda table via CSV or .bin file.',
        tableRef: 'WOT_AFR',
      })
    )
    return results
  }

  const valid = wotAFR.filter((v) => v > 0.5 && v < 1.5)
  if (valid.length === 0) return results

  const maxLambda = flatMax(valid)
  const minLambda = flatMin(valid)
  const meanLambda = mean(valid)

  // Too lean at WOT
  if (maxLambda > 0.90) {
    results.push(
      result({
        system: 'fuelling',
        check: 'WOT Lambda Target — Too Lean',
        status: 'fail',
        severity: 4,
        finding: `WOT lambda reaches ${maxLambda.toFixed(3)}λ — dangerously lean at wide-open throttle. Risk of detonation and piston damage.`,
        recommendation: 'Reduce WOT lambda target to 0.82–0.87λ for pump gasoline, 0.78–0.82λ for E30, 0.74–0.78λ for E85.',
        tableRef: 'WOT_AFR',
        value: maxLambda,
        limit: 0.90,
      })
    )
  } else if (maxLambda > 0.85) {
    results.push(
      result({
        system: 'fuelling',
        check: 'WOT Lambda Target — Lean Warning',
        status: 'warn',
        severity: 3,
        finding: `WOT lambda peak is ${maxLambda.toFixed(3)}λ — leaner than recommended for reliable WOT operation.`,
        recommendation: 'Target WOT lambda should be 0.82–0.87λ for pump gasoline. Values above 0.87λ risk lean misfire or detonation under high load.',
        tableRef: 'WOT_AFR',
        value: maxLambda,
        limit: 0.85,
      })
    )
  }

  // Too rich at WOT
  if (minLambda < 0.75) {
    results.push(
      result({
        system: 'fuelling',
        check: 'WOT Lambda Target — Excessively Rich',
        status: 'warn',
        severity: 2,
        finding: `WOT lambda drops to ${minLambda.toFixed(3)}λ — excessively rich. This washes oil off cylinder walls and reduces power.`,
        recommendation: 'Unless running E85 (0.74–0.78λ is appropriate), raise WOT lambda target. Overly rich mixtures cause carbon buildup and oil dilution.',
        tableRef: 'WOT_AFR',
        value: minLambda,
        limit: 0.75,
      })
    )
  }

  // If all checks passed
  if (results.length === 0) {
    results.push(
      result({
        system: 'fuelling',
        check: 'WOT Lambda Target',
        status: 'pass',
        severity: 1,
        finding: `WOT lambda range ${minLambda.toFixed(3)}–${maxLambda.toFixed(3)}λ (mean ${meanLambda.toFixed(3)}λ) — within acceptable range.`,
        recommendation: 'No action required.',
        tableRef: 'WOT_AFR',
        value: meanLambda,
      })
    )
  }

  return results
}

function checkInjectorDutyCycle(
  tuneData: TuneData,
  hardware: HardwareProfile
): DiagnosticResult[] {
  const results: DiagnosticResult[] = []
  const injectorFlow = hardware.injectorSize_cc ?? tuneData.tables.injectorFlow

  if (!injectorFlow || injectorFlow <= 0) {
    results.push(
      result({
        system: 'fuelling',
        check: 'Injector Duty Cycle',
        status: 'info',
        severity: 1,
        finding: 'Injector flow rate not detected — IDC cannot be estimated.',
        recommendation: 'Ensure injectorFlow table is present in your upload.',
        tableRef: 'injectorFlow',
      })
    )
    return results
  }

  // Estimate peak fuel demand from MAF table or datalog
  const mafTable = tuneData.tables.MAF
  const datalogMAF = datalogChannel(tuneData.datalog?.rows, 'MAF')
  const peakMAF_gps =
    (mafTable && mafTable.length > 0 ? flatMax(mafTable) : 0) ||
    (datalogMAF.length > 0 ? flatMax(datalogMAF) : 0)

  let estimatedIDC: number | null = null

  if (peakMAF_gps > 0) {
    // Target lambda from WOT_AFR (use mean, default to gasoline stoich if absent)
    const wotAFR = tuneData.tables.WOT_AFR
    const targetLambda = wotAFR && wotAFR.length > 0 ? mean(wotAFR.filter((v) => v > 0.5)) : 0.87
    const targetAFR = 14.7 * targetLambda

    // Fuel mass flow in g/s
    const fuelFlow_gps = peakMAF_gps / targetAFR
    // Convert to cc/min using gasoline density ~0.73 g/cc
    const fuelFlow_ccpm = (fuelFlow_gps / 0.73) * 60
    // Divide across 8 injectors
    const fuelPerInjector_ccpm = fuelFlow_ccpm / 8
    // IDC as a fraction
    estimatedIDC = Math.min(fuelPerInjector_ccpm / injectorFlow, 1.0)
  }

  if (estimatedIDC === null) {
    // Fallback: flag if injector seems undersized for common power levels
    // Rough rule: 550cc injectors support ~430whp on gasoline at 80% DC
    const roughCapacity_whp = (injectorFlow * 8 * 0.80 * 0.73 * 60) / (1000 * 0.50)
    results.push(
      result({
        system: 'fuelling',
        check: 'Injector Duty Cycle',
        status: 'info',
        severity: 1,
        finding: `Injector size: ${injectorFlow.toFixed(0)} cc/min. Without MAF data, estimated max power support ~${roughCapacity_whp.toFixed(0)} WHP at 80% DC.`,
        recommendation: 'Upload a MAF table or datalog for accurate IDC estimation.',
        tableRef: 'injectorFlow',
        value: injectorFlow,
      })
    )
    return results
  }

  const idcPct = estimatedIDC * 100
  const headroom = (1 - estimatedIDC) * 100

  if (idcPct > 85) {
    results.push(
      result({
        system: 'fuelling',
        check: 'Injector Duty Cycle',
        status: 'fail',
        severity: 4,
        finding: `Estimated peak IDC is ${idcPct.toFixed(1)}% — exceeds safe maximum of 85%. Injectors will run out of capacity before redline, causing a lean condition.`,
        recommendation: `Upgrade injectors. Current ${injectorFlow.toFixed(0)} cc/min injectors are insufficient. Minimum recommended size at this airflow: ${Math.ceil((injectorFlow * idcPct) / 80 / 50) * 50} cc/min.`,
        tableRef: 'injectorFlow',
        value: idcPct,
        limit: 85,
      })
    )
  } else if (idcPct > 80 || headroom < 20) {
    results.push(
      result({
        system: 'fuelling',
        check: 'Injector Duty Cycle',
        status: 'warn',
        severity: 2,
        finding: `Estimated peak IDC is ${idcPct.toFixed(1)}% — headroom is only ${headroom.toFixed(1)}%. This leaves little margin for enrichment, hot weather, or power increases.`,
        recommendation: 'Consider larger injectors for a safe margin. Target <80% IDC at peak power.',
        tableRef: 'injectorFlow',
        value: idcPct,
        limit: 80,
      })
    )
  } else {
    results.push(
      result({
        system: 'fuelling',
        check: 'Injector Duty Cycle',
        status: 'pass',
        severity: 1,
        finding: `Estimated peak IDC ~${idcPct.toFixed(1)}% — ${headroom.toFixed(1)}% headroom available. Injector sizing appears adequate.`,
        recommendation: 'No action required.',
        tableRef: 'injectorFlow',
        value: idcPct,
        limit: 80,
      })
    )
  }

  return results
}

function checkSTFTLTFT(tuneData: TuneData): DiagnosticResult[] {
  const results: DiagnosticResult[] = []
  const rows = tuneData.datalog?.rows

  const stft = datalogChannel(rows, 'STFT')
  const ltft = datalogChannel(rows, 'LTFT')

  if (stft.length === 0 && ltft.length === 0) {
    results.push(
      result({
        system: 'fuelling',
        check: 'Fuel Trims (STFT / LTFT)',
        status: 'info',
        severity: 1,
        finding: 'No fuel trim data found in datalog — STFT/LTFT checks skipped.',
        recommendation: 'Upload a VCM Scanner .hpl datalog with STFT and LTFT channels for closed-loop fuelling analysis.',
      })
    )
    return results
  }

  if (stft.length > 0) {
    const meanSTFT = mean(stft)
    const absSTFT = mean(stft.map(Math.abs))

    if (absSTFT > 10) {
      results.push(
        result({
          system: 'fuelling',
          check: 'Short Term Fuel Trim (STFT)',
          status: 'fail',
          severity: 3,
          finding: `STFT mean ${meanSTFT > 0 ? '+' : ''}${meanSTFT.toFixed(1)}% (avg absolute ${absSTFT.toFixed(1)}%) — consistently outside ±10%. The ECU is struggling to correct fuelling in real time.`,
          recommendation: meanSTFT > 0
            ? 'Engine is running lean. Check for vacuum leaks, MAF sensor contamination, or a fuel supply issue (low pressure/flow).'
            : 'Engine is running rich. Check for leaking injectors, incorrect MAF scaling, or a fuel pressure regulator fault.',
          value: meanSTFT,
          limit: 10,
        })
      )
    } else if (absSTFT > 5) {
      results.push(
        result({
          system: 'fuelling',
          check: 'Short Term Fuel Trim (STFT)',
          status: 'warn',
          severity: 2,
          finding: `STFT mean ${meanSTFT > 0 ? '+' : ''}${meanSTFT.toFixed(1)}% — outside the ideal ±5% window. The ECU is making noticeable corrections.`,
          recommendation: meanSTFT > 0
            ? 'Check for small vacuum leaks or MAF sensor fouling. VE table may need slight richening in affected load/RPM zones.'
            : 'VE table may be slightly rich in affected zones. Verify fuel pressure and injector cleanliness.',
          value: meanSTFT,
          limit: 5,
        })
      )
    } else {
      results.push(
        result({
          system: 'fuelling',
          check: 'Short Term Fuel Trim (STFT)',
          status: 'pass',
          severity: 1,
          finding: `STFT mean ${meanSTFT > 0 ? '+' : ''}${meanSTFT.toFixed(1)}% — within ±5%. Closed-loop fuelling is well controlled.`,
          recommendation: 'No action required.',
          value: meanSTFT,
          limit: 5,
        })
      )
    }
  }

  if (ltft.length > 0) {
    const meanLTFT = mean(ltft)
    const absLTFT = mean(ltft.map(Math.abs))

    if (absLTFT > 10) {
      results.push(
        result({
          system: 'fuelling',
          check: 'Long Term Fuel Trim (LTFT)',
          status: 'fail',
          severity: 3,
          finding: `LTFT mean ${meanLTFT > 0 ? '+' : ''}${meanLTFT.toFixed(1)}% (avg absolute ${absLTFT.toFixed(1)}%) — outside ±10%. The ECU has made persistent learned corrections indicating a systematic fuelling error.`,
          recommendation: meanLTFT > 0
            ? 'Systematic lean condition. Likely cause: vacuum leak, incorrect VE table, undersized MAF, or low fuel pressure. The LTFT correction should be incorporated into the VE table.'
            : 'Systematic rich condition. Check for oversized MAF scaling, leaking injectors, or high fuel pressure.',
          value: meanLTFT,
          limit: 10,
        })
      )
    } else if (absLTFT > 5) {
      results.push(
        result({
          system: 'fuelling',
          check: 'Long Term Fuel Trim (LTFT)',
          status: 'warn',
          severity: 2,
          finding: `LTFT mean ${meanLTFT > 0 ? '+' : ''}${meanLTFT.toFixed(1)}% — outside the ideal ±5% window. Learned correction suggests VE table has room for improvement.`,
          recommendation: 'Incorporate LTFT corrections into the VE table to bring trims closer to 0%. Use HP Tuners VVE table correction tool.',
          value: meanLTFT,
          limit: 5,
        })
      )
    } else {
      results.push(
        result({
          system: 'fuelling',
          check: 'Long Term Fuel Trim (LTFT)',
          status: 'pass',
          severity: 1,
          finding: `LTFT mean ${meanLTFT > 0 ? '+' : ''}${meanLTFT.toFixed(1)}% — within ±5%. VE table accuracy is good.`,
          recommendation: 'No action required.',
          value: meanLTFT,
          limit: 5,
        })
      )
    }
  }

  return results
}

// ─── Ignition checks ─────────────────────────────────────────────────────────

function checkWOTTiming(
  tuneData: TuneData,
  hardware: HardwareProfile
): DiagnosticResult[] {
  const results: DiagnosticResult[] = []
  const spark = tuneData.tables.spark

  if (!spark || spark.length === 0) {
    results.push(
      result({
        system: 'ignition',
        check: 'WOT Spark Timing',
        status: 'info',
        severity: 1,
        finding: 'Spark table not present — WOT timing check skipped.',
        recommendation: 'Upload a spark/ignition table for timing analysis.',
        tableRef: 'spark',
      })
    )
    return results
  }

  // WOT timing is in the highest-load rows of the spark table
  const wotRows = spark.slice(-Math.max(1, Math.floor(spark.length * 0.25)))
  const wotValues = wotRows.flat().filter((v) => isFinite(v) && v > 0)

  if (wotValues.length === 0) return results

  const maxTiming = flatMax(wotValues)
  const meanTiming = mean(wotValues)

  // Adjust thresholds by fuel type
  const fuelBonus =
    hardware.fuelType === 'E85' ? 8
    : hardware.fuelType === 'E30' ? 4
    : 0

  const warnThresholdNA = 28 + fuelBonus
  const warnThresholdBoost = 22 + fuelBonus

  const threshold = hardware.isForcedInduction ? warnThresholdBoost : warnThresholdNA
  const context = hardware.isForcedInduction ? 'boosted' : '91-octane NA'

  if (maxTiming > threshold + 4) {
    results.push(
      result({
        system: 'ignition',
        check: 'WOT Spark Timing',
        status: 'fail',
        severity: 4,
        finding: `WOT timing reaches ${maxTiming.toFixed(1)}° BTDC — significantly above the ${threshold}° recommended limit for a ${context} engine. High risk of detonation.`,
        recommendation: `Reduce WOT timing to ${threshold}° or below for ${context} operation. Always verify on a dyno with knock monitoring before increasing timing.`,
        tableRef: 'spark',
        value: maxTiming,
        limit: threshold,
      })
    )
  } else if (maxTiming > threshold) {
    results.push(
      result({
        system: 'ignition',
        check: 'WOT Spark Timing',
        status: 'warn',
        severity: 3,
        finding: `WOT timing reaches ${maxTiming.toFixed(1)}° BTDC — above the ${threshold}° guideline for ${context}. Monitor for knock closely.`,
        recommendation: `Consider reducing WOT timing to ${threshold}° as a safe starting point. Timing above this level requires knock monitoring and dyno verification.`,
        tableRef: 'spark',
        value: maxTiming,
        limit: threshold,
      })
    )
  } else {
    results.push(
      result({
        system: 'ignition',
        check: 'WOT Spark Timing',
        status: 'pass',
        severity: 1,
        finding: `WOT timing max ${maxTiming.toFixed(1)}° BTDC (mean ${meanTiming.toFixed(1)}°) — within recommended range for ${context}.`,
        recommendation: 'No action required.',
        tableRef: 'spark',
        value: maxTiming,
        limit: threshold,
      })
    )
  }

  return results
}

function checkIdleTiming(tuneData: TuneData): DiagnosticResult[] {
  const results: DiagnosticResult[] = []
  const spark = tuneData.tables.spark

  if (!spark || spark.length === 0) return results

  // Idle timing is in the lowest-load, lowest-RPM region (top-left of table)
  const idleRows = spark.slice(0, Math.max(1, Math.floor(spark.length * 0.25)))
  const idleValues = idleRows
    .map((row) => row.slice(0, Math.max(1, Math.floor(row.length * 0.2))))
    .flat()
    .filter((v) => isFinite(v) && v > 0)

  if (idleValues.length === 0) return results

  const maxIdleTiming = flatMax(idleValues)

  if (maxIdleTiming > 20) {
    results.push(
      result({
        system: 'ignition',
        check: 'Idle Spark Timing',
        status: 'fail',
        severity: 3,
        finding: `Idle timing reaches ${maxIdleTiming.toFixed(1)}° BTDC — unusually high for a low-load condition. This may indicate incorrect base timing offset or a misconfigured table.`,
        recommendation: 'Verify base timing with a timing light. Idle timing above 20° BTDC is unusual and may cause idle instability or hot start issues. Check for a base timing offset error in the calibration.',
        tableRef: 'spark',
        value: maxIdleTiming,
        limit: 20,
      })
    )
  } else {
    results.push(
      result({
        system: 'ignition',
        check: 'Idle Spark Timing',
        status: 'pass',
        severity: 1,
        finding: `Idle timing ${maxIdleTiming.toFixed(1)}° BTDC — within normal range.`,
        recommendation: 'No action required.',
        tableRef: 'spark',
        value: maxIdleTiming,
        limit: 20,
      })
    )
  }

  return results
}

function checkKnockRetard(tuneData: TuneData): DiagnosticResult[] {
  const results: DiagnosticResult[] = []
  const knockValues = datalogChannel(tuneData.datalog?.rows, 'KnockRetard')

  if (knockValues.length === 0) {
    results.push(
      result({
        system: 'ignition',
        check: 'Knock Retard Activity',
        status: 'info',
        severity: 1,
        finding: 'No knock retard channel found in datalog.',
        recommendation: 'Upload a VCM Scanner datalog with KnockRetard channel enabled for knock monitoring.',
      })
    )
    return results
  }

  const maxKnock = flatMax(knockValues.filter((v) => v >= 0))
  const knockEvents2deg = knockValues.filter((v) => v >= 2).length
  const knockEvents5deg = knockValues.filter((v) => v >= 5).length
  const totalSamples = knockValues.length

  if (knockEvents5deg > 0) {
    results.push(
      result({
        system: 'ignition',
        check: 'Knock Retard Activity',
        status: 'fail',
        severity: 4,
        finding: `Knock retard reached ${maxKnock.toFixed(1)}° with ${knockEvents5deg} event(s) ≥5°. Significant knock activity detected — potential for engine damage if not addressed immediately.`,
        recommendation: 'Reduce WOT and part-throttle timing in the affected RPM/load zones. Check fuel quality, IAT sensor accuracy, and cooling system. Do not operate at WOT until resolved.',
        value: maxKnock,
        limit: 5,
      })
    )
  } else if (knockEvents2deg > 0) {
    const knockRate = (knockEvents2deg / totalSamples) * 100
    results.push(
      result({
        system: 'ignition',
        check: 'Knock Retard Activity',
        status: 'warn',
        severity: 3,
        finding: `Knock retard max ${maxKnock.toFixed(1)}°, ${knockEvents2deg} event(s) ≥2° (${knockRate.toFixed(1)}% of samples). Light knock activity detected.`,
        recommendation: 'Reduce timing by 1–2° in the RPM/load zones where knock occurred. Verify fuel octane, check for heat soak (IAT), and monitor on the dyno.',
        value: maxKnock,
        limit: 2,
      })
    )
  } else {
    results.push(
      result({
        system: 'ignition',
        check: 'Knock Retard Activity',
        status: 'pass',
        severity: 1,
        finding: `No knock retard events detected across ${totalSamples} datalog samples. Engine is not knocking under logged conditions.`,
        recommendation: 'Continue monitoring during WOT runs and vary conditions (heat soak, load, altitude).',
        value: maxKnock,
        limit: 2,
      })
    )
  }

  return results
}

// ─── Airflow checks ──────────────────────────────────────────────────────────

function checkVETable(tuneData: TuneData): DiagnosticResult[] {
  const results: DiagnosticResult[] = []
  const ve = tuneData.tables.VE

  if (!ve || ve.length === 0) {
    results.push(
      result({
        system: 'airflow',
        check: 'VE Table Integrity',
        status: 'info',
        severity: 1,
        finding: 'VE table not present.',
        recommendation: 'Upload a VE (Volumetric Efficiency) table for airflow analysis.',
        tableRef: 'VE',
      })
    )
    return results
  }

  const allValues = ve.flat().filter((v) => isFinite(v))
  const totalCells = allValues.length

  // Check for cells > 100%
  const over100Cells = allValues.filter((v) => v > 100)
  const over100Pct = (over100Cells.length / totalCells) * 100

  if (over100Pct > 15) {
    results.push(
      result({
        system: 'airflow',
        check: 'VE Table — Values Over 100%',
        status: 'fail',
        severity: 3,
        finding: `${over100Cells.length} cells (${over100Pct.toFixed(1)}% of table) exceed 100% VE. Physically, VE >100% is not possible without boost or valve overlap effects, and usually indicates MAF scaling is incorrect.`,
        recommendation: 'Recalibrate the MAF transfer function. VE values significantly over 100% suggest the MAF table is scaled too low, causing the ECU to over-request fuel. Verify with a wideband O2 sensor.',
        tableRef: 'VE',
        value: over100Pct,
        limit: 15,
      })
    )
  } else if (over100Cells.length > 0) {
    const maxVE = flatMax(over100Cells)
    results.push(
      result({
        system: 'airflow',
        check: 'VE Table — Values Over 100%',
        status: 'warn',
        severity: 2,
        finding: `${over100Cells.length} cell(s) exceed 100% VE (max ${maxVE.toFixed(1)}%). A small number of cells slightly over 100% can occur with cam overlap but warrants investigation.`,
        recommendation: 'Verify MAF scaling accuracy across the affected RPM/load range. Cross-reference with wideband O2 data.',
        tableRef: 'VE',
        value: maxVE,
        limit: 100,
      })
    )
  } else {
    results.push(
      result({
        system: 'airflow',
        check: 'VE Table — Values Over 100%',
        status: 'pass',
        severity: 1,
        finding: `All ${totalCells} VE table cells are ≤100%. No MAF scaling anomalies detected from VE values.`,
        recommendation: 'No action required.',
        tableRef: 'VE',
      })
    )
  }

  // Check for completely flat rows (std dev < 0.5 across entire row)
  const flatRows = ve.reduce((acc, row, i) => {
    const validRow = row.filter((v) => isFinite(v))
    if (validRow.length >= 3 && stdDev(validRow) < 0.5) acc.push(i)
    return acc
  }, [] as number[])

  // Flat rows in the middle of the table are concerning; flat first/last row less so
  const concerningFlatRows = flatRows.filter((i) => i > 0 && i < ve.length - 1)

  if (concerningFlatRows.length > 2) {
    results.push(
      result({
        system: 'airflow',
        check: 'VE Table — Untouched Rows',
        status: 'warn',
        severity: 2,
        finding: `${concerningFlatRows.length} mid-table VE rows appear completely flat (all cells identical), suggesting those load ranges have not been tuned.`,
        recommendation: 'Review the VE table in HP Tuners and tune the flat rows using wideband O2 feedback or dyno-measured VE correction data.',
        tableRef: 'VE',
        value: concerningFlatRows.length,
      })
    )
  }

  return results
}

function checkMAFScaling(tuneData: TuneData): DiagnosticResult[] {
  const results: DiagnosticResult[] = []
  const maf = tuneData.tables.MAF

  if (!maf || maf.length === 0) {
    results.push(
      result({
        system: 'airflow',
        check: 'MAF Transfer Function',
        status: 'info',
        severity: 1,
        finding: 'MAF table not present.',
        recommendation: 'Upload a MAF transfer function table for airflow scaling analysis.',
        tableRef: 'MAF',
      })
    )
    return results
  }

  const maxMAF = flatMax(maf)
  const nonZeroCount = maf.filter((v) => v > 0.01).length
  const nonZeroPct = (nonZeroCount / maf.length) * 100

  if (maxMAF < 0.1 || nonZeroCount === 0) {
    results.push(
      result({
        system: 'airflow',
        check: 'MAF Transfer Function',
        status: 'fail',
        severity: 3,
        finding: 'MAF table appears completely unscaled — all values are zero or near-zero. The ECU cannot accurately measure airflow.',
        recommendation: 'The MAF transfer function must be calibrated using a known-good dataset or measured with a wideband O2 sensor and a data acquisition log.',
        tableRef: 'MAF',
        value: maxMAF,
      })
    )
  } else if (nonZeroPct < 20) {
    results.push(
      result({
        system: 'airflow',
        check: 'MAF Transfer Function',
        status: 'warn',
        severity: 2,
        finding: `MAF table is sparsely populated — only ${nonZeroPct.toFixed(0)}% of entries are non-zero. The table may be incomplete or partially scaled.`,
        recommendation: 'Verify the full MAF voltage range is populated. Missing entries cause the ECU to interpolate incorrectly at those sensor voltages.',
        tableRef: 'MAF',
        value: nonZeroPct,
        limit: 20,
      })
    )
  } else {
    results.push(
      result({
        system: 'airflow',
        check: 'MAF Transfer Function',
        status: 'pass',
        severity: 1,
        finding: `MAF table has ${nonZeroCount} populated entries (${nonZeroPct.toFixed(0)}%), peak value ${maxMAF.toFixed(1)} g/s. Table appears populated.`,
        recommendation: 'Verify accuracy against a known-good reference or wideband O2 data.',
        tableRef: 'MAF',
        value: maxMAF,
      })
    )
  }

  return results
}

// ─── Boost checks ─────────────────────────────────────────────────────────────

function checkBoostIDC(
  tuneData: TuneData,
  hardware: HardwareProfile
): DiagnosticResult[] {
  const results: DiagnosticResult[] = []

  if (!hardware.isForcedInduction) return results

  const injectorFlow = hardware.injectorSize_cc ?? tuneData.tables.injectorFlow
  const boostPSI = hardware.estimatedBoostPSI

  if (!injectorFlow || injectorFlow <= 0) {
    results.push(
      result({
        system: 'boost',
        check: 'Injector Duty Cycle at Boost',
        status: 'warn',
        severity: 2,
        finding: 'Forced induction detected but injector size unknown — IDC at boost cannot be calculated.',
        recommendation: 'Ensure injectorFlow table is present. Injector sizing is critical for a safe forced induction tune.',
        tableRef: 'injectorFlow',
      })
    )
    return results
  }

  if (!boostPSI || boostPSI <= 0) return results

  // Calculate boost multiplier on air density
  const atmosphericPSI = 14.7
  const boostMultiplier = (atmosphericPSI + boostPSI) / atmosphericPSI

  // Get NA baseline IDC from MAF table
  const mafTable = tuneData.tables.MAF
  const datalogMAF = datalogChannel(tuneData.datalog?.rows, 'MAF')
  const peakMAF_gps =
    (mafTable && mafTable.length > 0 ? flatMax(mafTable) : 0) ||
    (datalogMAF.length > 0 ? flatMax(datalogMAF) : 0)

  if (peakMAF_gps <= 0) return results

  const wotAFR = tuneData.tables.WOT_AFR
  const targetLambda = wotAFR && wotAFR.length > 0 ? mean(wotAFR.filter((v) => v > 0.5)) : 0.80
  const targetAFR = 14.7 * targetLambda

  const boostedMAF_gps = peakMAF_gps * boostMultiplier
  const fuelFlow_gps = boostedMAF_gps / targetAFR
  const fuelPerInjector_ccpm = (fuelFlow_gps / 0.73) * 60 / 8
  const boostedIDC = Math.min((fuelPerInjector_ccpm / injectorFlow) * 100, 200)

  if (boostedIDC > 85) {
    results.push(
      result({
        system: 'boost',
        check: 'Injector Duty Cycle at Boost',
        status: 'fail',
        severity: 4,
        finding: `At ${boostPSI.toFixed(1)} PSI boost, estimated IDC is ${boostedIDC.toFixed(1)}% — injectors will be saturated before redline. This will cause a severe lean condition under boost.`,
        recommendation: `Upgrade injectors immediately. At ${boostPSI.toFixed(1)} PSI with ${injectorFlow.toFixed(0)} cc/min injectors, you need approximately ${Math.ceil((injectorFlow * boostedIDC) / 80 / 50) * 50} cc/min injectors to maintain <80% IDC.`,
        tableRef: 'injectorFlow',
        value: boostedIDC,
        limit: 85,
      })
    )
  } else if (boostedIDC > 80) {
    results.push(
      result({
        system: 'boost',
        check: 'Injector Duty Cycle at Boost',
        status: 'warn',
        severity: 3,
        finding: `At ${boostPSI.toFixed(1)} PSI boost, estimated IDC is ${boostedIDC.toFixed(1)}% — marginal headroom. Consider upsizing injectors for a comfortable safety margin.`,
        recommendation: 'Injectors are close to their limit. Larger injectors provide headroom for fuel enrichment, E85 blends, or future power increases.',
        tableRef: 'injectorFlow',
        value: boostedIDC,
        limit: 80,
      })
    )
  } else {
    results.push(
      result({
        system: 'boost',
        check: 'Injector Duty Cycle at Boost',
        status: 'pass',
        severity: 1,
        finding: `At ${boostPSI.toFixed(1)} PSI boost, estimated IDC is ${boostedIDC.toFixed(1)}% — adequate headroom for current boost target.`,
        recommendation: 'No action required.',
        tableRef: 'injectorFlow',
        value: boostedIDC,
        limit: 80,
      })
    )
  }

  return results
}

function checkBoostControlTables(
  tuneData: TuneData,
  hardware: HardwareProfile
): DiagnosticResult[] {
  const results: DiagnosticResult[] = []

  if (!hardware.isForcedInduction) return results

  const hasBoostTarget = (tuneData.tables.boostTarget?.length ?? 0) > 0
  const hasWastegate = (tuneData.tables.wastegate_DC?.length ?? 0) > 0

  if (!hasBoostTarget && !hasWastegate) {
    results.push(
      result({
        system: 'boost',
        check: 'Boost Control Tables',
        status: 'warn',
        severity: 3,
        finding: 'Forced induction detected but no boost control tables (boost target or wastegate duty cycle) are present in the calibration. The ECU may not be controlling boost.',
        recommendation: 'Ensure boost target and wastegate DC tables are configured in HP Tuners. Without boost control, boost pressure is unregulated and may exceed safe levels.',
      })
    )
  } else {
    results.push(
      result({
        system: 'boost',
        check: 'Boost Control Tables',
        status: 'pass',
        severity: 1,
        finding: `Boost control tables present: ${[hasBoostTarget && 'Boost Target', hasWastegate && 'Wastegate DC'].filter(Boolean).join(', ')}.`,
        recommendation: 'Verify boost control loop is functioning correctly on the dyno.',
      })
    )
  }

  return results
}

// ─── Thermal checks ──────────────────────────────────────────────────────────

function checkIATCorrection(tuneData: TuneData): DiagnosticResult[] {
  const results: DiagnosticResult[] = []
  const iat = tuneData.tables.IAT_correction

  if (!iat || iat.length === 0) {
    results.push(
      result({
        system: 'thermal',
        check: 'IAT Fuel Correction',
        status: 'warn',
        severity: 2,
        finding: 'IAT correction table not present. Without inlet air temperature correction, fuel delivery will be inaccurate when IAT deviates from calibration conditions.',
        recommendation: 'Add an IAT correction table to compensate for heat soak and cold weather. This is especially important for forced induction engines where IAT varies significantly.',
        tableRef: 'IAT_correction',
      })
    )
    return results
  }

  const allValues = iat.flat().filter((v) => isFinite(v))
  if (allValues.length === 0) return results

  const range = flatMax(allValues) - flatMin(allValues)

  if (range < 0.5) {
    results.push(
      result({
        system: 'thermal',
        check: 'IAT Fuel Correction',
        status: 'warn',
        severity: 2,
        finding: `IAT correction table is effectively flat (total range only ${range.toFixed(2)}%). The table is present but not correcting for temperature variation.`,
        recommendation: 'Configure the IAT correction table with appropriate slopes. Recommended: reduce fuelling by ~2–3% per 10°C above calibration temperature. Critical for boosted applications.',
        tableRef: 'IAT_correction',
        value: range,
      })
    )
  } else {
    results.push(
      result({
        system: 'thermal',
        check: 'IAT Fuel Correction',
        status: 'pass',
        severity: 1,
        finding: `IAT correction table active — value range ${range.toFixed(1)}%. Temperature-based fuel correction is configured.`,
        recommendation: 'Verify correction values are appropriate for your climate and heat soak conditions.',
        tableRef: 'IAT_correction',
        value: range,
      })
    )
  }

  return results
}

function checkColdStart(tuneData: TuneData): DiagnosticResult[] {
  // We don't have a dedicated cold start enrichment table in the current schema,
  // but we can infer from datalog coolant vs STFT at cold conditions
  const results: DiagnosticResult[] = []
  const rows = tuneData.datalog?.rows

  if (!rows || rows.length === 0) {
    results.push(
      result({
        system: 'thermal',
        check: 'Cold Start Enrichment',
        status: 'info',
        severity: 1,
        finding: 'No datalog present — cold start enrichment cannot be evaluated from live data.',
        recommendation: 'Upload a datalog that includes a cold engine start (coolant below 40°C) to evaluate cold start fuelling.',
      })
    )
    return results
  }

  // Find cold-start rows: coolant < 40°C
  const coldRows = rows.filter((r) => r.Coolant !== undefined && r.Coolant < 40)

  if (coldRows.length === 0) {
    results.push(
      result({
        system: 'thermal',
        check: 'Cold Start Enrichment',
        status: 'info',
        severity: 1,
        finding: 'Datalog does not include cold start data (no coolant readings below 40°C).',
        recommendation: 'To evaluate cold start enrichment, log the engine from a cold start with coolant sensor enabled.',
      })
    )
    return results
  }

  const coldSTFT = coldRows
    .map((r) => r.STFT)
    .filter((v): v is number => v !== undefined && isFinite(v))

  if (coldSTFT.length > 0) {
    const meanColdSTFT = mean(coldSTFT)
    if (Math.abs(meanColdSTFT) > 10) {
      results.push(
        result({
          system: 'thermal',
          check: 'Cold Start Enrichment',
          status: 'warn',
          severity: 2,
          finding: `Cold start STFT mean ${meanColdSTFT > 0 ? '+' : ''}${meanColdSTFT.toFixed(1)}% — fuel correction active during cold start, suggesting enrichment table may need adjustment.`,
          recommendation: meanColdSTFT > 0
            ? 'Cold start running lean — increase cold start enrichment in HP Tuners. Check coolant temperature sensor calibration.'
            : 'Cold start running rich — reduce cold start enrichment. May cause rough idle, high HC emissions, and oil dilution.',
          value: meanColdSTFT,
          limit: 10,
        })
      )
    } else {
      results.push(
        result({
          system: 'thermal',
          check: 'Cold Start Enrichment',
          status: 'pass',
          severity: 1,
          finding: `Cold start fuelling looks reasonable — STFT mean ${meanColdSTFT > 0 ? '+' : ''}${meanColdSTFT.toFixed(1)}% at coolant <40°C.`,
          recommendation: 'Monitor across a wider temperature range.',
          value: meanColdSTFT,
        })
      )
    }
  }

  return results
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function runDiagnostics(
  tuneData: TuneData,
  hardware: HardwareProfile
): DiagnosticResult[] {
  const checks: DiagnosticResult[] = []

  // Fuelling
  checks.push(...checkWOTLambda(tuneData))
  checks.push(...checkInjectorDutyCycle(tuneData, hardware))
  checks.push(...checkSTFTLTFT(tuneData))

  // Ignition
  checks.push(...checkWOTTiming(tuneData, hardware))
  checks.push(...checkIdleTiming(tuneData))
  checks.push(...checkKnockRetard(tuneData))

  // Airflow
  checks.push(...checkVETable(tuneData))
  checks.push(...checkMAFScaling(tuneData))

  // Boost (only emits results if forced induction detected)
  checks.push(...checkBoostIDC(tuneData, hardware))
  checks.push(...checkBoostControlTables(tuneData, hardware))

  // Thermal
  checks.push(...checkIATCorrection(tuneData))
  checks.push(...checkColdStart(tuneData))

  // Sort: fails first, then warns, then passes/info — within each group by severity desc
  const statusOrder = { fail: 0, warn: 1, pass: 2, info: 3 }
  checks.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status]
    if (statusDiff !== 0) return statusDiff
    return b.severity - a.severity
  })

  return checks
}
