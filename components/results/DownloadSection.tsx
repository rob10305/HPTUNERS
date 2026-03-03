'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { HardwareProfile, DiagnosticResult, AIAnalysisResult, TuneData, CellModification } from '@/types/tuneData'

// ─── Lazy PDF button ────────────────────────────────────────────────────────
// Dynamically imported to avoid SSR issues with @react-pdf/renderer

interface PDFButtonProps {
  vehicle: { osVersion?: string | null; ecuType?: string | null; platform?: string | null }
  hardware: HardwareProfile
  diagnostics: DiagnosticResult[]
  aiAnalysis: AIAnalysisResult
}

const LazyPDFButton = dynamic<PDFButtonProps>(
  () => import('./PDFDownloadButton').then((m) => m.PDFDownloadButton),
  {
    ssr: false,
    loading: () => (
      <Button variant="outline" size="sm" className="w-full gap-2" disabled>
        <Loader2 className="w-4 h-4 animate-spin" />
        Preparing PDF…
      </Button>
    ),
  }
)

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function table2DToCSV(table: number[][], tableName: string): string {
  return `${tableName}\n${table.map((row) => row.map((v) => v.toFixed(4)).join(',')).join('\n')}`
}

function table1DToCSV(table: number[], tableName: string): string {
  return `${tableName}\n${table.map((v) => v.toFixed(4)).join(',')}`
}

function scalarToCSV(value: number, tableName: string): string {
  return `${tableName}\n${value.toFixed(4)}`
}

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadAllCSV(tables: TuneData['tables'], filename: string) {
  const parts: string[] = ['HP Tuners AI Tune Advisor — Table Export', '']
  if (tables.VE) parts.push(table2DToCSV(tables.VE, 'VE Table'))
  if (tables.spark) parts.push(table2DToCSV(tables.spark, 'Spark Table'))
  if (tables.MAF) parts.push(table1DToCSV(tables.MAF, 'MAF Table'))
  if (tables.WOT_AFR) parts.push(table1DToCSV(tables.WOT_AFR, 'WOT AFR'))
  if (tables.IAT_correction) parts.push(table2DToCSV(tables.IAT_correction, 'IAT Correction'))
  if (tables.boostTarget) parts.push(table2DToCSV(tables.boostTarget, 'Boost Target'))
  if (tables.wastegate_DC) parts.push(table2DToCSV(tables.wastegate_DC, 'Wastegate DC'))
  if (tables.injectorFlow != null) parts.push(scalarToCSV(tables.injectorFlow, 'Injector Flow (cc/min)'))
  if (tables.revLimit != null) parts.push(scalarToCSV(tables.revLimit, 'Rev Limit'))
  downloadBlob(parts.join('\n\n'), filename)
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DownloadSectionProps {
  vehicle: { osVersion?: string | null; ecuType?: string | null; platform?: string | null }
  hardware: HardwareProfile
  diagnostics: DiagnosticResult[]
  aiAnalysis: AIAnalysisResult
  originalTables: TuneData['tables']
  modifiedTables?: TuneData['tables']
  modifications?: CellModification[]
}

export function DownloadSection({
  vehicle,
  hardware,
  diagnostics,
  aiAnalysis,
  originalTables,
  modifiedTables,
}: DownloadSectionProps) {
  const [pdfVisible, setPdfVisible] = useState(false)
  const hasTurbo = !!modifiedTables

  return (
    <div className="space-y-4">
      {/* Mandatory disclaimer above downloads */}
      <div className="p-4 rounded-lg border border-yellow-500/40 bg-yellow-500/5">
        <p className="text-xs text-yellow-500/90 leading-relaxed font-medium">
          ⚠️ This output is a starting point baseline only. It has not been verified on a
          dynamometer. Incorrect calibration can cause serious engine damage. Always monitor
          wideband O2 and knock activity. Professional dyno tuning is required before any
          wide-open-throttle operation.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* PDF Report */}
          <div className="p-3 rounded-lg border border-border bg-card/50 space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium">Diagnostic Report (PDF)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Full report including hardware profile, all diagnostic findings, AI analysis, and next steps.
            </p>
            {!pdfVisible ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setPdfVisible(true)}
              >
                <FileText className="w-4 h-4" />
                Prepare PDF Report
              </Button>
            ) : (
              <LazyPDFButton
                vehicle={vehicle}
                hardware={hardware}
                diagnostics={diagnostics}
                aiAnalysis={aiAnalysis}
              />
            )}
          </div>

          {/* Original CSV */}
          <div className="p-3 rounded-lg border border-border bg-card/50 space-y-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium">Original Tune Tables (CSV)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              All parsed tables exported as comma-separated values — one section per table.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => downloadAllCSV(originalTables, 'hp-tuners-ai-original-tables.csv')}
            >
              <Download className="w-4 h-4" />
              Download Original CSV
            </Button>
          </div>

          {/* Modified CSV (turbo path only) */}
          {hasTurbo && modifiedTables && (
            <div className={cn('p-3 rounded-lg border bg-blue-500/5 space-y-2 border-blue-500/30')}>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium">Turbo Baseline Tables (CSV)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Modified tables with VE scaling, timing reduction, new injector values, and boost control tables.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                onClick={() => downloadAllCSV(modifiedTables, 'hp-tuners-ai-turbo-baseline.csv')}
              >
                <Download className="w-4 h-4" />
                Download Turbo Baseline CSV
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
