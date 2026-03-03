import type { TuneData, HardwareProfile } from '@/types/tuneData'

// ─── Constants ────────────────────────────────────────────────────────────────

const KPA_TO_PSI = 0.145038
const ATMOSPHERIC_KPA = 101.325

// MAF peak g/s thresholds → housing diameter inference
// Values based on common HP Tuners MAF table voltage-to-flow curves
const MAF_DIAMETER_THRESHOLDS: { minPeak: number; diameter_mm: number }[] = [
  { minPeak: 700, diameter_mm: 102 },
  { minPeak: 551, diameter_mm: 95 },
  { minPeak: 400, diameter_mm: 90 }, // LS3 stock
  { minPeak: 0, diameter_mm: 85 },   // LS1 stock / small housing
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flatMean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function flatMax(arr: number[]): number {
  return arr.reduce((a, b) => Math.max(a, b), -Infinity)
}

function getDatalogMax(
  rows: Record<string, number>[] | undefined,
  channel: string
): number {
  if (!rows || rows.length === 0) return 0
  return rows.reduce((m: number, r: Record<string, number>) => Math.max(m, r[channel] ?? 0), 0)
}

// ─── Individual detectors ─────────────────────────────────────────────────────

function detectInjectorSize(tuneData: TuneData, flags: string[]): number | null {
  const flow = tuneData.tables.injectorFlow
  if (flow != null && flow > 0) {
    flags.push(`Injector flow scalar found: ${flow.toFixed(1)} cc/min`)
    return flow
  }

  const fromRawFlags = tuneData.rawFlags.detectedInjectorSize_cc
  if (fromRawFlags != null && fromRawFlags > 0) {
    flags.push(`Injector size from raw flags: ${fromRawFlags.toFixed(1)} cc/min`)
    return fromRawFlags
  }

  flags.push('Injector size not detected — injectorFlow table not present')
  return null
}

function detectForcedInduction(
  tuneData: TuneData,
  flags: string[]
): { isForcedInduction: boolean; estimatedBoostPSI: number | null } {
  const boostTablePresent =
    (tuneData.tables.boostTarget?.length ?? 0) > 0 ||
    (tuneData.tables.wastegate_DC?.length ?? 0) > 0

  // Read max boost target from table
  let boostFromTable: number | null = null
  if (tuneData.tables.boostTarget) {
    const flatValues = tuneData.tables.boostTarget.flat()
    const maxPSI = flatMax(flatValues)
    if (isFinite(maxPSI) && maxPSI > 0) {
      boostFromTable = maxPSI
    }
  }

  // Read max MAP from datalog and convert to gauge pressure
  let boostFromDatalog: number | null = null
  const maxMAP = getDatalogMax(tuneData.datalog?.rows, 'MAP')
  if (maxMAP > 0) {
    // MAP stored as kPa absolute → subtract atmospheric to get gauge
    if (maxMAP > 200) {
      // Likely in kPa
      const gaugePSI = (maxMAP - ATMOSPHERIC_KPA) * KPA_TO_PSI
      if (gaugePSI > 1) boostFromDatalog = gaugePSI
    } else if (maxMAP > 15) {
      // Already in PSI gauge (unlikely but handle it)
      boostFromDatalog = maxMAP
    }
  }

  // Also check the Boost channel directly if present
  const maxBoostChannel = getDatalogMax(tuneData.datalog?.rows, 'Boost')
  if (maxBoostChannel > 2) {
    // Favour the Boost channel reading
    boostFromDatalog = Math.max(boostFromDatalog ?? 0, maxBoostChannel)
  }

  const isForcedInduction =
    tuneData.rawFlags.isForcedInduction ||
    boostTablePresent ||
    (boostFromDatalog != null && boostFromDatalog > 3)

  const estimatedBoostPSI =
    boostFromTable ?? boostFromDatalog

  if (isForcedInduction) {
    const sources: string[] = []
    if (boostTablePresent) sources.push('boost control tables present')
    if (boostFromDatalog != null) sources.push(`datalog MAP peak ~${boostFromDatalog.toFixed(1)} PSI boost`)
    if (boostFromTable != null) sources.push(`boost target table max ${boostFromTable.toFixed(1)} PSI`)
    flags.push(`Forced induction detected: ${sources.join('; ')}`)
  } else {
    flags.push('Naturally aspirated — no boost tables or elevated MAP detected')
  }

  return { isForcedInduction, estimatedBoostPSI: estimatedBoostPSI ?? null }
}

function detectMAFHousing(tuneData: TuneData, flags: string[]): number | null {
  const maf = tuneData.tables.MAF
  if (!maf || maf.length === 0) {
    flags.push('MAF housing diameter: cannot determine — no MAF table')
    return null
  }

  const peakMAF = flatMax(maf)

  if (!isFinite(peakMAF) || peakMAF <= 0) {
    flags.push('MAF housing diameter: cannot determine — MAF table appears unscaled (all zeros)')
    return null
  }

  const match = MAF_DIAMETER_THRESHOLDS.find((t) => peakMAF >= t.minPeak)
  const diameter = match?.diameter_mm ?? null

  if (diameter != null) {
    flags.push(
      `MAF housing: ~${diameter}mm inferred from peak table value ${peakMAF.toFixed(1)} g/s`
    )
  }

  return diameter
}

function detectCamProfile(
  tuneData: TuneData,
  flags: string[]
): HardwareProfile['camProfile'] {
  const ve = tuneData.tables.VE
  if (!ve || ve.length < 4) {
    flags.push('Cam profile: cannot determine — VE table not present or too small')
    return 'unknown'
  }

  // Use the highest-load row (WOT approximation) as it best reflects cam characteristics
  const wotRow = ve[ve.length - 1]
  if (!wotRow || wotRow.length < 4) {
    flags.push('Cam profile: cannot determine — WOT row insufficient')
    return 'unknown'
  }

  const colCount = wotRow.length
  const lowRPMSlice = wotRow.slice(0, Math.floor(colCount * 0.3))   // first 30% of RPM range
  const highRPMSlice = wotRow.slice(Math.floor(colCount * 0.65))    // last 35% of RPM range
  const midRPMSlice = wotRow.slice(
    Math.floor(colCount * 0.3),
    Math.floor(colCount * 0.65)
  )

  const lowMean = flatMean(lowRPMSlice)
  const midMean = flatMean(midRPMSlice)
  const highMean = flatMean(highRPMSlice)
  const overallMean = flatMean(wotRow)

  // Any cell exceeding 105% VE is physically unusual and suggests a large cam or MAF scaling issue
  const hasVEOver105 = wotRow.some((v) => v > 105)

  // High RPM relative to low RPM — key cam signature
  const highToLowRatio = lowMean > 0 ? highMean / lowMean : 1
  // High RPM relative to peak (mid) — measures how much the cam extends power band
  const highToMidRatio = midMean > 0 ? highMean / midMean : 1

  let profile: HardwareProfile['camProfile']

  if (highToLowRatio > 1.25 || (hasVEOver105 && highToLowRatio > 1.1)) {
    profile = 'aggressive'
    flags.push(
      `Cam profile: AGGRESSIVE — WOT high-RPM VE ${highMean.toFixed(1)}% vs low-RPM ${lowMean.toFixed(1)}% (ratio ${highToLowRatio.toFixed(2)})`
    )
  } else if (highToLowRatio > 1.08 || (highToMidRatio > 0.97 && overallMean > 82)) {
    profile = 'mild'
    flags.push(
      `Cam profile: MILD — WOT VE extends well through high RPM (high/low ratio ${highToLowRatio.toFixed(2)})`
    )
  } else {
    profile = 'stock'
    flags.push(
      `Cam profile: STOCK — WOT VE relatively flat/peaky in mid-range (high/low ratio ${highToLowRatio.toFixed(2)})`
    )
  }

  return profile
}

function detectFuelType(
  tuneData: TuneData,
  flags: string[]
): HardwareProfile['fuelType'] {
  const wotAFR = tuneData.tables.WOT_AFR
  const hasFlexFuel = tuneData.rawFlags.hasFlexFuel

  if (hasFlexFuel) {
    flags.push('Fuel type: FLEX FUEL — flex fuel flag detected')
    return 'flex'
  }

  if (!wotAFR || wotAFR.length === 0) {
    flags.push('Fuel type: cannot determine — WOT_AFR table not present')
    return 'unknown'
  }

  // WOT_AFR values are lambda (stoichiometric = 1.0)
  // Filter out zero/invalid values
  const validValues = wotAFR.filter((v) => v > 0.5 && v < 1.5)
  if (validValues.length === 0) {
    flags.push('Fuel type: cannot determine — WOT_AFR values out of expected range')
    return 'unknown'
  }

  const meanLambda = flatMean(validValues)
  const minLambda = Math.min(...validValues)

  // E85: 0.72–0.78λ at WOT
  // E30: 0.78–0.82λ at WOT
  // Gasoline: 0.82–0.88λ at WOT
  let fuelType: HardwareProfile['fuelType']

  if (minLambda < 0.79 && meanLambda < 0.80) {
    fuelType = 'E85'
    flags.push(
      `Fuel type: E85 — WOT lambda targets min ${minLambda.toFixed(3)}λ, mean ${meanLambda.toFixed(3)}λ`
    )
  } else if (meanLambda < 0.83) {
    fuelType = 'E30'
    flags.push(
      `Fuel type: E30 — WOT lambda targets mean ${meanLambda.toFixed(3)}λ (richer than pump gas)`
    )
  } else if (meanLambda <= 0.89) {
    fuelType = 'gasoline'
    flags.push(
      `Fuel type: GASOLINE — WOT lambda targets mean ${meanLambda.toFixed(3)}λ`
    )
  } else {
    // > 0.89λ at WOT — very lean, flag as unknown/concerning
    fuelType = 'unknown'
    flags.push(
      `Fuel type: UNKNOWN — WOT lambda mean ${meanLambda.toFixed(3)}λ is leaner than expected for any fuel type (likely untuned or conservative)`
    )
  }

  return fuelType
}

function detectTransmission(
  tuneData: TuneData,
  flags: string[]
): HardwareProfile['transmissionType'] {
  // Without transmission-specific tables in our current offset DB, this cannot be
  // reliably inferred. Return unknown for MVP.
  void tuneData
  flags.push('Transmission type: not detectable from current table set — manual classification required')
  return 'unknown'
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function detectHardware(tuneData: TuneData): HardwareProfile {
  const flags: string[] = []

  const injectorSize_cc = detectInjectorSize(tuneData, flags)
  const { isForcedInduction, estimatedBoostPSI } = detectForcedInduction(tuneData, flags)
  const MAFHousingDiameter_mm = detectMAFHousing(tuneData, flags)
  const camProfile = detectCamProfile(tuneData, flags)
  const fuelType = detectFuelType(tuneData, flags)
  const transmissionType = detectTransmission(tuneData, flags)

  return {
    injectorSize_cc,
    isForcedInduction,
    estimatedBoostPSI,
    MAFHousingDiameter_mm,
    camProfile,
    fuelType,
    transmissionType,
    flags,
  }
}
