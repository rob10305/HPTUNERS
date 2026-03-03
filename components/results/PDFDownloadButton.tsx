'use client'

// This component is dynamically imported (ssr:false) in DownloadSection
// to avoid SSR issues with @react-pdf/renderer

import { PDFDownloadLink } from '@react-pdf/renderer'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DiagnosticReportPDF } from '@/lib/reportPDF'
import type { HardwareProfile, DiagnosticResult, AIAnalysisResult } from '@/types/tuneData'

interface PDFDownloadButtonProps {
  vehicle: { osVersion?: string | null; ecuType?: string | null; platform?: string | null }
  hardware: HardwareProfile
  diagnostics: DiagnosticResult[]
  aiAnalysis: AIAnalysisResult
}

export function PDFDownloadButton({
  vehicle,
  hardware,
  diagnostics,
  aiAnalysis,
}: PDFDownloadButtonProps) {
  const doc = (
    <DiagnosticReportPDF
      vehicle={vehicle}
      hardware={hardware}
      diagnostics={diagnostics}
      aiAnalysis={aiAnalysis}
      generatedAt={new Date().toLocaleDateString()}
    />
  )

  return (
    <PDFDownloadLink
      document={doc}
      fileName="hp-tuners-ai-diagnostic-report.pdf"
    >
      {({ loading }: { loading: boolean }) => (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating PDF…
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Download PDF Report
            </>
          )}
        </Button>
      )}
    </PDFDownloadLink>
  )
}
