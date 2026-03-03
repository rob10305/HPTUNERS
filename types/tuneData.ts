export interface TuneData {
  source: 'csv' | 'bin' | 'hpl' | 'companion_app'
  vehicle: {
    osVersion: string | null
    ecuType: string | null
    vin: string | null
    platform: string | null
  }
  tables: {
    VE?: number[][]
    spark?: number[][]
    MAF?: number[]
    injectorFlow?: number
    injectorDeadTime?: number[]
    WOT_AFR?: number[]
    IAT_correction?: number[][]
    boostTarget?: number[][]
    wastegate_DC?: number[][]
    revLimit?: number
    fuelCut?: number
  }
  datalog?: {
    channels: string[]
    rows: Record<string, number>[]
  }
  rawFlags: {
    isForcedInduction: boolean
    hasFlexFuel: boolean
    hasBoostControl: boolean
    detectedInjectorSize_cc: number | null
  }
}

export interface HardwareProfile {
  injectorSize_cc: number | null
  isForcedInduction: boolean
  estimatedBoostPSI: number | null
  MAFHousingDiameter_mm: number | null
  camProfile: 'stock' | 'mild' | 'aggressive' | 'unknown'
  fuelType: 'gasoline' | 'E30' | 'E85' | 'flex' | 'unknown'
  transmissionType: 'manual' | 'automatic' | 'unknown'
  flags: string[]
}

export interface DiagnosticResult {
  system: 'fuelling' | 'ignition' | 'airflow' | 'boost' | 'thermal' | 'sensors'
  check: string
  status: 'pass' | 'warn' | 'fail' | 'info'
  severity: 1 | 2 | 3 | 4
  finding: string
  recommendation: string
  tableRef: string | null
  value: number | null
  limit: number | null
}

export interface AIAnalysisResult {
  summary: string
  issues: {
    title: string
    explanation: string
    action: string
    severity: number
  }[]
  nextSteps: string[]
  safetyWarnings: string[]
  tableChanges?: {
    table: string
    change: string
    reason: string
  }[]
}

export interface TurboConversionInputs {
  targetWHP: number
  turboPSI: number
  newInjector_cc: number
  fuelType: 'pump91' | 'E30' | 'E85'
  hasIntercooler: boolean
  turboSpoolRPM: number
}

export type UserIntent = 'diagnose' | 'na_to_turbo' | 'performance'

export interface CellModification {
  table: string
  row: number
  col: number
  originalValue: number
  newValue: number
}

export interface TurboMapResult {
  modifiedTuneData: TuneData
  /** Every cell that was changed, keyed for O(1) lookup by the UI */
  modifications: CellModification[]
  /** Quick lookup: table name → Set of "row,col" strings for changed cells */
  modifiedCellIndex: Record<string, Set<string>>
  /** Names of tables that were changed or generated */
  modifiedTables: string[]
  warnings: string[]
}

export interface UploadedFile {
  id: string
  file: File
  name: string
  type: 'csv' | 'bin' | 'hpl'
  label?: string // for CSV files — e.g. "VE Table"
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error'
  progress: number
  error?: string
}

export interface AppSession {
  sessionId: string
  tuneData: TuneData | null
  hardware: HardwareProfile | null
  diagnostics: DiagnosticResult[] | null
  aiAnalysis: AIAnalysisResult | null
  userIntent: UserIntent | null
  uploadedFiles: UploadedFile[]
}
