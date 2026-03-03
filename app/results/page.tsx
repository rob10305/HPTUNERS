'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Zap, ArrowLeft, AlertTriangle } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DisclaimerBanner } from '@/components/results/DisclaimerBanner'
import { DiagnosticSummaryCard } from '@/components/results/DiagnosticSummaryCard'
import { IssueList } from '@/components/results/IssueList'
import { TableViewer } from '@/components/results/TableViewer'
import { AIAnalysisSummary } from '@/components/results/AIAnalysisSummary'
import { NextStepsChecklist } from '@/components/results/NextStepsChecklist'
import { DownloadSection } from '@/components/results/DownloadSection'
import type {
  HardwareProfile,
  DiagnosticResult,
  AIAnalysisResult,
  TuneData,
  CellModification,
} from '@/types/tuneData'

interface AnalysisResult {
  sessionId: string
  hardware: HardwareProfile
  diagnostics: DiagnosticResult[]
  aiAnalysis: AIAnalysisResult
  summary: { fail: number; warn: number; warn2?: number; pass: number; info: number }
  turboMapResult?: {
    modifiedTuneData: TuneData
    modifications: CellModification[]
    modifiedTables: string[]
    warnings: string[]
  } | null
}

interface StoredSession {
  analysisResult: AnalysisResult
  tuneData: TuneData
}

function ResultsInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session')

  const [data, setData] = useState<StoredSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadResults() {
      try {
        // 1. Try sessionStorage first (fastest, set by ProcessingScreen)
        const raw = sessionStorage.getItem('analysisResult')
        const rawTune = sessionStorage.getItem('tuneData')

        if (raw && rawTune) {
          const analysisResult = JSON.parse(raw) as AnalysisResult
          const tuneData = JSON.parse(rawTune) as TuneData
          setData({ analysisResult, tuneData })
          setLoading(false)
          return
        }

        // 2. Fall back to server session if sessionId in URL
        if (sessionId) {
          const res = await fetch(`/api/session/${sessionId}`)
          if (!res.ok) throw new Error('Session not found or expired')
          const session = await res.json()
          // Server returns partial data — reconstruct what we can
          setData({
            analysisResult: {
              sessionId: session.sessionId,
              hardware: session.hardware,
              diagnostics: session.diagnostics ?? [],
              aiAnalysis: session.aiAnalysis ?? {
                summary: 'Analysis data not available.',
                issues: [],
                nextSteps: [],
                safetyWarnings: [],
              },
              summary: {
                fail: (session.diagnostics ?? []).filter((d: DiagnosticResult) => d.status === 'fail').length,
                warn: (session.diagnostics ?? []).filter((d: DiagnosticResult) => d.status === 'warn').length,
                pass: (session.diagnostics ?? []).filter((d: DiagnosticResult) => d.status === 'pass').length,
                info: (session.diagnostics ?? []).filter((d: DiagnosticResult) => d.status === 'info').length,
              },
              turboMapResult: session.turboMapResult ?? null,
            },
            tuneData: { source: 'companion_app', vehicle: session.tuneDataMeta?.vehicle ?? {}, tables: {}, rawFlags: { isForcedInduction: false, hasFlexFuel: false, hasBoostControl: false, detectedInjectorSize_cc: null } },
          })
          setLoading(false)
          return
        }

        setError('No analysis data found. Please upload a file and run the analysis first.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results')
      } finally {
        setLoading(false)
      }
    }

    loadResults()
  }, [sessionId])

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="h-14 border-b border-border bg-card/50" />
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-pulse">
          {/* Tabs skeleton */}
          <div className="flex gap-2">
            {[80, 96, 80, 80, 72].map((w, i) => (
              <div key={i} className="h-9 rounded-md bg-muted" style={{ width: w }} />
            ))}
          </div>
          {/* Diagnostics grid skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="h-64 rounded-xl bg-muted" />
            <div className="lg:col-span-2 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md space-y-4">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto" />
          <h2 className="text-xl font-bold">No results found</h2>
          <p className="text-sm text-muted-foreground">{error ?? 'Analysis data not available.'}</p>
          <Button onClick={() => router.push('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Upload a file
          </Button>
        </div>
      </main>
    )
  }

  const { analysisResult, tuneData } = data
  const { hardware, diagnostics, aiAnalysis, turboMapResult } = analysisResult
  const hasTurbo = !!turboMapResult

  return (
    <ErrorBoundary>
      <DisclaimerBanner />

      <main className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-bold hidden sm:block">HP Tuners AI Tune Advisor</span>
            </div>

            <div className="flex items-center gap-2">
              {tuneData.vehicle.platform && (
                <Badge variant="outline" className="text-xs hidden md:flex">
                  {tuneData.vehicle.platform}
                </Badge>
              )}
              {hasTurbo && (
                <Badge variant="secondary" className="text-xs text-blue-400">
                  Turbo baseline generated
                </Badge>
              )}
              <div className="flex items-center gap-1">
                {analysisResult.summary.fail > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {analysisResult.summary.fail} fail
                  </Badge>
                )}
                {analysisResult.summary.warn > 0 && (
                  <Badge variant="secondary" className="text-xs text-yellow-400">
                    {analysisResult.summary.warn} warn
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Turbo warnings banner */}
        {hasTurbo && turboMapResult.warnings.length > 0 && (
          <div className="max-w-7xl mx-auto px-4 pt-4">
            <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-1">
              <p className="text-xs font-medium text-blue-400">Map generator notes:</p>
              {turboMapResult.warnings.slice(0, 4).map((w, i) => (
                <p key={i} className="text-xs text-blue-400/80 leading-relaxed">• {w}</p>
              ))}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Tabs defaultValue="diagnostics">
            <TabsList className="mb-6 flex-wrap h-auto gap-1">
              <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
              <TabsTrigger value="tables">Table Viewer</TabsTrigger>
              <TabsTrigger value="ai">AI Analysis</TabsTrigger>
              <TabsTrigger value="next-steps">Next Steps</TabsTrigger>
              <TabsTrigger value="download">Download</TabsTrigger>
            </TabsList>

            {/* Diagnostics tab */}
            <TabsContent value="diagnostics">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                  <DiagnosticSummaryCard diagnostics={diagnostics} />
                </div>
                <div className="lg:col-span-2">
                  <IssueList diagnostics={diagnostics} />
                </div>
              </div>
            </TabsContent>

            {/* Table viewer tab */}
            <TabsContent value="tables">
              <TableViewer
                originalVE={tuneData.tables.VE}
                originalSpark={tuneData.tables.spark}
                modifiedVE={turboMapResult?.modifiedTuneData.tables.VE}
                modifiedSpark={turboMapResult?.modifiedTuneData.tables.spark}
                modifications={turboMapResult?.modifications}
              />
            </TabsContent>

            {/* AI analysis tab */}
            <TabsContent value="ai">
              <AIAnalysisSummary analysis={aiAnalysis} />
            </TabsContent>

            {/* Next steps tab */}
            <TabsContent value="next-steps">
              <NextStepsChecklist steps={aiAnalysis.nextSteps} />
            </TabsContent>

            {/* Download tab */}
            <TabsContent value="download">
              <DownloadSection
                vehicle={tuneData.vehicle}
                hardware={hardware}
                diagnostics={diagnostics}
                aiAnalysis={aiAnalysis}
                originalTables={tuneData.tables}
                modifiedTables={turboMapResult?.modifiedTuneData.tables}
                modifications={turboMapResult?.modifications}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </ErrorBoundary>
  )
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background">
          <div className="h-14 border-b border-border bg-card/50" />
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-pulse">
            <div className="flex gap-2">
              {[80, 96, 80, 80, 72].map((w, i) => (
                <div key={i} className="h-9 rounded-md bg-muted" style={{ width: w }} />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-64 rounded-xl bg-muted" />
              <div className="lg:col-span-2 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-muted" />
                ))}
              </div>
            </div>
          </div>
        </main>
      }
    >
      <ResultsInner />
    </Suspense>
  )
}
